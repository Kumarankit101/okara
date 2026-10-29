import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { styleProfileSchema } from "@/lib/contracts";

import { OpenAIResponsesProvider } from "./openai-provider";

vi.mock("server-only", () => ({}));

function clientReturning(value: unknown): OpenAI {
  return {
    responses: { parse: vi.fn().mockResolvedValue(value) },
  } as unknown as OpenAI;
}

const request = {
  schema: styleProfileSchema,
  schemaName: "style",
  instructions: "Analyze style",
  input: "samples",
};

describe("OpenAIResponsesProvider", () => {
  it("maps explicit refusals", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test",
      client: clientReturning({
        id: "resp_refusal",
        model: "test",
        status: "completed",
        output_parsed: null,
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "Cannot comply" }],
          },
        ],
      }),
    });
    await expect(provider.parse(request)).rejects.toMatchObject({ code: "refusal" });
  });

  it("maps incomplete responses as retryable", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test",
      client: clientReturning({
        id: "resp_incomplete",
        model: "test",
        status: "incomplete",
        output_parsed: null,
        output: [],
      }),
    });
    await expect(provider.parse(request)).rejects.toMatchObject({
      code: "incomplete_response",
      retryable: true,
    });
  });

  it("maps a completed response with no parsed output", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test",
      client: clientReturning({
        id: "resp_invalid",
        model: "test",
        status: "completed",
        output_parsed: null,
        output: [],
      }),
    });
    await expect(provider.parse(request)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps provider timeouts as retryable", async () => {
    const client = {
      responses: {
        parse: vi.fn().mockRejectedValue(new OpenAI.APIConnectionTimeoutError()),
      },
    } as unknown as OpenAI;
    const provider = new OpenAIResponsesProvider({ apiKey: "test", client });
    await expect(provider.parse(request)).rejects.toMatchObject({
      code: "timeout",
      retryable: true,
    });
  });

  it("maps rate limiting without leaking the provider body", async () => {
    const client = {
      responses: {
        parse: vi
          .fn()
          .mockRejectedValue(
            new OpenAI.RateLimitError(
              429,
              { message: "private provider detail" },
              undefined,
              new Headers(),
            ),
          ),
      },
    } as unknown as OpenAI;
    const provider = new OpenAIResponsesProvider({ apiKey: "test", client });
    const error = await provider.parse(request).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "rate_limited", retryable: true });
    expect(String(error)).not.toContain("private provider detail");
  });
});
