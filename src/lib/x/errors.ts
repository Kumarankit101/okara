export const xProviderErrorCodes = [
  "INVALID_HANDLE",
  "MISSING_CREDENTIAL",
  "AUTHENTICATION_FAILED",
  "ACCESS_DENIED",
  "USER_NOT_FOUND",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "NETWORK_ERROR",
  "INVALID_RESPONSE",
] as const;

export type XProviderErrorCode = (typeof xProviderErrorCodes)[number];

const safeMessages: Record<XProviderErrorCode, string> = {
  INVALID_HANDLE: "Enter a valid X handle.",
  MISSING_CREDENTIAL:
    "X profile import is not configured. Use pasted writing samples instead.",
  AUTHENTICATION_FAILED:
    "X profile import is temporarily unavailable because its credentials were rejected.",
  ACCESS_DENIED: "X did not allow access to this profile.",
  USER_NOT_FOUND: "That X profile could not be found.",
  RATE_LIMITED: "X is receiving too many requests. Try again later.",
  UPSTREAM_UNAVAILABLE: "X is temporarily unavailable. Try again later.",
  TIMEOUT: "X took too long to respond. Try again.",
  NETWORK_ERROR: "X could not be reached. Check the connection and try again.",
  INVALID_RESPONSE: "X returned an unexpected response.",
};

export class XProviderError extends Error {
  readonly code: XProviderErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: XProviderErrorCode,
    options: {
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(safeMessages[code], { cause: options.cause });
    this.name = "XProviderError";
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.retryable = options.retryable ?? defaultRetryability(code);
  }
}

function defaultStatus(code: XProviderErrorCode): number {
  switch (code) {
    case "INVALID_HANDLE":
      return 400;
    case "MISSING_CREDENTIAL":
      return 503;
    case "AUTHENTICATION_FAILED":
      return 502;
    case "ACCESS_DENIED":
      return 403;
    case "USER_NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "TIMEOUT":
      return 504;
    case "NETWORK_ERROR":
    case "UPSTREAM_UNAVAILABLE":
    case "INVALID_RESPONSE":
      return 502;
  }
}

function defaultRetryability(code: XProviderErrorCode): boolean {
  return [
    "RATE_LIMITED",
    "UPSTREAM_UNAVAILABLE",
    "TIMEOUT",
    "NETWORK_ERROR",
  ].includes(code);
}

