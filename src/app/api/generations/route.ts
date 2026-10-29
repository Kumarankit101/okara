import { generateDrafts, getOpenAIProvider, PROMPT_VERSION } from "@/lib/ai";
import {
  generationRequestSchema,
  styleProfileSchema,
} from "@/lib/contracts";
import { getServerEnvironment } from "@/lib/env/server";
import { apiError } from "@/lib/http/api-response";
import { routeErrorResponse } from "@/lib/http/route-error";
import {
  selectLearningContext,
  type PreferenceMemory,
  type PreferenceMemoryKind,
} from "@/lib/learning";
import {
  generationRequestMatches,
  parseGenerationIdempotencyKey,
} from "@/lib/services/generation-idempotency";
import { checkGenerationQuota } from "@/lib/services/generation-quota";
import { recordUsage } from "@/lib/services/usage";
import { requireUser, type Json } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface ExistingRun {
  id: string;
  voice_profile_id: string;
  brief: string;
  constraints_json: Json;
  status: "pending" | "completed" | "failed";
}

interface DraftRow {
  id: string;
  generation_run_id: string;
  text: string;
  angle: string;
  character_count: number;
  style_note: string;
}

interface DraftFeedbackStateRow {
  draft_id: string;
  current_text: string;
  revision: number;
  is_selected: boolean;
  is_saved: boolean;
  rating: "positive" | "negative" | null;
  rejection_reason: string | null;
  rejection_note: string | null;
}

function presentDraft(draft: DraftRow, feedback: DraftFeedbackStateRow[]) {
  const state = feedback.find((item) => item.draft_id === draft.id);
  const text = state?.current_text ?? draft.text;

  return {
    id: draft.id,
    text,
    angle: draft.angle,
    characterCount: Array.from(text).length,
    styleNote: draft.style_note,
    safetyFlags: [],
    isSaved: state?.is_saved ?? false,
    isSelected: state?.is_selected ?? false,
    isLiked: state?.rating === "positive",
    isRejected: state?.rating === "negative",
    rejectionReason: state?.rejection_reason ?? null,
    rejectionNote: state?.rejection_note ?? null,
    revision: state?.revision ?? 0,
  };
}

async function loadDraftFeedbackState(
  supabase: SupabaseClient,
  userId: string,
  draftIds: string[],
): Promise<DraftFeedbackStateRow[]> {
  if (!draftIds.length) return [];
  const { data, error } = await supabase
    .from("draft_feedback_state")
    .select("draft_id,current_text,revision,is_selected,is_saved,rating,rejection_reason,rejection_note")
    .eq("user_id", userId)
    .in("draft_id", draftIds);
  if (error) throw error;
  return data;
}

async function findExistingRun(
  supabase: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<ExistingRun | null> {
  const { data, error } = await supabase
    .from("generation_runs")
    .select("id,voice_profile_id,brief,constraints_json,status")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function replayCompletedRun(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
) {
  const { data: drafts, error } = await supabase
    .from("drafts")
    .select("id,generation_run_id,text,angle,character_count,style_note")
    .eq("user_id", userId)
    .eq("generation_run_id", runId)
    .order("position");
  if (error) throw error;
  if (drafts.length !== 5) {
    throw new Error("Completed generation is missing persisted drafts.");
  }
  const feedback = await loadDraftFeedbackState(
    supabase,
    userId,
    drafts.map((draft) => draft.id),
  );
  return Response.json({
    runId,
    replayed: true,
    drafts: drafts.map((draft) => presentDraft(draft, feedback)),
  });
}

function generationInProgressResponse() {
  const response = apiError(
    409,
    "GENERATION_IN_PROGRESS",
    "This generation is already in progress. Retry shortly with the same request.",
  );
  response.headers.set("Retry-After", "2");
  return response;
}

async function enforceGenerationQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<Response | null> {
  const result = await checkGenerationQuota({
    countSince: async (since) => {
      const { count, error } = await supabase
        .from("generation_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["pending", "completed"])
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
  });
  if (result.allowed) return null;

  const response = apiError(
    429,
    "GENERATION_QUOTA_EXCEEDED",
    result.window === "minute"
      ? `You can generate up to ${result.limit} times per minute.`
      : `You can generate up to ${result.limit} times per day.`,
    { window: result.window, limit: result.limit },
  );
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  return response;
}

function memoryKind(kind: string): PreferenceMemoryKind {
  return kind === "positive_example" ||
    kind === "negative_rule" ||
    kind === "edit_pattern" ||
    kind === "aggregate_summary"
    ? kind
    : "preference";
}

function persistedMemoryKind(kind: PreferenceMemoryKind) {
  return kind === "preference" ? ("aggregate_summary" as const) : kind;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const searchParams = new URL(request.url).searchParams;
    const requestedRunId = searchParams.get("runId");

    if (requestedRunId) {
      const runId = z.string().uuid().parse(requestedRunId);
      const { data: run, error: runError } = await supabase
        .from("generation_runs")
        .select("id,brief,created_at,voice_profile_id,constraints_json")
        .eq("id", runId)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .maybeSingle();
      if (runError) throw runError;
      if (!run) {
        return apiError(404, "GENERATION_NOT_FOUND", "That generation no longer exists.");
      }

      const [{ data: drafts, error: draftError }, { data: profile, error: profileError }] =
        await Promise.all([
          supabase
            .from("drafts")
            .select("id,generation_run_id,text,angle,character_count,style_note")
            .eq("user_id", user.id)
            .eq("generation_run_id", run.id)
            .order("position"),
          supabase
            .from("voice_profiles")
            .select("id,display_name,handle")
            .eq("id", run.voice_profile_id)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
      if (draftError) throw draftError;
      if (profileError) throw profileError;
      if (!profile) {
        return apiError(404, "VOICE_PROFILE_NOT_FOUND", "The voice for this generation was deleted.");
      }

      const feedback = await loadDraftFeedbackState(
        supabase,
        user.id,
        drafts.map((draft) => draft.id),
      );
      const restoredRequest = generationRequestSchema.safeParse(run.constraints_json);
      const constraints = restoredRequest.success
        ? restoredRequest.data
        : {
            voiceProfileId: run.voice_profile_id,
            brief: run.brief,
            objective: "engage" as const,
            toneIntensity: 3,
            characterLimit: 280,
            includeHashtags: false,
          };

      return Response.json({
        run: {
          id: run.id,
          createdAt: run.created_at,
          profileName: profile.handle ? `@${profile.handle}` : profile.display_name,
          ...constraints,
          drafts: drafts.map((draft) => presentDraft(draft, feedback)),
        },
      });
    }

    const listInput = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
        query: z.string().trim().max(120).default(""),
      })
      .parse({
        limit: searchParams.get("limit") ?? undefined,
        offset: searchParams.get("offset") ?? undefined,
        query: searchParams.get("query") ?? undefined,
      });

    let runsQuery = supabase
      .from("generation_runs")
      .select("id,brief,created_at,voice_profile_id,constraints_json", {
        count: "exact",
      })
      .eq("user_id", user.id)
      .eq("status", "completed");

    if (listInput.query) {
      runsQuery = runsQuery.ilike("brief", `%${listInput.query}%`);
    }

    const { data: runs, error, count } = await runsQuery
      .order("created_at", { ascending: false })
      .range(listInput.offset, listInput.offset + listInput.limit - 1);
    if (error) throw error;
    if (!runs.length) {
      return Response.json({ runs: [], hasMore: false, total: count ?? 0 });
    }

    const profileIds = [...new Set(runs.map((run) => run.voice_profile_id))];
    const { data: profiles, error: profileError } = await supabase
      .from("voice_profiles")
      .select("id,display_name,handle")
      .in("id", profileIds);
    if (profileError) throw profileError;

    return Response.json({
      runs: runs.map((run) => {
        const profile = profiles.find((item) => item.id === run.voice_profile_id);
        const restoredRequest = generationRequestSchema.safeParse(run.constraints_json);
        return {
          id: run.id,
          brief: run.brief,
          createdAt: run.created_at,
          profileName: profile?.handle ? `@${profile.handle}` : profile?.display_name ?? "Voice",
          objective: restoredRequest.success ? restoredRequest.data.objective : "engage",
        };
      }),
      hasMore: listInput.offset + runs.length < (count ?? 0),
      total: count ?? runs.length,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let runId: string | null = null;
  try {
    const user = await requireUser();
    const input = generationRequestSchema.parse(await request.json());
    const idempotencyKey = parseGenerationIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
    const supabase = await createClient();

    const existingRun = await findExistingRun(supabase, user.id, idempotencyKey);
    if (
      existingRun &&
      !generationRequestMatches({
        existing: {
          voiceProfileId: existingRun.voice_profile_id,
          brief: existingRun.brief,
          constraints: existingRun.constraints_json,
        },
        request: input,
      })
    ) {
      return apiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Use a new idempotency key when the generation request changes.",
      );
    }
    if (existingRun?.status === "completed") {
      return replayCompletedRun(supabase, user.id, existingRun.id);
    }
    if (existingRun?.status === "pending") {
      return generationInProgressResponse();
    }

    const quotaResponse = await enforceGenerationQuota(supabase, user.id);
    if (quotaResponse) return quotaResponse;

    const { data: profile, error: profileError } = await supabase
      .from("voice_profiles")
      .select("id,style_profile_json,status")
      .eq("id", input.voiceProfileId)
      .eq("user_id", user.id)
      .eq("status", "ready")
      .single();
    if (profileError || !profile) {
      return apiError(404, "VOICE_PROFILE_NOT_FOUND", "Choose a ready voice profile.");
    }

    const [{ data: sources, error: sourceError }, { data: memories, error: memoryError }] =
      await Promise.all([
        supabase
          .from("source_posts")
          .select("text")
          .eq("voice_profile_id", profile.id)
          .gt("expires_at", new Date().toISOString())
          .order("source_order")
          .limit(12),
        supabase
          .from("preference_memories")
          .select("id,user_id,voice_profile_id,kind,content_json,weight,active,memory_key,source_draft_id,objective,tone_intensity,evidence_count,created_at,updated_at")
          .eq("voice_profile_id", profile.id)
          .eq("user_id", user.id)
          .eq("active", true)
          .order("weight", { ascending: false })
          .limit(40),
      ]);
    if (sourceError) throw sourceError;
    if (memoryError) throw memoryError;

    const learningMemories: PreferenceMemory[] = memories.map((memory) => ({
      id: memory.id,
      userId: memory.user_id,
      voiceProfileId: memory.voice_profile_id,
      kind: memoryKind(memory.kind),
      content: memory.content_json as Record<string, unknown>,
      weight: Number(memory.weight),
      active: memory.active,
      memoryKey: memory.memory_key ?? undefined,
      sourceDraftId: memory.source_draft_id ?? undefined,
      objective:
        memory.objective === "engage" ||
        memory.objective === "educate" ||
        memory.objective === "announce" ||
        memory.objective === "persuade" ||
        memory.objective === "entertain"
          ? memory.objective
          : undefined,
      toneIntensity: memory.tone_intensity ?? undefined,
      evidenceCount: memory.evidence_count,
      createdAt: memory.created_at,
      updatedAt: memory.updated_at,
    }));
    const learningContext = selectLearningContext(learningMemories, {
      userId: user.id,
      voiceProfileId: profile.id,
      brief: input.brief,
      objective: input.objective,
      toneIntensity: input.toneIntensity,
    });

    if (existingRun?.status === "failed") {
      const { error: cleanupError } = await supabase
        .from("drafts")
        .delete()
        .eq("user_id", user.id)
        .eq("generation_run_id", existingRun.id);
      if (cleanupError) throw cleanupError;

      const { data: retriedRun, error: retryError } = await supabase
        .from("generation_runs")
        .update({ status: "pending", error_code: null })
        .eq("id", existingRun.id)
        .eq("user_id", user.id)
        .eq("status", "failed")
        .select("id")
        .single();
      if (retryError) throw retryError;
      runId = retriedRun.id;
    } else {
      const { data: run, error: runError } = await supabase
        .from("generation_runs")
        .insert({
          user_id: user.id,
          voice_profile_id: profile.id,
          brief: input.brief,
          constraints_json: input as unknown as Json,
          model: getServerEnvironment().OPENAI_MODEL,
          prompt_version: PROMPT_VERSION,
          idempotency_key: idempotencyKey,
          status: "pending",
        })
        .select("id")
        .single();
      if (runError) {
        if (runError.code === "23505") {
          const racedRun = await findExistingRun(supabase, user.id, idempotencyKey);
          if (racedRun) {
            const sameRequest = generationRequestMatches({
              existing: {
                voiceProfileId: racedRun.voice_profile_id,
                brief: racedRun.brief,
                constraints: racedRun.constraints_json,
              },
              request: input,
            });
            if (!sameRequest) {
              return apiError(
                409,
                "IDEMPOTENCY_KEY_REUSED",
                "Use a new idempotency key when the generation request changes.",
              );
            }
            if (racedRun.status === "completed") {
              return replayCompletedRun(supabase, user.id, racedRun.id);
            }
            return generationInProgressResponse();
          }
        }
        throw runError;
      }
      runId = run.id;
    }
    if (!runId) throw new Error("Generation run was not initialized.");
    const activeRunId = runId;
    const startedAt = performance.now();

    const selectedMemories = [
      ...learningContext.positiveExamples,
      ...learningContext.preferences,
      ...learningContext.negativeRules,
    ];
    const { error: oldLinksError } = await supabase
      .from("generation_memory_links")
      .delete()
      .eq("user_id", user.id)
      .eq("generation_run_id", activeRunId);
    if (oldLinksError) throw oldLinksError;
    if (selectedMemories.length) {
      const { error: linkError } = await supabase
        .from("generation_memory_links")
        .insert(
          selectedMemories.map((memory, promptPosition) => ({
            user_id: user.id,
            generation_run_id: activeRunId,
            memory_id: memory.id,
            category: persistedMemoryKind(memory.kind),
            final_score: memory.score,
            score_components_json: memory.scoreBreakdown as unknown as Json,
            prompt_position: promptPosition,
          })),
        );
      if (linkError) throw linkError;
    }

    const result = await generateDrafts(getOpenAIProvider(), {
      request: input,
      styleProfile: styleProfileSchema.parse(profile.style_profile_json),
      sourceExamples: sources.map((source) => source.text),
      learningContext,
    });

    const { data: savedDrafts, error: draftError } = await supabase
      .from("drafts")
      .insert(
        result.data.drafts.map((draft, position) => ({
          user_id: user.id,
          generation_run_id: activeRunId,
          text: draft.text,
          angle: draft.angle,
          position,
          style_note: draft.styleNote,
        })),
      )
      .select("id,text,angle,character_count,style_note");
    if (draftError) throw draftError;
    if (savedDrafts.length !== 5) {
      throw new Error("Generated drafts were not fully persisted.");
    }

    const { data: completedRun, error: completionError } = await supabase
      .from("generation_runs")
      .update({
        model: result.model,
        input_tokens: result.usage?.inputTokens ?? null,
        output_tokens: result.usage?.outputTokens ?? null,
        latency_ms: Math.round(performance.now() - startedAt),
        status: "completed",
      })
      .eq("id", activeRunId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("id")
      .single();
    if (completionError || !completedRun) {
      throw completionError ?? new Error("Generation completion was not persisted.");
    }

    void recordUsage({
      userId: user.id,
      provider: "openai",
      operation: "draft_generation",
      units: result.usage?.totalTokens ?? 0,
      estimatedCostUsd: 0,
      requestId: result.responseId,
    });

    return Response.json({
      runId: activeRunId,
      replayed: false,
      drafts: savedDrafts.map((draft) => ({
        id: draft.id,
        text: draft.text,
        angle: draft.angle,
        characterCount: draft.character_count,
        styleNote: draft.style_note,
        safetyFlags: [],
      })),
    });
  } catch (error) {
    if (runId) {
      try {
        const supabase = await createClient();
        await supabase
          .from("generation_runs")
          .update({ status: "failed", error_code: "GENERATION_FAILED" })
          .eq("id", runId);
      } catch {
        // Preserve the original provider/persistence error response.
      }
    }
    return routeErrorResponse(error);
  }
}
