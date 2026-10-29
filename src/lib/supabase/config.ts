export class MissingSupabaseConfigurationError extends Error {
  readonly code = "SUPABASE_NOT_CONFIGURED";

  constructor(missing: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
    super(`Missing required Supabase environment variable: ${missing}`);
    this.name = "MissingSupabaseConfigurationError";
  }
}

type PublicConfigInput = {
  url?: string;
  anonKey?: string;
};

export function getSupabasePublicConfig(
  input: PublicConfigInput = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
) {
  if (!input.url) {
    throw new MissingSupabaseConfigurationError("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!input.anonKey) {
    throw new MissingSupabaseConfigurationError("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { url: input.url, anonKey: input.anonKey } as const;
}
