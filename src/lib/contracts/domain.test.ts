import { describe, expect, it } from "vitest";

import {
  feedbackInputSchema,
  generationOutputSchema,
  handleSchema,
  pastedSamplesSchema,
  profileSettingsSchema,
  updateVoiceProfileSchema,
} from "./domain";

describe("shared domain contracts", () => {
  it("normalizes an X handle", () => {
    expect(handleSchema.parse(" @okara_ai ")).toBe("okara_ai");
  });

  it("requires at least three pasted samples", () => {
    expect(() => pastedSamplesSchema.parse(["one sample", "two sample"])).toThrow();
  });

  it("requires exactly five generated drafts", () => {
    expect(() => generationOutputSchema.parse({ drafts: [] })).toThrow();
  });

  it("requires authorization only when voice source samples change", () => {
    const base = {
      id: "9b51f3d8-4c1e-4f34-8107-74b1983bd55c",
      displayName: "Curated voice",
    };
    expect(updateVoiceProfileSchema.parse(base)).toEqual(base);
    expect(() =>
      updateVoiceProfileSchema.parse({
        ...base,
        samples: ["First long sample.", "Second long sample.", "Third long sample."],
      }),
    ).toThrow();
    expect(
      updateVoiceProfileSchema.parse({
        ...base,
        samples: ["First long sample.", "Second long sample.", "Third long sample."],
        authorizationConfirmed: true,
      }),
    ).toMatchObject({ authorizationConfirmed: true });
  });

  it("normalizes and bounds a profile display name", () => {
    expect(profileSettingsSchema.parse({ displayName: "  Ankit  " })).toEqual({
      displayName: "Ankit",
    });
    expect(() => profileSettingsSchema.parse({ displayName: "" })).toThrow();
    expect(() =>
      profileSettingsSchema.parse({ displayName: "a".repeat(81) }),
    ).toThrow();
  });

  it("requires idempotent, explicit negative feedback", () => {
    const base = {
      draftId: "8c729106-7aaf-490d-8973-e119bb144e01",
      clientEventId: "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71",
    };
    expect(() =>
      feedbackInputSchema.parse({ ...base, eventType: "disliked" }),
    ).toThrow();
    expect(
      feedbackInputSchema.parse({
        ...base,
        eventType: "disliked",
        reasonCode: "too_soft",
      }),
    ).toMatchObject({ active: true, reasonCode: "too_soft" });
  });

  it("allows feedback toggles but not copy undo", () => {
    const base = {
      draftId: "8c729106-7aaf-490d-8973-e119bb144e01",
      clientEventId: "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71",
    };
    expect(
      feedbackInputSchema.parse({ ...base, eventType: "saved", active: false }),
    ).toMatchObject({ active: false });
    expect(() =>
      feedbackInputSchema.parse({ ...base, eventType: "copied", active: false }),
    ).toThrow();
  });
});
