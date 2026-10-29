import {
  generationOutputSchema,
  generationRequestSchema,
  styleProfileSchema,
  type GeneratedDraft,
  type GenerationOutput,
  type GenerationRequest,
  type StyleProfile,
} from "@/lib/contracts";
import type { LearningContext } from "@/lib/learning";

import { AIProviderError } from "./errors";
import type { StructuredAIProvider, StructuredAIResult } from "./provider";
import {
  buildDraftGenerationInput,
  DRAFT_GENERATION_INSTRUCTIONS,
  PROMPT_VERSION,
} from "./prompts";

function characterCount(value: string): number {
  return Array.from(value).length;
}

function normalizeForComparison(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function validateDrafts(
  output: GenerationOutput,
  characterLimit: number,
): GenerationOutput {
  const drafts: GeneratedDraft[] = output.drafts.map((draft) => {
    const count = characterCount(draft.text);
    if (count > characterLimit) {
      throw new AIProviderError(
        "invalid_output",
        `A generated draft exceeded the ${characterLimit}-character limit.`,
      );
    }
    return { ...draft, characterCount: count };
  });

  const uniqueTexts = new Set(drafts.map((draft) => normalizeForComparison(draft.text)));
  if (uniqueTexts.size !== drafts.length) {
    throw new AIProviderError(
      "invalid_output",
      "The writing service returned duplicate drafts.",
    );
  }
  const uniqueAngles = new Set(drafts.map((draft) => draft.angle));
  if (uniqueAngles.size < 4) {
    throw new AIProviderError(
      "invalid_output",
      "The writing service did not provide enough distinct draft angles.",
    );
  }
  return { drafts };
}

export async function generateDrafts(
  provider: StructuredAIProvider,
  options: {
    request: GenerationRequest;
    styleProfile: StyleProfile;
    sourceExamples: string[];
    learningContext?: LearningContext;
  },
): Promise<StructuredAIResult<GenerationOutput>> {
  const request = generationRequestSchema.parse(options.request);
  const styleProfile = styleProfileSchema.parse(options.styleProfile);
  const result = await provider.parse({
    schema: generationOutputSchema,
    schemaName: "social_post_drafts",
    instructions: DRAFT_GENERATION_INSTRUCTIONS,
    input: buildDraftGenerationInput({ ...options, request, styleProfile }),
    maxOutputTokens: 2_000,
    metadata: { prompt_version: PROMPT_VERSION, operation: "draft_generation" },
  });

  return {
    ...result,
    data: validateDrafts(generationOutputSchema.parse(result.data), request.characterLimit),
  };
}
