import type {
  LearningContext,
  PreferenceMemory,
  SelectedMemory,
} from "./types";

const DEFAULT_TOKEN_BUDGET = 1_200;

function serializeContent(content: PreferenceMemory["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function keywords(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_]{3,}/gu)
      ?.filter((word) => !["the", "and", "for", "that", "this", "with"].includes(word)) ?? [],
  );
}

function similarity(left: string, right: string): number {
  const a = keywords(left);
  const b = keywords(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

function recencyScore(isoDate: string, now: Date): number {
  const ageMs = Math.max(0, now.getTime() - new Date(isoDate).getTime());
  const ageDays = ageMs / 86_400_000;
  return Math.exp(-ageDays / 90);
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function scoredMemory(memory: PreferenceMemory, brief: string, now: Date): SelectedMemory {
  const content = serializeContent(memory.content);
  const topic = memory.brief ? similarity(memory.brief, brief) : similarity(content, brief);
  const score = memory.weight * 0.55 + topic * 0.3 + recencyScore(memory.updatedAt ?? memory.createdAt, now) * 0.15;
  return { id: memory.id, content, score };
}

/** Selects only memories owned by the current user and voice profile. */
export function selectLearningContext(
  memories: PreferenceMemory[],
  options: {
    userId: string;
    voiceProfileId: string;
    brief: string;
    tokenBudget?: number;
    now?: Date;
  },
): LearningContext {
  const now = options.now ?? new Date();
  const eligible = memories
    .filter(
      (memory) =>
        memory.active &&
        memory.userId === options.userId &&
        memory.voiceProfileId === options.voiceProfileId,
    )
    .map((memory) => ({ memory, selected: scoredMemory(memory, options.brief, now) }))
    .sort((left, right) => right.selected.score - left.selected.score);

  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  let remaining = budget;
  const positiveExamples: SelectedMemory[] = [];
  const preferences: SelectedMemory[] = [];
  const negativeRules: SelectedMemory[] = [];

  for (const { memory, selected } of eligible) {
    const cost = estimateTokens(selected.content);
    if (cost > remaining) continue;

    let target: SelectedMemory[] | undefined;
    let maximum = 0;
    if (memory.kind === "positive_example") {
      target = positiveExamples;
      maximum = 3;
    } else if (["preference", "edit_pattern", "aggregate_summary"].includes(memory.kind)) {
      target = preferences;
      maximum = 2;
    } else if (memory.kind === "negative_rule") {
      target = negativeRules;
      maximum = 3;
    }

    if (!target || target.length >= maximum) continue;
    target.push(selected);
    remaining -= cost;
  }

  return {
    positiveExamples,
    preferences,
    negativeRules,
    estimatedTokens: budget - remaining,
  };
}
