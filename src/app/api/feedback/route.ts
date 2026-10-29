import {
  feedbackInputSchema,
  feedbackResponseSchema,
} from "@/lib/contracts";
import { routeErrorResponse } from "@/lib/http/route-error";
import { requireUser } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    await requireUser();
    const input = feedbackInputSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("apply_feedback_v2", {
      p_active: input.active,
      p_client_event_id: input.clientEventId,
      p_draft_id: input.draftId,
      p_edited_text: input.editedText ?? null,
      p_event_type: input.eventType,
      p_reason_code: input.reasonCode ?? null,
      p_reason_note: input.reasonNote ?? null,
    });
    if (error) throw error;

    const result = feedbackResponseSchema.parse(data);
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
