import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig, MissingSupabaseConfigurationError } from "./config";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  let config: ReturnType<typeof getSupabasePublicConfig>;
  try {
    config = getSupabasePublicConfig();
  } catch (error) {
    if (error instanceof MissingSupabaseConfigurationError) {
      return NextResponse.next({ request });
    }
    throw error;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser validates the token with Supabase Auth and refreshes it when needed.
  await supabase.auth.getUser();
  return response;
}
