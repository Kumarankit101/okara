import type { AuthError } from "@supabase/supabase-js";

import { passwordAuthRequestSchema } from "@/lib/contracts";
import { getServerEnvironment } from "@/lib/env/server";
import { apiError } from "@/lib/http/api-response";
import { routeErrorResponse } from "@/lib/http/route-error";
import { createClient } from "@/lib/supabase/server";

function authErrorResponse(error: AuthError) {
  switch (error.code) {
    case "invalid_credentials":
      return apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    case "email_not_confirmed":
      return apiError(
        403,
        "EMAIL_NOT_CONFIRMED",
        "Confirm your email address before signing in.",
      );
    case "weak_password":
      return apiError(
        400,
        "WEAK_PASSWORD",
        "Choose a stronger password with at least eight characters, including a letter and number.",
      );
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return apiError(429, "AUTH_RATE_LIMITED", "Too many attempts. Wait a moment and try again.");
    case "email_address_not_authorized":
      return apiError(
        503,
        "CONFIRMATION_EMAIL_UNAVAILABLE",
        "Confirmation email delivery is not available for this address yet.",
      );
    case "email_provider_disabled":
    case "provider_disabled":
      return apiError(503, "PASSWORD_AUTH_UNAVAILABLE", "Email and password sign-in is unavailable.");
    default:
      return apiError(
        error.status && error.status >= 500 ? 503 : 400,
        "AUTH_REQUEST_FAILED",
        "Authentication could not be completed. Try again.",
      );
  }
}

export async function POST(request: Request) {
  try {
    const input = passwordAuthRequestSchema.parse(await request.json());
    const supabase = await createClient();

    if (input.mode === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error) return authErrorResponse(error);
      if (!data.session) {
        return apiError(401, "SESSION_NOT_CREATED", "Sign-in did not create a session.");
      }
      return Response.json({ status: "signed_in", redirectTo: "/dashboard" });
    }

    const appUrl = getServerEnvironment().NEXT_PUBLIC_APP_URL;
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard`,
        data: { full_name: input.displayName, name: input.displayName },
      },
    });
    if (error) return authErrorResponse(error);

    if (data.session) {
      return Response.json({ status: "signed_in", redirectTo: "/dashboard" }, { status: 201 });
    }

    return Response.json(
      {
        status: "confirmation_required",
        message:
          "Check your inbox and confirm your email address before signing in. If an account already exists, use Sign in instead.",
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
