import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithPassword, signUp } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword, signUp },
  })),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({ NEXT_PUBLIC_APP_URL: "https://okara.example" }),
}));

import { POST } from "./route";

function authRequest(body: Record<string, unknown>) {
  return new Request("https://okara.example/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("password authentication route", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signUp.mockReset();
  });

  it("creates a password session for confirmed credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "server-cookie-session" } },
      error: null,
    });

    const response = await POST(
      authRequest({
        mode: "signin",
        email: "writer@example.com",
        password: "writing123",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "signed_in",
      redirectTo: "/dashboard",
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "writer@example.com",
      password: "writing123",
    });
  });

  it("requires email confirmation before password sign-in", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "email_not_confirmed", status: 400 },
    });

    const response = await POST(
      authRequest({
        mode: "signin",
        email: "writer@example.com",
        password: "writing123",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "EMAIL_NOT_CONFIRMED" },
    });
  });

  it("registers without creating a session and requests confirmation", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-id" }, session: null },
      error: null,
    });

    const response = await POST(
      authRequest({
        mode: "signup",
        displayName: "Ankit",
        email: "writer@example.com",
        password: "writing123",
        confirmPassword: "writing123",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "confirmation_required" });
    expect(signUp).toHaveBeenCalledWith({
      email: "writer@example.com",
      password: "writing123",
      options: {
        emailRedirectTo: "https://okara.example/auth/callback?next=/dashboard",
        data: { full_name: "Ankit", name: "Ankit" },
      },
    });
  });
});
