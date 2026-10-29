export type AIErrorCode =
  | "missing_api_key"
  | "refusal"
  | "incomplete_response"
  | "invalid_output"
  | "timeout"
  | "rate_limited"
  | "authentication_failed"
  | "provider_error";

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly providerStatus?: number;

  constructor(
    code: AIErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      providerStatus?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AIProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.providerStatus = options.providerStatus;
  }
}
