import { routeErrorResponse } from "@/lib/http/route-error";
import { presentMemory } from "@/lib/learning/memory-presentation";
import { requireUser, type Json } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

function contentRecord(value: Json): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("preference_memories")
      .select("id,kind,content_json,source_feedback_event_id,created_at")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const feedbackIds = data
      .map((memory) => memory.source_feedback_event_id)
      .filter((id): id is string => Boolean(id));
    const eventById = new Map<string, string>();

    if (feedbackIds.length) {
      const { data: events, error: eventsError } = await supabase
        .from("feedback_events")
        .select("id,event_type")
        .eq("user_id", user.id)
        .in("id", feedbackIds);
      if (eventsError) throw eventsError;
      for (const event of events) eventById.set(event.id, event.event_type);
    }

    return Response.json({
      memories: data.flatMap((memory) => {
        const content = contentRecord(memory.content_json);
        const sourceEvent = memory.source_feedback_event_id
          ? eventById.get(memory.source_feedback_event_id)
          : undefined;
        const presentationContent =
          memory.kind === "positive_example" && !content.signals && sourceEvent
            ? { ...content, signals: [sourceEvent] }
            : content;

        return presentMemory(memory.kind, presentationContent).map((presentation, index) => ({
            id: `${memory.id}:${index}`,
            ...presentation,
            createdAt: memory.created_at,
        }));
      }),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
