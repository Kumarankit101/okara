export type PreferenceMemoryKind =
  | "positive_example"
  | "preference"
  | "negative_rule"
  | "edit_pattern"
  | "aggregate_summary";

export interface PreferenceMemory {
  id: string;
  userId: string;
  voiceProfileId: string;
  kind: PreferenceMemoryKind;
  content: string | Record<string, unknown>;
  weight: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  brief?: string;
}

export interface SelectedMemory {
  id: string;
  content: string;
  score: number;
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
