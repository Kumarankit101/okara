import { z } from "zod";

export const handleSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .min(1, "Enter an X handle")
      .max(15, "X handles are at most 15 characters")
      .regex(/^[A-Za-z0-9_]+$/, "Use only letters, numbers, and underscores"),
  );

export const pastedSamplesSchema = z
  .array(z.string().trim().min(10).max(2_000))
  .min(3, "Provide at least three writing samples")
  .max(50, "Provide no more than 50 writing samples");

export const createVoiceProfileSchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("x_api"),
    handle: handleSchema,
    authorizationConfirmed: z.literal(true),
  }),
  z.object({
    sourceType: z.literal("pasted"),
    handle: handleSchema.optional(),
    displayName: z.string().trim().min(1).max(80),
    samples: pastedSamplesSchema,
    authorizationConfirmed: z.literal(true),
  }),
]);

export type CreateVoiceProfileInput = z.infer<
  typeof createVoiceProfileSchema
>;

export const styleProfileSchema = z.object({
  summary: z.string().min(1).max(1_500),
  sentenceLength: z.enum(["short", "mixed", "long"]),
  rhythm: z.string().min(1).max(400),
  openings: z.array(z.string().min(1).max(120)).max(8),
  vocabulary: z.array(z.string().min(1).max(80)).max(20),
  formatting: z.array(z.string().min(1).max(120)).max(12),
  humor: z.string().min(1).max(300),
  certainty: z.string().min(1).max(300),
  emojiUsage: z.string().min(1).max(200),
  hashtagUsage: z.string().min(1).max(200),
  avoid: z.array(z.string().min(1).max(160)).max(12),
});

export type StyleProfile = z.infer<typeof styleProfileSchema>;

export const voiceProfileSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().nullable(),
  displayName: z.string().min(1),
  sourceType: z.enum(["x_api", "pasted"]),
  styleProfile: styleProfileSchema,
  status: z.enum(["syncing", "ready", "failed"]),
  lastSyncedAt: z.string().datetime().nullable(),
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const generationRequestSchema = z.object({
  voiceProfileId: z.string().uuid(),
  brief: z.string().trim().min(10).max(4_000),
  objective: z
    .enum(["engage", "educate", "announce", "persuade", "entertain"])
    .default("engage"),
  toneIntensity: z.number().int().min(1).max(5).default(3),
  characterLimit: z.number().int().min(80).max(500).default(280),
  includeHashtags: z.boolean().default(false),
  correction: z.string().trim().max(1_000).optional(),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const draftAngleSchema = z.enum([
  "observation",
  "educational",
  "contrarian",
  "story",
  "question",
  "announcement",
  "opinion",
]);

export const generatedDraftSchema = z.object({
  text: z.string().min(1).max(500),
  angle: draftAngleSchema,
  characterCount: z.number().int().nonnegative(),
  styleNote: z.string().min(1).max(240),
  safetyFlags: z.array(z.string().max(120)).max(8),
});

export const generationOutputSchema = z.object({
  drafts: z.array(generatedDraftSchema).length(5),
});

export type GeneratedDraft = z.infer<typeof generatedDraftSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;

export const feedbackEventTypeSchema = z.enum([
  "selected",
  "copied",
  "saved",
  "liked",
  "disliked",
  "edited",
  "dismissed",
]);

export const feedbackReasonSchema = z.enum([
  "too_generic",
  "too_long",
  "wrong_tone",
  "repetitive",
  "inaccurate",
  "too_promotional",
  "other",
]);

export const feedbackInputSchema = z.object({
  draftId: z.string().uuid(),
  eventType: feedbackEventTypeSchema,
  reasonCode: feedbackReasonSchema.optional(),
  editedText: z.string().trim().min(1).max(500).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const profileSettingsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name")
    .max(80, "Display name must be 80 characters or fewer"),
});

export type ProfileSettingsInput = z.infer<typeof profileSettingsSchema>;
