import { describe, expect, it } from "vitest";

import {
  getSupabasePublicConfig,
  MissingSupabaseConfigurationError,
} from "./config";
import { sanitizeRedirectPath } from "./redirect";

describe("Supabase configuration", () => {
  it("returns explicit public configuration", () => {
    expect(
      getSupabasePublicConfig({
        url: "https://project.supabase.co",
        anonKey: "publishable-key",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      anonKey: "publishable-key",
    });
  });

  it("fails lazily when the URL is missing", () => {
    expect(() =>
      getSupabasePublicConfig({ url: undefined, anonKey: "publishable-key" }),
    ).toThrow(MissingSupabaseConfigurationError);
  });

  it("fails lazily when the key is missing", () => {
    expect(() =>
      getSupabasePublicConfig({
        url: "https://project.supabase.co",
        anonKey: undefined,
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});

describe("sanitizeRedirectPath", () => {
  it("allows local paths with query strings and fragments", () => {
    expect(sanitizeRedirectPath("/history?filter=saved")).toBe(
      "/history?filter=saved",
    );
    expect(sanitizeRedirectPath("/dashboard#drafts")).toBe(
      "/dashboard#drafts",
    );
  });

  it("blocks absolute and scheme-relative redirects", () => {
    expect(sanitizeRedirectPath("https://evil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("mailto:owner@evil.example")).toBe(
      "/dashboard",
    );
  });

  it("blocks browser-normalized backslash redirects", () => {
    expect(sanitizeRedirectPath("/\\evil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/folder\\evil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/%5cevil.example")).toBe("/dashboard");
  });

  it("blocks encoded and double-encoded scheme-relative redirects", () => {
    expect(sanitizeRedirectPath("/%2f%2fevil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/%252f%252fevil.example")).toBe(
      "/dashboard",
    );
    expect(sanitizeRedirectPath("/%255c%255cevil.example")).toBe(
      "/dashboard",
    );
  });

  it("blocks control characters and malformed encoding", () => {
    expect(sanitizeRedirectPath("/\u0000evil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/%0aevil.example")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/%not-hex")).toBe("/dashboard");
  });

  it("uses only a safe app-relative fallback", () => {
    expect(sanitizeRedirectPath(null, "/history")).toBe("/history");
    expect(sanitizeRedirectPath(null, "https://evil.example")).toBe(
      "/dashboard",
    );
  });
});
