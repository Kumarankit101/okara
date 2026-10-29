import { feedbackInputSchema } from "@/lib/contracts";
import { routeErrorResponse } from "@/lib/http/route-error";
import {
  deriveEditPatterns,
  feedbackWeight,
  updatePreferenceSummary,
  type PreferenceSummary,
} from "@/lib/learning";
import { requireUser, type Json } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

function asPreferenceSummary(value: Json | null): PreferenceSummary | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const content = value as Record<string, unknown>;
  const preferredLength = content.preferredLength;
  if (
    preferredLength !== "shorter" &&
    preferredLength !== "similar" &&
    preferredLength !== "longer" &&
    preferredLength !== "unknown"
  ) {
    return undefined;
  }
  return content as unknown as PreferenceSummary;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = feedbackInputSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id,text,generation_run_id")
      .eq("id", input.draftId)
      .eq("user_id", user.id)
      .single();
    if (draftError) throw draftError;
    const { data: run, error: runError } = await supabase
      .from("generation_runs")
      .select("voice_profile_id,brief")
      .eq("id", draft.generation_run_id)
      .eq("user_id", user.id)
      .single();
    if (runError) throw runError;

    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback_events")
      .insert({
        user_id: user.id,
        voice_profile_id: run.voice_profile_id,
        draft_id: draft.id,
        event_type: input.eventType,
        reason_code: input.reasonCode ?? null,
        edited_text: input.editedText ?? null,
      })
      .select("id")
      .single();
    if (feedbackError) throw feedbackError;

    const memoryRows: Array<{
      user_id: string;
      voice_profile_id: string;
      kind: "positive_example" | "negative_rule" | "edit_pattern";
      content_json: Json;
      source_feedback_event_id: string;
      weight: number;
    }> = [];
    const strength = Math.abs(feedbackWeight(input.eventType));
    const finalText = input.editedText ?? draft.text;

    if (["selected", "edited", "saved", "copied", "liked"].includes(input.eventType)) {
      memoryRows.push({
        user_id: user.id,
        voice_profile_id: run.voice_profile_id,
        kind: "positive_example",
        content_json: { text: finalText, brief: run.brief },
        source_feedback_event_id: feedback.id,
        weight: strength,
      });
    }
    if (["disliked", "dismissed"].includes(input.eventType)) {
      memoryRows.push({
        user_id: user.id,
        voice_profile_id: run.voice_profile_id,
        kind: "negative_rule",
        content_json: {
          reason: input.reasonCode ?? "Draft was dismissed",
          example: draft.text,
        },
        source_feedback_event_id: feedback.id,
        weight: strength,
      });
    }

    const textChanged = Boolean(input.editedText && input.editedText !== draft.text);
    if (textChanged && input.editedText) {
      const patterns = deriveEditPatterns(draft.text, input.editedText);
      if (patterns.length) {
        memoryRows.push({
          user_id: user.id,
          voice_profile_id: run.voice_profile_id,
          kind: "edit_pattern",
          content_json: { patterns, original: draft.text, final: input.editedText },
          source_feedback_event_id: feedback.id,
          weight: 1,
        });
      }
    }

    if (memoryRows.length) {
      const { error } = await supabase.from("preference_memories").insert(memoryRows);
      if (error) throw error;
    }

    if (textChanged && input.editedText) {
      const { data: existing, error: existingError } = await supabase
        .from("preference_memories")
        .select("id,content_json")
        .eq("user_id", user.id)
        .eq("voice_profile_id", run.voice_profile_id)
        .eq("kind", "aggregate_summary")
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      const summary = updatePreferenceSummary(
        asPreferenceSummary(existing?.content_json ?? null),
        draft.text,
        input.editedText,
        input.reasonCode ? [input.reasonCode] : [],
      );
      if (existing) {
        const { data: updatedSummary, error: updateError } = await supabase
          .from("preference_memories")
          .update({ content_json: summary as unknown as Json, weight: 1 })
          .eq("id", existing.id)
          .eq("user_id", user.id)
          .select("id")
          .single();
        if (updateError || !updatedSummary) {
          throw updateError ?? new Error("Preference summary update was not persisted.");
        }
      } else {
        const { data: insertedSummary, error: insertError } = await supabase
          .from("preference_memories")
          .insert({
            user_id: user.id,
            voice_profile_id: run.voice_profile_id,
            kind: "aggregate_summary",
            content_json: summary as unknown as Json,
            source_feedback_event_id: feedback.id,
            weight: 1,
          })
          .select("id")
          .single();
        if (insertError || !insertedSummary) {
          throw insertError ?? new Error("Preference summary insert was not persisted.");
        }
      }
    }

    return Response.json({ ok: true, feedbackId: feedback.id }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
