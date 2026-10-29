import { type NextRequest, NextResponse } from "next/server";

import { sanitizeRedirectPath } from "@/lib/supabase/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = sanitizeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_auth_code", request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback_failed", request.url),
    );
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
