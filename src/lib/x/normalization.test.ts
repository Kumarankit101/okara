import { describe, expect, it } from "vitest";

import {
  normalizePastedSamples,
  normalizeSampleText,
  normalizeXPosts,
  sourceExpiresAt,
} from "./normalization";
import type { XPostPayload } from "./schemas";

function post(
  id: string,
  text: string,
  createdAt: string,
  overrides: Partial<XPostPayload> = {},
): XPostPayload {
  return {
    id,
    text,
    created_at: createdAt,
    ...overrides,
  };
}

describe("X source normalization", () => {
  it("preserves voice signals while replacing URLs and transport whitespace", () => {
    expect(
      normalizeSampleText(
        "  THIS   is deliberate!!! 🚀\r\n\r\n\r\nRead: https://example.com/a?q=1  ",
      ),
    ).toBe("THIS is deliberate!!! 🚀\n\nRead: [link]");
  });

  it("normalizes pasted samples and removes exact and conservative duplicates", () => {
    const samples = normalizePastedSamples([
      "Short ideas can still carry a strong point.",
      "Short ideas can still carry a strong point. https://one.example",
      "A medium-length observation gives the reader enough context to understand why the idea matters today.",
      "This is a longer sample with enough detail to represent a different writing rhythm. It uses multiple sentences, gives the reader context, and closes with a concrete observation about the work.",
    ]);

    expect(samples).toHaveLength(3);
    expect(samples.map((sample) => sample.text)).toContain(
      "Short ideas can still carry a strong point.",
    );
  });

  it("requires three distinct useful samples after cleaning", () => {
    expect(() =>
      normalizePastedSamples([
        "The same authored sample appears more than once.",
        "The same authored sample appears more than once.",
        "The same authored sample appears more than once.",
      ]),
    ).toThrow("three distinct, authored writing samples");
  });

  it("filters replies, retweets, quoted-only text, and unusably short posts", () => {
    const samples = normalizeXPosts([
      post("1", "RT @someone: borrowed words are not a style sample", "2026-01-04T00:00:00.000Z"),
      post("2", "This is an authored reply that should be ignored.", "2026-01-03T00:00:00.000Z", {
        referenced_tweets: [{ type: "replied_to", id: "99" }],
      }),
      post("3", "> quoted words only and nothing authored", "2026-01-02T00:00:00.000Z"),
      post("4", "too tiny", "2026-01-01T00:00:00.000Z"),
      post("5", "An original thought worth keeping. ✨", "2026-01-05T00:00:00.000Z"),
    ]);

    expect(samples).toEqual([
      {
        sourceId: "5",
        text: "An original thought worth keeping. ✨",
        createdAt: "2026-01-05T00:00:00.000Z",
        lang: null,
      },
    ]);
  });

  it("caps output at 30 representative samples", () => {
    const posts = Array.from({ length: 45 }, (_, index) =>
      post(
        String(index),
        `${"A".repeat((index % 3) * 100)} Original sample number ${index} has enough words to remain useful.`,
        new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      ),
    );

    const normalized = normalizeXPosts(posts, 100);
    expect(normalized).toHaveLength(30);
    expect(new Set(normalized.map((sample) => sample.sourceId)).size).toBe(30);
  });

  it("produces a 23-hour expiry to leave cleanup scheduling headroom", () => {
    expect(sourceExpiresAt(new Date("2026-10-29T00:00:00.000Z"))).toBe(
      "2026-10-29T23:00:00.000Z",
    );
  });
});

