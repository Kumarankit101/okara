import type {
  LearningContext,
  MemoryObjective,
  MemoryScoreBreakdown,
  PreferenceMemory,
  PreferenceMemoryKind,
  SelectedMemory,
} from "./types";

const DEFAULT_TOKEN_BUDGET = 1_200;
const MAX_PER_SOURCE_DRAFT = 2;
const DIVERSITY_PENALTY_WEIGHT = 0.18;

const CATEGORY_LIMITS = { positive: 3, preference: 2, negative: 3 } as const;
type MemoryCategory = keyof typeof CATEGORY_LIMITS;

interface ScoredCandidate {
  memory: PreferenceMemory;
  selected: SelectedMemory;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function serializeContent(content: PreferenceMemory["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function normalizedContent(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
  const timestamp = new Date(isoDate).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, now.getTime() - timestamp) / 86_400_000;
  return Math.exp(-ageDays / 90);
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function goalScore(memoryObjective: MemoryObjective | undefined, objective: MemoryObjective | undefined) {
  if (!memoryObjective || !objective) return 0.5;
  return memoryObjective === objective ? 1 : 0;
}

function toneScore(memoryTone: number | undefined, requestedTone: number | undefined) {
  if (memoryTone === undefined || requestedTone === undefined) return 0.5;
  return clamp(1 - Math.abs(memoryTone - requestedTone) / 4);
}

function effectivenessScore(memory: PreferenceMemory) {
  if (memory.effectiveness !== undefined) return clamp(memory.effectiveness);
  const evidence = Math.max(1, memory.evidenceCount ?? 1);
  return clamp(0.45 + Math.log2(evidence + 1) * 0.08);
}

function memoryCategory(kind: PreferenceMemoryKind): MemoryCategory {
  if (kind === "positive_example") return "positive";
  if (kind === "negative_rule") return "negative";
  return "preference";
}

function memoryTimestamp(memory: PreferenceMemory): number {
  const timestamp = new Date(memory.updatedAt ?? memory.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function scoredMemory(
  memory: PreferenceMemory,
  options: {
    brief: string;
    objective?: MemoryObjective;
    toneIntensity?: number;
    now: Date;
  },
): SelectedMemory {
  const content = serializeContent(memory.content);
  const topic = memory.brief
    ? similarity(`${memory.brief} ${content}`, options.brief)
    : similarity(content, options.brief);
  const scoreBreakdown: MemoryScoreBreakdown = {
    strength: clamp(memory.weight),
    topic,
    goal: goalScore(memory.objective, options.objective),
    tone: toneScore(memory.toneIntensity, options.toneIntensity),
    recency: recencyScore(memory.updatedAt ?? memory.createdAt, options.now),
    effectiveness: effectivenessScore(memory),
    diversityPenalty: 0,
  };
  const score =
    scoreBreakdown.strength * 0.3 +
    scoreBreakdown.topic * 0.25 +
    scoreBreakdown.goal * 0.15 +
    scoreBreakdown.tone * 0.1 +
    scoreBreakdown.recency * 0.1 +
    scoreBreakdown.effectiveness * 0.1;

  return {
    id: memory.id,
    content,
    score,
    kind: memory.kind,
    objective: memory.objective,
    toneIntensity: memory.toneIntensity,
    sourceDraftId: memory.sourceDraftId,
    memoryKey: memory.memoryKey,
    scoreBreakdown,
  };
}

function deterministicOrder(left: ScoredCandidate, right: ScoredCandidate): number {
  return (
    right.selected.score - left.selected.score ||
    memoryTimestamp(right.memory) - memoryTimestamp(left.memory) ||
    left.memory.id.localeCompare(right.memory.id)
  );
}

function deduplicateStableKeys(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const newestByKey = new Map<string, ScoredCandidate>();
  const withoutKey: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.memory.memoryKey;
    if (!key) {
      withoutKey.push(candidate);
      continue;
    }
    const existing = newestByKey.get(key);
    if (!existing || memoryTimestamp(candidate.memory) > memoryTimestamp(existing.memory)) {
      newestByKey.set(key, candidate);
    }
  }
  return [...newestByKey.values(), ...withoutKey];
}

function deduplicateContent(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const strongestByContent = new Map<string, ScoredCandidate>();
  for (const candidate of [...candidates].sort(deterministicOrder)) {
    const key = normalizedContent(candidate.selected.content);
    if (!strongestByContent.has(key)) strongestByContent.set(key, candidate);
  }
  return [...strongestByContent.values()];
}

function resolveSourceConflicts(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const decisiveBySource = new Map<string, ScoredCandidate>();
  for (const candidate of candidates) {
    const source = candidate.memory.sourceDraftId;
    const category = memoryCategory(candidate.memory.kind);
    if (!source || category === "preference") continue;
    const existing = decisiveBySource.get(source);
    if (!existing || memoryTimestamp(candidate.memory) > memoryTimestamp(existing.memory)) {
      decisiveBySource.set(source, candidate);
    }
  }

  return candidates.filter((candidate) => {
    const source = candidate.memory.sourceDraftId;
    const category = memoryCategory(candidate.memory.kind);
    if (!source || category === "preference") return true;
    const decisive = decisiveBySource.get(source);
    return !decisive || memoryCategory(decisive.memory.kind) === category;
  });
}

function withDiversityPenalty(
  candidate: ScoredCandidate,
  selected: SelectedMemory[],
): ScoredCandidate {
  const maximumSimilarity = selected.reduce(
    (maximum, item) => Math.max(maximum, similarity(candidate.selected.content, item.content)),
    0,
  );
  const diversityPenalty = maximumSimilarity * DIVERSITY_PENALTY_WEIGHT;
  return {
    memory: candidate.memory,
    selected: {
      ...candidate.selected,
      score: candidate.selected.score - diversityPenalty,
      scoreBreakdown: { ...candidate.selected.scoreBreakdown, diversityPenalty },
    },
  };
}

/** Selects bounded, explainable memories without another provider call. */
export function selectLearningContext(
  memories: PreferenceMemory[],
  options: {
    userId: string;
    voiceProfileId: string;
    brief: string;
    objective?: MemoryObjective;
    toneIntensity?: number;
    tokenBudget?: number;
    now?: Date;
  },
): LearningContext {
  const now = options.now ?? new Date();
  const initiallyScored = memories
    .filter(
      (memory) =>
        memory.active &&
        memory.userId === options.userId &&
        (memory.voiceProfileId === null || memory.voiceProfileId === options.voiceProfileId),
    )
    .map((memory) => ({
      memory,
      selected: scoredMemory(memory, {
        brief: options.brief,
        objective: options.objective,
        toneIntensity: options.toneIntensity,
        now,
      }),
    }));
  const eligible = resolveSourceConflicts(
    deduplicateContent(deduplicateStableKeys(initiallyScored)),
  );

  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  let remaining = budget;
  const selectedAll: SelectedMemory[] = [];
  const selectedByCategory: Record<MemoryCategory, SelectedMemory[]> = {
    positive: [],
    preference: [],
    negative: [],
  };
  const sourceCounts = new Map<string, number>();
  const pending = [...eligible];

  while (pending.length) {
    const ranked = pending
      .map((candidate) => withDiversityPenalty(candidate, selectedAll))
      .sort(deterministicOrder);
    const next = ranked.find((candidate) => {
      const category = memoryCategory(candidate.memory.kind);
      if (selectedByCategory[category].length >= CATEGORY_LIMITS[category]) return false;
      const source = candidate.memory.sourceDraftId;
      if (source && (sourceCounts.get(source) ?? 0) >= MAX_PER_SOURCE_DRAFT) return false;
      return estimateTokens(candidate.selected.content) <= remaining;
    });
    if (!next) break;

    const originalIndex = pending.findIndex((candidate) => candidate.memory.id === next.memory.id);
    if (originalIndex >= 0) pending.splice(originalIndex, 1);
    const category = memoryCategory(next.memory.kind);
    selectedByCategory[category].push(next.selected);
    selectedAll.push(next.selected);
    if (next.memory.sourceDraftId) {
      sourceCounts.set(
        next.memory.sourceDraftId,
        (sourceCounts.get(next.memory.sourceDraftId) ?? 0) + 1,
      );
    }
    remaining -= estimateTokens(next.selected.content);
  }

  return {
    positiveExamples: selectedByCategory.positive,
    preferences: selectedByCategory.preference,
    negativeRules: selectedByCategory.negative,
    estimatedTokens: budget - remaining,
  };
}
