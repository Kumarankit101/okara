import { ZodError } from "zod";

import { AIProviderError } from "@/lib/ai";
import { AuthenticationRequiredError } from "@/lib/supabase";
import { XProviderError } from "@/lib/x";

import { apiError } from "./api-response";

export function routeErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return apiError(400, "INVALID_INPUT", "Check the submitted fields and try again.", error.flatten());
  }
  if (error instanceof AuthenticationRequiredError) {
    return apiError(401, error.code, error.message);
  }
  if (error instanceof XProviderError) {
    return apiError(error.status, error.code, error.message);
  }
  if (error instanceof AIProviderError) {
    const status =
      error.code === "rate_limited"
        ? 429
        : error.code === "timeout"
          ? 504
          : error.code === "refusal"
            ? 422
            : error.code === "missing_api_key" || error.code === "authentication_failed"
              ? 503
              : 502;
    return apiError(status, error.code.toUpperCase(), error.message);
  }
  return apiError(500, "INTERNAL_ERROR", "The request could not be completed.");
}
