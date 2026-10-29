import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  X_BEARER_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse(process.env);
}

export function requireEnvironment(
  key: keyof Pick<
    ServerEnvironment,
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY"
    | "OPENAI_API_KEY"
    | "X_BEARER_TOKEN"
  >,
): string {
  const value = getServerEnvironment()[key];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${key}`);
  }
  return value;
}
