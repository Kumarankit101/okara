import { z } from "zod";

import { apiError } from "@/lib/http/api-response";
import { routeErrorResponse } from "@/lib/http/route-error";
import { presentMemory } from "@/lib/learning/memory-presentation";
import { requireUser, type Json } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

function contentRecord(value: Json): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

const memoryIdSchema = z.string().uuid();
const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }).strict(),
  z.object({ type: z.literal("voice"), voiceProfileId: z.string().uuid() }).strict(),
]);
const preferenceActionSchema = z.union([
  z.object({ memoryId: memoryIdSchema, active: z.boolean() }).strict(),
  z.object({ action: z.literal("setActive"), memoryId: memoryIdSchema, active: z.boolean() }).strict(),
  z.object({ action: z.literal("setScope"), memoryId: memoryIdSchema, scope: scopeSchema }).strict(),
  z.object({ action: z.literal("copy"), memoryId: memoryIdSchema, targets: z.array(scopeSchema).min(1).max(20) }).strict(),
]);

type Scope = z.infer<typeof scopeSchema>;
type Profile = { id: string; display_name: string; handle: string | null };

function databaseErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}

function presentScope(voiceProfileId: string | null, profiles: Map<string, Profile>) {
  if (!voiceProfileId) return { type: "global" as const, label: "All voices" };
  const profile = profiles.get(voiceProfileId);
  return {
    type: "voice" as const,
    voiceProfileId,
    label: profile?.handle ? `@${profile.handle.replace(/^@/, "")}` : (profile?.display_name ?? "Voice"),
  };
}

function scopeVoiceProfileId(scope: Scope) {
  return scope.type === "global" ? null : scope.voiceProfileId;
}

function scopeKey(scope: Scope) {
  return scope.type === "global" ? "global" : `voice:${scope.voiceProfileId}`;
}

async function validateVoiceProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  profileIds: string[],
) {
  const uniqueIds = [...new Set(profileIds)];
  if (!uniqueIds.length) return new Map<string, Profile>();
  const { data, error } = await supabase
    .from("voice_profiles")
    .select("id,display_name,handle")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .in("id", uniqueIds);
  if (error) throw error;
  if (data.length !== uniqueIds.length) return null;
  return new Map(data.map((profile) => [profile.id, profile]));
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("preference_memories")
      .select("id,kind,content_json,source_feedback_event_id,created_at,voice_profile_id,copied_from_memory_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const { data: profiles, error: profilesError } = await supabase
      .from("voice_profiles")
      .select("id,display_name,handle")
      .eq("user_id", user.id)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false });
    if (profilesError) throw profilesError;
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    const feedbackIds = data.map((memory) => memory.source_feedback_event_id).filter((id): id is string => Boolean(id));
    const eventById = new Map<string, string>();
    if (feedbackIds.length) {
      const { data: events, error: eventsError } = await supabase
        .from("feedback_events").select("id,event_type").eq("user_id", user.id).in("id", feedbackIds);
      if (eventsError) throw eventsError;
      for (const event of events) eventById.set(event.id, event.event_type);
    }

    return Response.json({
      profiles: profiles.map((profile) => ({ id: profile.id, displayName: profile.display_name, handle: profile.handle })),
      memories: data.flatMap((memory) => {
        const content = contentRecord(memory.content_json);
        const sourceEvent = memory.source_feedback_event_id ? eventById.get(memory.source_feedback_event_id) : undefined;
        const presentationContent = memory.kind === "positive_example" && !content.signals && sourceEvent
          ? { ...content, signals: [sourceEvent] }
          : content;
        return presentMemory(memory.kind, presentationContent).map((presentation, index) => ({
          id: `${memory.id}:${index}`,
          memoryId: memory.id,
          ...presentation,
          createdAt: memory.created_at,
          scope: presentScope(memory.voice_profile_id, profileById),
          copiedFromMemoryId: memory.copied_from_memory_id,
        }));
      }),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsedInput = preferenceActionSchema.parse(await request.json());
    const input = "action" in parsedInput
      ? parsedInput
      : { action: "setActive" as const, memoryId: parsedInput.memoryId, active: parsedInput.active };
    const supabase = await createClient();

    if (input.action === "setActive") {
      const { data, error } = await supabase.from("preference_memories")
        .update({ active: input.active }).eq("id", input.memoryId).eq("user_id", user.id)
        .select("id,active").maybeSingle();
      if (error) throw error;
      if (!data) return apiError(404, "PREFERENCE_NOT_FOUND", "That writing preference no longer exists.");
      return Response.json({ memoryId: data.id, active: data.active });
    }

    const { data: source, error: sourceError } = await supabase.from("preference_memories")
      .select("id,user_id,voice_profile_id,kind,content_json,weight,embedding,active,memory_key,source_draft_id,source_feedback_event_id,objective,tone_intensity,evidence_count,copied_from_memory_id")
      .eq("id", input.memoryId).eq("user_id", user.id).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return apiError(404, "PREFERENCE_NOT_FOUND", "That writing preference no longer exists.");

    if (input.action === "setScope") {
      const targetProfileId = scopeVoiceProfileId(input.scope);
      if (targetProfileId && !(await validateVoiceProfiles(supabase, user.id, [targetProfileId]))) {
        return apiError(404, "VOICE_PROFILE_NOT_FOUND", "The selected voice profile no longer exists.");
      }
      if (source.voice_profile_id === targetProfileId) return Response.json({ memoryId: source.id, scope: input.scope });
      const rootMemoryId = source.copied_from_memory_id ?? source.id;
      const { data, error } = await supabase.from("preference_memories")
        .update({
          voice_profile_id: targetProfileId,
          memory_key: `shared:${rootMemoryId}`,
        }).eq("id", source.id).eq("user_id", user.id)
        .select("id").maybeSingle();
      if (databaseErrorCode(error) === "23505") {
        return apiError(409, "PREFERENCE_ALREADY_EXISTS", "That writing preference already exists in the selected scope.");
      }
      if (error) throw error;
      if (!data) return apiError(404, "PREFERENCE_NOT_FOUND", "That writing preference no longer exists.");
      return Response.json({ memoryId: data.id, scope: input.scope });
    }

    const targets = [...new Map(input.targets.map((target) => [scopeKey(target), target])).values()];
    const profileIds = targets.flatMap((target) => target.type === "voice" ? [target.voiceProfileId] : []);
    if (!(await validateVoiceProfiles(supabase, user.id, profileIds))) {
      return apiError(404, "VOICE_PROFILE_NOT_FOUND", "One or more selected voice profiles no longer exist.");
    }
    const rootMemoryId = source.copied_from_memory_id ?? source.id;
    const created: Scope[] = [];
    const skipped: Scope[] = [];
    for (const target of targets) {
      const targetProfileId = scopeVoiceProfileId(target);
      if (source.voice_profile_id === targetProfileId) {
        skipped.push(target);
        continue;
      }
      const { error } = await supabase.from("preference_memories").insert({
        user_id: user.id,
        voice_profile_id: targetProfileId,
        kind: source.kind,
        content_json: source.content_json,
        source_feedback_event_id: null,
        weight: source.weight,
        embedding: source.embedding,
        active: true,
        memory_key: `shared:${rootMemoryId}`,
        source_draft_id: null,
        objective: source.objective,
        tone_intensity: source.tone_intensity,
        evidence_count: source.evidence_count,
        copied_from_memory_id: rootMemoryId,
      });
      if (databaseErrorCode(error) === "23505") {
        skipped.push(target);
      } else {
        if (error) throw error;
        created.push(target);
      }
    }
    return Response.json({ memoryId: source.id, created, skipped });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
