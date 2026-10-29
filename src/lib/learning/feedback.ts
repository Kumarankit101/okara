import type { FeedbackInput } from "@/lib/contracts";

import type { PreferenceSummary } from "./types";

const FEEDBACK_WEIGHTS: Record<FeedbackInput["eventType"], number> = {
  selected: 1,
  edited: 1,
  saved: 0.8,
  copied: 0.7,
  liked: 0.6,
  disliked: -0.8,
  dismissed: -1,
};

export function feedbackWeight(eventType: FeedbackInput["eventType"]): number {
  return FEEDBACK_WEIGHTS[eventType];
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function firstPhrase(value: string): string {
  return value.trim().split(/[.!?\n]/, 1)[0]?.slice(0, 80) ?? "";
}

/** Derives transparent, deterministic tendencies from a single accepted edit. */
export function deriveEditPatterns(original: string, edited: string): string[] {
  const before = original.trim();
  const after = edited.trim();
  if (!before || !after || before === after) return [];

  const patterns: string[] = [];
  const lengthRatio = Array.from(after).length / Math.max(Array.from(before).length, 1);
  if (lengthRatio <= 0.8) patterns.push("Prefer substantially shorter drafts");
  if (lengthRatio >= 1.2) patterns.push("Prefer more developed drafts");

  const beforeHashtags = countMatches(before, /(^|\s)#[\p{L}\p{N}_]+/gu);
  const afterHashtags = countMatches(after, /(^|\s)#[\p{L}\p{N}_]+/gu);
  if (afterHashtags < beforeHashtags) patterns.push("Use fewer hashtags");
  if (afterHashtags > beforeHashtags) patterns.push("Use more hashtags");

  const emojiPattern = /\p{Extended_Pictographic}/gu;
  const beforeEmoji = countMatches(before, emojiPattern);
  const afterEmoji = countMatches(after, emojiPattern);
  if (afterEmoji < beforeEmoji) patterns.push("Use fewer emoji");
  if (afterEmoji > beforeEmoji) patterns.push("Use more emoji");

  if (countMatches(after, /!/g) < countMatches(before, /!/g)) {
    patterns.push("Use fewer exclamation marks");
  }
  if (countMatches(after, /\?/g) > countMatches(before, /\?/g)) {
    patterns.push("Use more question-led framing");
  }
  if (firstPhrase(before) !== firstPhrase(after)) {
    patterns.push(`Prefer openings like: ${firstPhrase(after)}`);
  }
  return [...new Set(patterns)].slice(0, 8);
}

function tendency(delta: number): "more" | "same" | "less" {
  if (delta > 0) return "more";
  if (delta < 0) return "less";
  return "same";
}

function retainEstablishedTendency(
  next: "more" | "same" | "less",
  current: "more" | "same" | "less" | "unknown" | undefined,
): "more" | "same" | "less" | "unknown" {
  return next === "same" && current && current !== "unknown" ? current : next;
}

/** Updates a compact preference summary without sending feedback to a model. */
export function updatePreferenceSummary(
  current: PreferenceSummary | undefined,
  original: string,
  edited: string,
  rejectedReasons: string[] = [],
): PreferenceSummary {
  const beforeLength = Array.from(original).length;
  const afterLength = Array.from(edited).length;
  const lengthDelta = afterLength - beforeLength;
  const patterns = deriveEditPatterns(original, edited);
  const opening = firstPhrase(edited);

  return {
    preferredLength:
      Math.abs(lengthDelta) < Math.max(10, beforeLength * 0.1)
        ? "similar"
        : lengthDelta < 0
          ? "shorter"
          : "longer",
    openingStyle: [
      ...(opening ? [opening] : []),
      ...(current?.openingStyle ?? []),
    ].slice(0, 5),
    punctuation: [
      ...patterns.filter((pattern) => /question|exclamation/i.test(pattern)),
      ...(current?.punctuation ?? []),
    ].slice(0, 5),
    emojiPreference: retainEstablishedTendency(
      tendency(
        countMatches(edited, /\p{Extended_Pictographic}/gu) -
          countMatches(original, /\p{Extended_Pictographic}/gu),
      ),
      current?.emojiPreference,
    ),
    hashtagPreference: retainEstablishedTendency(
      tendency(
        countMatches(edited, /(^|\s)#[\p{L}\p{N}_]+/gu) -
          countMatches(original, /(^|\s)#[\p{L}\p{N}_]+/gu),
      ),
      current?.hashtagPreference,
    ),
    confidence: current?.confidence ?? "unknown",
    avoid: [...new Set([...rejectedReasons, ...(current?.avoid ?? [])])].slice(0, 10),
    observations: (current?.observations ?? 0) + 1,
  };
}
