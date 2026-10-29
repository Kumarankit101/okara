import { describe, expect, it } from "vitest";

import {
  deriveEditPatterns,
  feedbackWeight,
  updatePreferenceSummary,
} from "./feedback";
import { selectLearningContext } from "./memory";
import type { PreferenceMemory } from "./types";

describe("feedback learning", () => {
  it("assigns stronger weight to explicit selection than passive copy", () => {
    expect(feedbackWeight("selected")).toBeGreaterThan(feedbackWeight("copied"));
    expect(feedbackWeight("disliked")).toBeLessThan(0);
  });

  it("derives transparent patterns from a substantial edit", () => {
    const patterns = deriveEditPatterns(
      "This is a very long opening! It has extra detail #launch 🚀",
      "A clearer launch.",
    );
    expect(patterns).toContain("Prefer substantially shorter drafts");
    expect(patterns).toContain("Use fewer hashtags");
    expect(patterns).toContain("Use fewer emoji");
    expect(patterns).toContain("Use fewer exclamation marks");
  });

  it("updates an inspectable aggregate summary", () => {
    const summary = updatePreferenceSummary(
      undefined,
      "A longer draft with padding #one",
      "Short and useful.",
      ["too_promotional"],
    );
    expect(summary.preferredLength).toBe("shorter");
    expect(summary.hashtagPreference).toBe("less");
    expect(summary.avoid).toContain("too_promotional");
    expect(summary.observations).toBe(1);
  });
});

describe("memory retrieval", () => {
  const base: Omit<PreferenceMemory, "id" | "kind" | "content"> = {
    userId: "user-a",
    voiceProfileId: "voice-a",
    weight: 1,
    active: true,
    createdAt: "2026-10-28T00:00:00.000Z",
  };

  const memory = (
    id: string,
    kind: PreferenceMemory["kind"],
    content: string,
    overrides: Partial<PreferenceMemory> = {},
  ): PreferenceMemory => ({ ...base, id, kind, content, ...overrides });

  it("enforces user/profile isolation and category caps", () => {
    const memories: PreferenceMemory[] = [
      ...Array.from({ length: 5 }, (_, index) =>
        memory(`positive-${index}`, "positive_example", `Product feedback example ${index}`),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        memory(`preference-${index}`, "preference", `Preference ${index}`),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        memory(`negative-${index}`, "negative_rule", `Avoid pattern ${index}`),
      ),
      memory("other-user", "positive_example", "Must never leak", { userId: "user-b" }),
      memory("other-profile", "positive_example", "Must never leak either", {
        voiceProfileId: "voice-b",
      }),
    ];
    const context = selectLearningContext(memories, {
      userId: "user-a",
      voiceProfileId: "voice-a",
      brief: "Product feedback",
      now: new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(context.positiveExamples).toHaveLength(3);
    expect(context.preferences).toHaveLength(2);
    expect(context.negativeRules).toHaveLength(3);
    expect(JSON.stringify(context)).not.toContain("Must never leak");
  });

  it("respects the prompt token budget", () => {
    const context = selectLearningContext(
      [memory("large", "positive_example", "x".repeat(400))],
      {
        userId: "user-a",
        voiceProfileId: "voice-a",
        brief: "anything",
        tokenBudget: 50,
      },
    );
    expect(context.positiveExamples).toHaveLength(0);
    expect(context.estimatedTokens).toBe(0);
  });

  it("ranks a topic-relevant memory ahead of an unrelated one", () => {
    const context = selectLearningContext(
      [
        memory("unrelated", "positive_example", "A travel story", { weight: 0.5 }),
        memory("relevant", "positive_example", "A product feedback lesson", {
          weight: 0.5,
          brief: "product feedback workflow",
        }),
      ],
      {
        userId: "user-a",
        voiceProfileId: "voice-a",
        brief: "better product feedback",
        now: new Date("2026-10-29T00:00:00.000Z"),
      },
    );
    expect(context.positiveExamples[0]?.id).toBe("relevant");
  });
});
