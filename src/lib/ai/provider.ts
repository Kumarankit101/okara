import type { z } from "zod";

export interface StructuredAIRequest<TSchema extends z.ZodType> {
  schema: TSchema;
  schemaName: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StructuredAIResult<T> {
  data: T;
  responseId: string;
  model: string;
  usage: AIUsage | null;
}

/**
 * Narrow, injectable boundary used by application services and tests.
 * The production implementation is server-only and backed by Responses API.
 */
export interface StructuredAIProvider {
  parse<TSchema extends z.ZodType>(
    request: StructuredAIRequest<TSchema>,
  ): Promise<StructuredAIResult<z.infer<TSchema>>>;
}
