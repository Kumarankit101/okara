"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabasePublicConfig();
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}

export const createBrowserSupabaseClient = createClient;
