export type PreferenceMemoryKind =
  | "positive_example"
  | "preference"
  | "negative_rule"
  | "edit_pattern"
  | "aggregate_summary";

export type MemoryObjective =
  | "engage"
  | "educate"
  | "announce"
  | "persuade"
  | "entertain";

export interface MemoryScoreBreakdown {
  strength: number;
  topic: number;
  goal: number;
  tone: number;
  recency: number;
  effectiveness: number;
  diversityPenalty: number;
}

export interface PreferenceMemory {
  id: string;
  userId: string;
  /** Null means this preference applies to every voice owned by the user. */
  voiceProfileId: string | null;
  kind: PreferenceMemoryKind;
  content: string | Record<string, unknown>;
  weight: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  brief?: string;
  objective?: MemoryObjective;
  toneIntensity?: number;
  sourceDraftId?: string;
  memoryKey?: string;
  evidenceCount?: number;
  /** Normalized historical success from 0 (harmful) to 1 (consistently useful). */
  effectiveness?: number;
}

export interface SelectedMemory {
  id: string;
  content: string;
  score: number;
  kind: PreferenceMemoryKind;
  objective?: MemoryObjective;
  toneIntensity?: number;
  sourceDraftId?: string;
  memoryKey?: string;
  scoreBreakdown: MemoryScoreBreakdown;
}

export interface LearningContext {
  positiveExamples: SelectedMemory[];
  preferences: SelectedMemory[];
  negativeRules: SelectedMemory[];
  estimatedTokens: number;
}

export interface PreferenceSummary {
  preferredLength: "shorter" | "similar" | "longer" | "unknown";
  openingStyle: string[];
  punctuation: string[];
  emojiPreference: "more" | "same" | "less" | "unknown";
  hashtagPreference: "more" | "same" | "less" | "unknown";
  confidence: "softer" | "same" | "stronger" | "unknown";
  avoid: string[];
  observations: number;
}
