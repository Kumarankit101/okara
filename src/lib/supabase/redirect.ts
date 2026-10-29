const DEFAULT_REDIRECT_PATH = "/dashboard";
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * A redirect is safe only when every decoded representation remains an
 * app-relative path. Browsers normalize backslashes in special URLs, so a
 * value such as `/\\evil.example` otherwise resolves to another origin.
 */
function isSafeAppRelativePath(value: string): boolean {
  let candidate = value;

  for (let decodingPass = 0; decodingPass < 4; decodingPass += 1) {
    if (
      !candidate.startsWith("/") ||
      candidate.startsWith("//") ||
      CONTROL_OR_BACKSLASH.test(candidate)
    ) {
      return false;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return false;
    }

    if (decoded === candidate) break;
    candidate = decoded;
  }

  try {
    const base = new URL("https://okara.invalid");
    return new URL(value, base).origin === base.origin;
  } catch {
    return false;
  }
}

export function sanitizeRedirectPath(
  value: string | null,
  fallback = DEFAULT_REDIRECT_PATH,
) {
  const safeFallback = isSafeAppRelativePath(fallback)
    ? fallback
    : DEFAULT_REDIRECT_PATH;

  return value && isSafeAppRelativePath(value) ? value : safeFallback;
}
