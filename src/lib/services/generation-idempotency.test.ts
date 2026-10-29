import { describe, expect, it } from "vitest";

import {
  generationRequestMatches,
  parseGenerationIdempotencyKey,
} from "./generation-idempotency";

const request = {
  voiceProfileId: "45927b15-6f52-4c7b-92c1-3789a437bd4c",
  brief: "Explain why small product improvements matter.",
  objective: "educate" as const,
  toneIntensity: 3,
  characterLimit: 280,
  includeHashtags: false,
};

describe("generation idempotency", () => {
  it("requires a UUID key", () => {
    expect(
      parseGenerationIdempotencyKey("2eb02bc7-41c6-4e45-9a87-2f774865a1db"),
    ).toBe("2eb02bc7-41c6-4e45-9a87-2f774865a1db");
    expect(() => parseGenerationIdempotencyKey(null)).toThrow();
    expect(() => parseGenerationIdempotencyKey("shared-key")).toThrow();
  });

  it("matches an equivalent JSONB request regardless of key order", () => {
    expect(
      generationRequestMatches({
        existing: {
          voiceProfileId: request.voiceProfileId,
          brief: request.brief,
          constraints: {
            characterLimit: 280,
            toneIntensity: 3,
            objective: "educate",
            includeHashtags: false,
            brief: request.brief,
            voiceProfileId: request.voiceProfileId,
          },
        },
        request,
      }),
    ).toBe(true);
  });

  it("rejects key reuse for a different request", () => {
    expect(
      generationRequestMatches({
        existing: {
          voiceProfileId: request.voiceProfileId,
          brief: "A different brief that is also long enough.",
          constraints: request,
        },
        request,
      }),
    ).toBe(false);
  });
});
