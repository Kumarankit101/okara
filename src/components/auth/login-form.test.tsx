// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const replace = vi.fn();
const refresh = vi.fn();

function getCreateAccountSubmit() {
  return screen
    .getAllByRole("button", { name: "Create account" })
    .find((button) => button.getAttribute("type") === "submit")!;
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers password sign-in, account creation, and magic link fallback", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    expect(screen.getByRole("button", { name: "Sign in with password" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByLabelText("Display name")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
  });

  it("signs in with a password and opens the dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "signed_in", redirectTo: "/dashboard" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Work email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "writing123");
    await user.click(screen.getByRole("button", { name: "Sign in with password" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mode: "signin",
          email: "writer@example.com",
          password: "writing123",
        }),
      }),
    );
    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("stops mismatched passwords before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("Display name"), "Ankit");
    await user.type(screen.getByLabelText("Work email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "writing123");
    await user.type(screen.getByLabelText("Confirm password"), "different1");
    await user.click(getCreateAccountSubmit());

    expect(await screen.findByText("Passwords do not match.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the confirmation state after registration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "confirmation_required",
            message: "Check your inbox and confirm your email address before signing in.",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("Display name"), "Ankit");
    await user.type(screen.getByLabelText("Work email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "writing123");
    await user.type(screen.getByLabelText("Confirm password"), "writing123");
    await user.click(getCreateAccountSubmit());

    expect(await screen.findByRole("heading", { name: "Confirm your email" })).toBeTruthy();
    expect(screen.getByText("writer@example.com")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
