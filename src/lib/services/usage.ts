import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function recordUsage(input: {
  userId: string;
  provider: "x" | "openai";
  operation: string;
  units: number;
  estimatedCostUsd: number;
  requestId?: string | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("usage_events").insert({
      user_id: input.userId,
      provider: input.provider,
      operation: input.operation,
      units: input.units,
      estimated_cost_usd: input.estimatedCostUsd,
      request_id: input.requestId ?? null,
    });
  } catch {
    // Usage telemetry must not discard an otherwise valid user result. Production
    // readiness checks require the service-role key and alerts on missing events.
  }
}
