import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from, rpc, analyzeStyle, recordUsage } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  analyzeStyle: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  requireUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from, rpc })),
}));
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  analyzeStyle,
  getOpenAIProvider: vi.fn(() => ({ provider: true })),
}));
vi.mock("@/lib/services/usage", () => ({ recordUsage }));

import { GET, PATCH } from "./route";

const profileId = "9b51f3d8-4c1e-4f34-8107-74b1983bd55c";

type QueryResult = { data?: unknown; error: unknown };

function query(result: QueryResult) {
  const resolved = { data: result.data ?? null, error: result.error };
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: typeof resolved) => unknown) => Promise.resolve(resolved).then(resolve),
  };
  for (const method of ["select", "update", "eq", "neq", "gt", "order"] as const) {
    builder[method].mockReturnValue(builder);
  }
  builder.maybeSingle.mockResolvedValue(resolved);
  return builder;
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: profileId,
    handle: "writer",
    display_name: "Writer voice",
    source_type: "x_api",
    status: "ready",
    last_synced_at: "2026-10-30T00:00:00.000Z",
    source_expires_at: "2026-10-30T23:00:00.000Z",
    ...overrides,
  };
}

function patchRequest(body: unknown) {
  return new Request("https://okara.example/api/voice-profiles", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("voice profile management", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    from.mockReset();
    rpc.mockReset();
    analyzeStyle.mockReset();
    recordUsage.mockReset();
  });

  it("loads only the signed-in user's unexpired source samples", async () => {
    const profileQuery = query({ data: profile(), error: null });
    const sampleQuery = query({
      data: [
        { id: "sample-1", text: "First detailed writing sample." },
        { id: "sample-2", text: "Second detailed writing sample." },
      ],
      error: null,
    });
    from.mockReturnValueOnce(profileQuery).mockReturnValueOnce(sampleQuery);

    const response = await GET(
      new Request(`https://okara.example/api/voice-profiles?id=${profileId}`),
    );
    expect(response.status).toBe(200);
    expect(profileQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sampleQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sampleQuery.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    const body = await response.json();
    expect(body.profile).toMatchObject({ id: profileId, displayName: "Writer voice" });
    expect(body.samples).toHaveLength(2);
    expect(body.samples[0]).toMatchObject({ text: "First detailed writing sample." });
  });

  it("renames a voice without paying for style analysis", async () => {
    const existingQuery = query({ data: profile(), error: null });
    const renameQuery = query({ data: profile({ display_name: "Sharper voice" }), error: null });
    from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(renameQuery);

    const response = await PATCH(patchRequest({
      id: profileId,
      displayName: "Sharper voice",
    }));
    expect(response.status).toBe(200);
    expect(renameQuery.update).toHaveBeenCalledWith({ display_name: "Sharper voice" });
    expect(analyzeStyle).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      profile: { displayName: "Sharper voice" },
      rebuilt: false,
    });
  });

  it("reanalyzes and atomically replaces a curated sample set", async () => {
    const samples = [
      "First sufficiently detailed writing sample.",
      "Second sufficiently detailed writing sample.",
      "Third sufficiently detailed writing sample.",
    ];
    from.mockReturnValueOnce(query({ data: profile(), error: null }));
    analyzeStyle.mockResolvedValue({
      data: {
        summary: "Direct and concise.",
        sentenceLength: "short",
        rhythm: "Crisp.",
        openings: [],
        vocabulary: [],
        formatting: [],
        humor: "Dry.",
        certainty: "High.",
        emojiUsage: "None.",
        hashtagUsage: "None.",
        avoid: [],
      },
      model: "test-model",
      responseId: "resp-1",
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    });
    rpc.mockResolvedValue({ data: { id: profileId, sampleCount: 3 }, error: null });

    const response = await PATCH(patchRequest({
      id: profileId,
      displayName: "Curated voice",
      samples,
      authorizationConfirmed: true,
    }));
    expect(response.status).toBe(200);
    expect(analyzeStyle).toHaveBeenCalledWith(expect.anything(), samples);
    expect(rpc).toHaveBeenCalledWith(
      "replace_voice_profile_samples",
      expect.objectContaining({
        p_voice_profile_id: profileId,
        p_display_name: "Curated voice",
        p_samples: samples,
      }),
    );
    expect(await response.json()).toMatchObject({ rebuilt: true, sampleCount: 3 });
  });

  it("rejects source changes without explicit authorization", async () => {
    const response = await PATCH(patchRequest({
      id: profileId,
      displayName: "Voice",
      samples: ["First long sample.", "Second long sample.", "Third long sample."],
    }));
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});
