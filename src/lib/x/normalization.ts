import { pastedSamplesSchema } from "@/lib/contracts";

import type { XPostPayload } from "./schemas";

const URL_PATTERN = /https?:\/\/[^\s)\]}>,]+/giu;
const MIN_SAMPLE_LENGTH = 10;

export interface NormalizedSourcePost {
  sourceId: string | null;
  text: string;
  createdAt: string | null;
  lang: string | null;
}

/**
 * Normalizes transport noise without erasing voice signals such as casing,
 * punctuation, paragraph breaks, or emoji.
 */
export function normalizeSampleText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(URL_PATTERN, "[link]")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizePastedSamples(
  samples: readonly string[],
  limit = 30,
): NormalizedSourcePost[] {
  const validated = pastedSamplesSchema.parse([...samples]);
  const normalized = validated
    .map((text, index) => ({
      sourceId: null,
      text: normalizeSampleText(text),
      createdAt: null,
      lang: null,
      originalIndex: index,
    }))
    .filter((sample) => isUsefulSample(sample.text));

  const selected = selectRepresentativeSamples(dedupeSamples(normalized), limit);
  if (selected.length < 3) {
    throw new Error(
      "Provide at least three distinct, authored writing samples after removing duplicates and quotes.",
    );
  }

  return selected.map(toPublicSample);
}

export function normalizeXPosts(
  posts: readonly XPostPayload[],
  limit = 30,
): NormalizedSourcePost[] {
  const normalized = posts
    .filter((post) => !isRetweetOrReply(post))
    .map((post, index) => ({
      sourceId: post.id,
      text: normalizeSampleText(post.text),
      createdAt: post.created_at,
      lang: post.lang ?? null,
      originalIndex: index,
    }))
    .filter((sample) => isUsefulSample(sample.text));

  return selectRepresentativeSamples(dedupeSamples(normalized), limit).map(
    toPublicSample,
  );
}

export function sourceExpiresAt(
  fetchedAt: Date = new Date(),
  ttlMs = 23 * 60 * 60 * 1_000,
): string {
  return new Date(fetchedAt.getTime() + ttlMs).toISOString();
}

function isRetweetOrReply(post: XPostPayload): boolean {
  if (/^RT\s+@/iu.test(post.text.trim())) return true;
  return (
    post.referenced_tweets?.some(
      (reference) =>
        reference.type === "retweeted" || reference.type === "replied_to",
    ) ?? false
  );
}

function isUsefulSample(text: string): boolean {
  if (text.length < MIN_SAMPLE_LENGTH) return false;
  if (/^RT\s+@/iu.test(text)) return false;

  const nonQuotedLines = text
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith(">"));
  if (nonQuotedLines.length === 0) return false;

  return text.replaceAll("[link]", "").trim().length >= MIN_SAMPLE_LENGTH;
}

type InternalSample = NormalizedSourcePost & { originalIndex: number };

function toPublicSample(sample: InternalSample): NormalizedSourcePost {
  return {
    sourceId: sample.sourceId,
    text: sample.text,
    createdAt: sample.createdAt,
    lang: sample.lang,
  };
}

function dedupeSamples(samples: InternalSample[]): InternalSample[] {
  const kept: InternalSample[] = [];

  for (const sample of samples) {
    const fingerprint = sampleFingerprint(sample.text);
    const duplicate = kept.some((existing) => {
      const existingFingerprint = sampleFingerprint(existing.text);
      if (fingerprint === existingFingerprint) return true;
      return conservativelyNearDuplicate(fingerprint, existingFingerprint);
    });

    if (!duplicate) kept.push(sample);
  }

  return kept;
}

function sampleFingerprint(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replaceAll("[link]", " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conservativelyNearDuplicate(left: string, right: string): boolean {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size < 8 || rightTokens.size < 8) return false;

  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const lengthRatio =
    Math.min(left.length, right.length) / Math.max(left.length, right.length);

  return intersection / union >= 0.92 && lengthRatio >= 0.9;
}

function selectRepresentativeSamples(
  samples: InternalSample[],
  requestedLimit: number,
): InternalSample[] {
  const limit = Math.max(1, Math.min(30, Math.floor(requestedLimit)));
  const newestFirst = [...samples].sort((left, right) => {
    if (left.createdAt && right.createdAt) {
      return right.createdAt.localeCompare(left.createdAt);
    }
    return left.originalIndex - right.originalIndex;
  });

  const buckets: Record<"short" | "medium" | "long", InternalSample[]> = {
    short: [],
    medium: [],
    long: [],
  };

  for (const sample of newestFirst) {
    if (sample.text.length < 100) buckets.short.push(sample);
    else if (sample.text.length < 200) buckets.medium.push(sample);
    else buckets.long.push(sample);
  }

  const selected: InternalSample[] = [];
  const bucketOrder = [buckets.short, buckets.medium, buckets.long];
  let index = 0;

  while (selected.length < limit) {
    let added = false;
    for (const bucket of bucketOrder) {
      const sample = bucket[index];
      if (sample) {
        selected.push(sample);
        added = true;
        if (selected.length === limit) break;
      }
    }
    if (!added) break;
    index += 1;
  }

  return selected;
}

