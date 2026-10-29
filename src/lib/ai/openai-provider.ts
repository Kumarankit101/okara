import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { getServerEnvironment } from "@/lib/env/server";

import { AIProviderError } from "./errors";
import type {
  StructuredAIProvider,
  StructuredAIRequest,
  StructuredAIResult,
} from "./provider";

const DEFAULT_TIMEOUT_MS = 30_000;

function findRefusal(response: {
  output: Array<{
    type: string;
    content?: Array<{ type: string; refusal?: string }>;
  }>;
}): string | null {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "refusal") return content.refusal ?? "Request refused";
    }
  }
  return null;
}

function mapOpenAIError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIProviderError("timeout", "The writing service timed out.", {
      retryable: true,
      cause: error,
    });
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AIProviderError(
      "rate_limited",
      "The writing service is temporarily busy. Please retry shortly.",
      { retryable: true, providerStatus: error.status, cause: error },
    );
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return new AIProviderError(
      "authentication_failed",
      "The writing service is not configured correctly.",
      { providerStatus: error.status, cause: error },
    );
  }
  if (error instanceof OpenAI.APIError) {
    return new AIProviderError(
      "provider_error",
      "The writing service could not complete the request.",
      {
        retryable: error.status === undefined || error.status >= 500,
        providerStatus: error.status,
        cause: error,
      },
    );
  }
  return new AIProviderError(
    "provider_error",
    "The writing service returned an unexpected error.",
    { cause: error },
  );
}

export class OpenAIResponsesProvider implements StructuredAIProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    client?: OpenAI;
  }) {
    this.model = options.model ?? "gpt-5.6-terra";
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxRetries: 2,
      });
  }

  async parse<TSchema extends z.ZodType>(
    request: StructuredAIRequest<TSchema>,
  ): Promise<StructuredAIResult<z.infer<TSchema>>> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: request.instructions,
        input: request.input,
        reasoning: { effort: "low" },
        max_output_tokens: request.maxOutputTokens ?? 2_000,
        metadata: request.metadata,
        store: false,
        text: {
          format: zodTextFormat(request.schema, request.schemaName),
        },
      });

      const refusal = findRefusal(response);
      if (refusal) {
        throw new AIProviderError("refusal", refusal);
      }
      if (response.status !== "completed") {
        throw new AIProviderError(
          "incomplete_response",
          "The writing service returned an incomplete response.",
          { retryable: true },
        );
      }
      if (response.output_parsed === null) {
        throw new AIProviderError(
          "invalid_output",
          "The writing service returned an invalid structured response.",
        );
      }

      // Re-validate at our boundary. The SDK's structural Zod helper inference is
      // intentionally broader than z.output<TSchema> for generic schemas.
      const data = request.schema.parse(response.output_parsed) as z.infer<TSchema>;

      return {
        data,
        responseId: response.id,
        model: response.model,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : null,
      };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }
}

let provider: OpenAIResponsesProvider | undefined;

/** Lazily creates the production provider so builds do not require a secret. */
export function getOpenAIProvider(): OpenAIResponsesProvider {
  if (provider) return provider;
  const environment = getServerEnvironment();
  if (!environment.OPENAI_API_KEY) {
    throw new AIProviderError(
      "missing_api_key",
      "OpenAI is not configured. Add OPENAI_API_KEY on the server.",
    );
  }
  provider = new OpenAIResponsesProvider({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
  });
  return provider;
}
