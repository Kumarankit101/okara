import { z } from "zod";

import type { GenerationRequest } from "@/lib/contracts";
import type { Json } from "@/lib/supabase";

const idempotencyKeySchema = z.string().trim().uuid();

export function parseGenerationIdempotencyKey(value: string | null): string {
  return idempotencyKeySchema.parse(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function generationRequestMatches(input: {
  existing: {
    voiceProfileId: string;
    brief: string;
    constraints: Json;
  };
  request: GenerationRequest;
}): boolean {
  return (
    input.existing.voiceProfileId === input.request.voiceProfileId &&
    input.existing.brief === input.request.brief &&
    canonicalJson(input.existing.constraints) === canonicalJson(input.request)
  );
}
