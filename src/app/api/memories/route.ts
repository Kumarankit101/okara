import { routeErrorResponse } from "@/lib/http/route-error";
import { requireUser, type Json } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

function contentRecord(value: Json): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function memoryCopy(kind: string, content: Record<string, unknown>) {
  if (kind === "positive_example") {
    return { title: "A draft you preferred", detail: String(content.text ?? "Accepted example") };
  }
  if (kind === "negative_rule") {
    return {
      title: "A pattern to avoid",
      detail: String(content.reason ?? "Rejected draft pattern"),
    };
  }
  if (kind === "edit_pattern") {
    const patterns = Array.isArray(content.patterns) ? content.patterns.join(" · ") : "Edit preference";
    return { title: "How you tend to edit", detail: patterns };
  }
  return {
    title: "Your preference summary",
    detail: `Based on ${String(content.observations ?? 1)} meaningful edit${content.observations === 1 ? "" : "s"}.`,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("preference_memories")
      .select("id,kind,content_json,weight,created_at")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return Response.json({
      memories: data.map((memory) => ({
        id: memory.id,
        kind: memory.kind,
        ...memoryCopy(memory.kind, contentRecord(memory.content_json)),
        weight: Number(memory.weight),
        createdAt: memory.created_at,
      })),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
