import { pastedSamplesSchema, styleProfileSchema, type StyleProfile } from "@/lib/contracts";

import type { StructuredAIProvider, StructuredAIResult } from "./provider";
import {
  buildStyleAnalysisInput,
  PROMPT_VERSION,
  STYLE_ANALYSIS_INSTRUCTIONS,
} from "./prompts";

export async function analyzeStyle(
  provider: StructuredAIProvider,
  samples: string[],
): Promise<StructuredAIResult<StyleProfile>> {
  const validatedSamples = pastedSamplesSchema.parse(samples);
  return provider.parse({
    schema: styleProfileSchema,
    schemaName: "observable_style_profile",
    instructions: STYLE_ANALYSIS_INSTRUCTIONS,
    input: buildStyleAnalysisInput(validatedSamples),
    maxOutputTokens: 1_500,
    metadata: { prompt_version: PROMPT_VERSION, operation: "style_analysis" },
  });
}
