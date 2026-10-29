export const GENERATION_RATE_LIMIT = {
  perMinute: 5,
  perDay: 100,
} as const;

export type GenerationQuotaResult =
  | { allowed: true }
  | {
      allowed: false;
      window: "minute" | "day";
      retryAfterSeconds: number;
      limit: number;
    };

/**
 * Evaluates generation limits from authoritative database counts. The caller
 * supplies the query so this logic remains independently testable.
 */
export async function checkGenerationQuota(input: {
  countSince: (since: string) => Promise<number>;
  now?: Date;
  perMinute?: number;
  perDay?: number;
}): Promise<GenerationQuotaResult> {
  const now = input.now ?? new Date();
  const perMinute = input.perMinute ?? GENERATION_RATE_LIMIT.perMinute;
  const perDay = input.perDay ?? GENERATION_RATE_LIMIT.perDay;
  const minuteStart = new Date(now.getTime() - 60_000);
  const dayStart = new Date(now.getTime() - 86_400_000);

  const [minuteCount, dayCount] = await Promise.all([
    input.countSince(minuteStart.toISOString()),
    input.countSince(dayStart.toISOString()),
  ]);

  if (minuteCount >= perMinute) {
    return {
      allowed: false,
      window: "minute",
      retryAfterSeconds: 60,
      limit: perMinute,
    };
  }
  if (dayCount >= perDay) {
    return {
      allowed: false,
      window: "day",
      retryAfterSeconds: 86_400,
      limit: perDay,
    };
  }
  return { allowed: true };
}
