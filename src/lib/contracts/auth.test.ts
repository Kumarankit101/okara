import { describe, expect, it } from "vitest";

import { passwordAuthRequestSchema } from "./auth";

describe("password auth contracts", () => {
  it("normalizes a valid registration", () => {
    expect(
      passwordAuthRequestSchema.parse({
        mode: "signup",
        displayName: "  Ankit  ",
        email: "  writer@example.com ",
        password: "writing123",
        confirmPassword: "writing123",
      }),
    ).toMatchObject({ displayName: "Ankit", email: "writer@example.com" });
  });

  it("rejects weak and mismatched registration passwords", () => {
    expect(() =>
      passwordAuthRequestSchema.parse({
        mode: "signup",
        displayName: "Ankit",
        email: "writer@example.com",
        password: "password",
        confirmPassword: "different1",
      }),
    ).toThrow();
  });

  it("does not impose the new registration policy on existing sign-ins", () => {
    expect(
      passwordAuthRequestSchema.parse({
        mode: "signin",
        email: "writer@example.com",
        password: "legacy",
      }),
    ).toEqual({
      mode: "signin",
      email: "writer@example.com",
      password: "legacy",
    });
  });
});
