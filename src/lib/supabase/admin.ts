import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | undefined;

export function createAdminClient() {
  if (adminClient) return adminClient;

  const { url } = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing required server environment variable: SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  adminClient = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return adminClient;
}
