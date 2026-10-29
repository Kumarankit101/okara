import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient } from "./server";

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";
  readonly status = 401;

  constructor() {
    super("You must be signed in to continue.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (
      error.name === "AuthSessionMissingError" ||
      error.message.toLowerCase().includes("auth session missing")
    ) {
      return null;
    }
    throw error;
  }

  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationRequiredError();
  return user;
}
