import { analyzeStyle, getOpenAIProvider } from "@/lib/ai";
import { createVoiceProfileSchema, type StyleProfile } from "@/lib/contracts";
import { getServerEnvironment } from "@/lib/env/server";
import { apiError } from "@/lib/http/api-response";
import { routeErrorResponse } from "@/lib/http/route-error";
import { checkGenerationQuota } from "@/lib/services/generation-quota";
import { recordUsage } from "@/lib/services/usage";
import { requireUser, type Json } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import {
  fetchVoiceSource,
  normalizePastedSamples,
  sourceExpiresAt,
  type NormalizedSourcePost,
} from "@/lib/x";
import { z } from "zod";

function profileResponse(row: {
  id: string;
  handle: string | null;
  display_name: string;
  source_type: "x_api" | "pasted";
  status: "syncing" | "ready" | "failed" | "deleted";
  last_synced_at?: string | null;
}) {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    sourceType: row.source_type,
    status: row.status === "deleted" ? "failed" : row.status,
    lastSyncedAt: row.last_synced_at ?? null,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("voice_profiles")
      .select("id,handle,display_name,source_type,status,last_synced_at")
      .eq("user_id", user.id)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ profiles: data.map(profileResponse) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createVoiceProfileSchema.parse(await request.json());
    const supabase = await createClient();

    const quota = await checkGenerationQuota({
      countSince: async (since) => {
        const { count, error } = await supabase
          .from("voice_profiles")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", since);
        if (error) throw error;
        return count ?? 0;
      },
      perMinute: 3,
      perDay: 20,
    });
    if (!quota.allowed) {
      const response = apiError(
        429,
        "VOICE_PROFILE_QUOTA_EXCEEDED",
        quota.window === "minute"
          ? `You can analyze up to ${quota.limit} voice profiles per minute.`
          : `You can analyze up to ${quota.limit} voice profiles per day.`,
        { window: quota.window, limit: quota.limit },
      );
      response.headers.set("Retry-After", String(quota.retryAfterSeconds));
      return response;
    }

    let posts: NormalizedSourcePost[];
    let displayName: string;
    let handle: string | null = null;
    let xUserId: string | null = null;
    let fetchedAt = new Date().toISOString();
    let expiresAt = sourceExpiresAt(new Date());

    if (input.sourceType === "x_api") {
      const source = await fetchVoiceSource(input.handle, {
        bearerToken: getServerEnvironment().X_BEARER_TOKEN,
      });
      posts = source.posts;
      displayName = source.user.name;
      handle = source.user.username;
      xUserId = source.user.id;
      fetchedAt = source.fetchedAt;
      expiresAt = source.expiresAt;
      void recordUsage({
        userId: user.id,
        provider: "x",
        operation: "profile_read",
        units: posts.length + 1,
        estimatedCostUsd: posts.length * 0.005 + 0.01,
      });
    } else {
      posts = normalizePastedSamples(input.samples);
      displayName = input.displayName;
      handle = input.handle ?? null;
    }

    if (posts.length < 3) {
      return apiError(
        422,
        "INSUFFICIENT_SOURCE_MATERIAL",
        "This voice needs at least three distinct writing samples.",
      );
    }

    const styleResult = await analyzeStyle(
      getOpenAIProvider(),
      posts.map((post) => post.text),
    );

    const { data: profile, error: profileError } = await supabase
      .from("voice_profiles")
      .insert({
        user_id: user.id,
        handle,
        display_name: displayName,
        x_user_id: xUserId,
        source_type: input.sourceType,
        style_profile_json: styleResult.data as unknown as Json,
        style_profile_version: 1,
        last_synced_at: fetchedAt,
        source_expires_at: expiresAt,
        status: "ready",
      })
      .select("id,handle,display_name,source_type,status,last_synced_at")
      .single();
    if (profileError) throw profileError;

    const { error: sourceError } = await supabase.from("source_posts").insert(
      posts.map((post, index) => ({
        user_id: user.id,
        voice_profile_id: profile.id,
        x_post_id: post.sourceId,
        text: post.text,
        source_order: index,
        posted_at: post.createdAt,
        fetched_at: fetchedAt,
        expires_at: expiresAt,
        source_metadata_json: { lang: post.lang } as Json,
      })),
    );
    if (sourceError) {
      await supabase.from("voice_profiles").delete().eq("id", profile.id);
      throw sourceError;
    }

    void recordUsage({
      userId: user.id,
      provider: "openai",
      operation: "style_analysis",
      units: styleResult.usage?.totalTokens ?? 0,
      estimatedCostUsd: 0,
      requestId: styleResult.responseId,
    });

    return Response.json(
      { profile: profileResponse(profile), styleProfile: styleResult.data satisfies StyleProfile },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const profileId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("id"));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("voice_profiles")
      .delete()
      .eq("id", profileId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return apiError(404, "VOICE_PROFILE_NOT_FOUND", "That voice profile no longer exists.");
    }

    return Response.json({ deleted: true, id: data.id });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
