import { deriveEditPatterns } from "./feedback";

export type MemoryCategory = "example" | "edit" | "insight" | "avoid";

export interface PresentedMemory {
  category: MemoryCategory;
  title: string;
  detail: string;
  evidence?: string;
  tags?: string[];
  before?: string;
  after?: string;
  example?: string;
}

const REASON_LABELS: Record<string, string> = {
  too_generic: "Too generic",
  too_long: "Too long",
  too_short: "Too short",
  wrong_tone: "Wrong tone",
  too_soft: "Too soft",
  too_strong: "Too strong",
  repetitive: "Repetitive",
  inaccurate: "May be inaccurate",
  too_promotional: "Too promotional",
  weak_opening: "Weak opening",
  other: "Another issue",
};

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function observations(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function editEvidence(count: number): string {
  return count === 1 ? "Early signal from 1 edit" : `Based on ${count} edits`;
}

function signalTags(value: unknown): string[] {
  const tags: string[] = [];

  if (Array.isArray(value)) {
    for (const signal of value) {
      if (signal === "copied_edited") tags.push("Copied after editing");
      if (signal === "copied") tags.push("Copied");
      if (signal === "edited") tags.push("Edited");
      if (signal === "selected") tags.push("Selected");
      if (signal === "saved") tags.push("Saved");
      if (signal === "liked") tags.push("Liked");
    }
  } else if (value && typeof value === "object") {
    const signals = value as Record<string, unknown>;
    if (signals.selected === true) tags.push("Selected");
    if (signals.saved === true) tags.push("Saved");
    if (signals.liked === true) tags.push("Liked");
  }

  return [...new Set(tags)];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((item): item is string => Boolean(item));
}

function presentSummary(content: Record<string, unknown>): PresentedMemory[] {
  const count = observations(content.observations);
  const evidence = editEvidence(count);
  const memories: PresentedMemory[] = [];

  const preferredLength = content.preferredLength;
  if (preferredLength === "shorter") {
    memories.push({
      category: "insight",
      title: "Draft length",
      detail: "You tend to shorten drafts when you edit them.",
      evidence,
    });
  } else if (preferredLength === "longer") {
    memories.push({
      category: "insight",
      title: "Draft length",
      detail: "You tend to add more detail when you edit drafts.",
      evidence,
    });
  } else if (preferredLength === "similar") {
    memories.push({
      category: "insight",
      title: "Draft length",
      detail: "You usually keep drafts close to their original length.",
      evidence,
    });
  }

  const stylePreferences: string[] = [];
  if (content.emojiPreference === "less") stylePreferences.push("use fewer emoji");
  if (content.emojiPreference === "more") stylePreferences.push("use more emoji");
  if (content.hashtagPreference === "less") stylePreferences.push("use fewer hashtags");
  if (content.hashtagPreference === "more") stylePreferences.push("use more hashtags");
  if (content.confidence === "softer") stylePreferences.push("soften the wording");
  if (content.confidence === "stronger") stylePreferences.push("make the wording more direct");

  if (stylePreferences.length) {
    memories.push({
      category: "insight",
      title: "Style choices",
      detail: `You tend to ${stylePreferences.join(" and ")} when editing.`,
      evidence,
    });
  }

  return memories;
}

/** Converts internal learning records into plain-language, evidence-backed UI items. */
export function presentMemory(
  kind: string,
  content: Record<string, unknown>,
): PresentedMemory[] {
  if (kind === "positive_example") {
    const preferredText = text(content.text);
    if (!preferredText) return [];
    const tags = signalTags(content.signals);
    return [
      {
        category: "example",
        title: "Example to follow",
        detail: preferredText,
        evidence: tags.length ? undefined : "Marked as useful",
        tags,
      },
    ];
  }

  if (kind === "negative_rule") {
    const reason = text(content.reason);
    const note = text(content.note);
    const label = reason ? (REASON_LABELS[reason] ?? reason) : "Not right for you";
    return [
      {
        category: "avoid",
        title: label,
        detail: note ?? "You asked Okara to avoid drafts with this problem.",
        example: text(content.example),
      },
    ];
  }

  if (kind === "edit_pattern") {
    const before = text(content.original);
    const after = text(content.final);
    const storedPatterns = stringList(content.patterns);
    const tags = storedPatterns.length
      ? storedPatterns
      : before && after
        ? deriveEditPatterns(before, after)
        : [];
    if (!before && !after && !tags.length) return [];
    return [
      {
        category: "edit",
        title: "A rewrite Okara learned from",
        detail: tags.length ? tags.join(" · ") : "You changed this draft before using it.",
        tags,
        before,
        after,
      },
    ];
  }

  if (kind === "aggregate_summary") return presentSummary(content);
  return [];
}
