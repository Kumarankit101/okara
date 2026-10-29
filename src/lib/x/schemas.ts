import { z } from "zod";

export const xUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().min(1),
  description: z.string().optional().default(""),
  profile_image_url: z.string().url().optional(),
  verified: z.boolean().optional(),
});

export const xUserLookupResponseSchema = z.object({
  data: xUserSchema,
});

const referencedPostSchema = z.object({
  type: z.enum(["retweeted", "quoted", "replied_to"]),
  id: z.string().min(1),
});

export const xPostSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  created_at: z.string().datetime(),
  lang: z.string().optional(),
  conversation_id: z.string().optional(),
  referenced_tweets: z.array(referencedPostSchema).optional(),
});

export const xTimelineResponseSchema = z.object({
  data: z.array(xPostSchema).optional().default([]),
  meta: z
    .object({
      result_count: z.number().int().nonnegative().optional(),
      next_token: z.string().min(1).optional(),
    })
    .optional()
    .default({}),
});

export type XUserPayload = z.infer<typeof xUserSchema>;
export type XPostPayload = z.infer<typeof xPostSchema>;

