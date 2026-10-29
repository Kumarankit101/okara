import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from })) }));

import { GET, PATCH } from "./route";

const memoryId = "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71";
const voiceA = "7dc28089-29b6-4f48-9be8-e4fa0e7d8c72";
const voiceB = "8dc28089-29b6-4f48-9be8-e4fa0e7d8c73";
const voiceC = "9dc28089-29b6-4f48-9be8-e4fa0e7d8c74";

type QueryResult = { data?: unknown; error: unknown };

function query(result: QueryResult) {
  const resolved = { data: result.data ?? null, error: result.error };
  const builder = {
    select: vi.fn(), update: vi.fn(), insert: vi.fn(), eq: vi.fn(), neq: vi.fn(),
    in: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
    then: (resolve: (value: typeof resolved) => unknown) => Promise.resolve(resolved).then(resolve),
  };
  for (const method of ["select", "update", "insert", "eq", "neq", "in", "order", "limit"] as const) {
    builder[method].mockReturnValue(builder);
  }
  builder.maybeSingle.mockResolvedValue(resolved);
  return builder;
}

function queueQueries(...queries: ReturnType<typeof query>[]) {
  for (const item of queries) from.mockReturnValueOnce(item);
}

function preferenceRequest(body: unknown) {
  return new Request("https://okara.example/api/memories", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: memoryId, user_id: "user-1", voice_profile_id: voiceA, kind: "positive_example",
    content_json: { text: "Use a crisp opening." }, weight: 1, embedding: "[0.1]", active: true,
    memory_key: "positive:source", source_draft_id: "draft-1", source_feedback_event_id: "event-1",
    objective: "engage", tone_intensity: 3, evidence_count: 2, copied_from_memory_id: null,
    ...overrides,
  };
}

describe("memories preference management", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    from.mockReset();
  });

  it("retains the legacy authenticated active update", async () => {
    const updateQuery = query({ data: { id: memoryId, active: false }, error: null });
    queueQueries(updateQuery);
    const response = await PATCH(preferenceRequest({ memoryId, active: false }));
    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({ active: false });
    expect(updateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(await response.json()).toEqual({ memoryId, active: false });
  });

  it("presents global and voice scopes with the user's non-deleted profiles", async () => {
    queueQueries(
      query({ data: [
        { id: memoryId, kind: "positive_example", content_json: { text: "Global preference" }, source_feedback_event_id: null, created_at: "2026-10-30", voice_profile_id: null, copied_from_memory_id: null },
        { id: `${memoryId.slice(0, -1)}2`, kind: "positive_example", content_json: { text: "Voice preference" }, source_feedback_event_id: null, created_at: "2026-10-30", voice_profile_id: voiceA, copied_from_memory_id: memoryId },
      ], error: null }),
      query({ data: [
        { id: voiceA, display_name: "Ankit", handle: "ankit" },
        { id: voiceB, display_name: "Newsletter", handle: null },
      ], error: null }),
    );
    const response = await GET();
    const body = await response.json();
    expect(body.profiles).toEqual([
      { id: voiceA, displayName: "Ankit", handle: "ankit" },
      { id: voiceB, displayName: "Newsletter", handle: null },
    ]);
    expect(body.memories.map((item: { scope: unknown }) => item.scope)).toEqual([
      { type: "global", label: "All voices" },
      { type: "voice", voiceProfileId: voiceA, label: "@ankit" },
    ]);
  });

  it.each([
    [{ type: "global" }, null],
    [{ type: "voice", voiceProfileId: voiceB }, voiceB],
  ] as const)("moves a preference to scope %j", async (scope, expectedProfileId) => {
    const sourceQuery = query({ data: source(), error: null });
    const profileQuery = query({ data: [{ id: voiceB, display_name: "B", handle: "b" }], error: null });
    const updateQuery = query({ data: { id: memoryId }, error: null });
    queueQueries(sourceQuery, ...(expectedProfileId ? [profileQuery] : []), updateQuery);
    const response = await PATCH(preferenceRequest({ action: "setScope", memoryId, scope }));
    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({
      voice_profile_id: expectedProfileId,
      memory_key: `shared:${memoryId}`,
    });
    expect(await response.json()).toEqual({ memoryId, scope });
  });

  it("copies to B/C, detaches provenance, and records the root memory", async () => {
    const insertB = query({ error: null });
    const insertC = query({ error: null });
    queueQueries(
      query({ data: source(), error: null }),
      query({ data: [
        { id: voiceB, display_name: "B", handle: "b" },
        { id: voiceC, display_name: "C", handle: "c" },
      ], error: null }),
      insertB, insertC,
    );
    const targets = [{ type: "voice", voiceProfileId: voiceB }, { type: "voice", voiceProfileId: voiceC }];
    const response = await PATCH(preferenceRequest({ action: "copy", memoryId, targets }));
    expect(response.status).toBe(200);
    for (const insertQuery of [insertB, insertC]) {
      expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
        source_feedback_event_id: null, source_draft_id: null, copied_from_memory_id: memoryId,
        memory_key: `shared:${memoryId}`, active: true, embedding: "[0.1]",
      }));
    }
    expect(await response.json()).toEqual({ memoryId, created: targets, skipped: [] });
  });

  it("rejects target voice profiles not owned by the user without exposing ownership", async () => {
    queueQueries(query({ data: source(), error: null }), query({ data: [], error: null }));
    const response = await PATCH(preferenceRequest({
      action: "copy", memoryId, targets: [{ type: "voice", voiceProfileId: voiceB }],
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "VOICE_PROFILE_NOT_FOUND" } });
  });

  it("deduplicates targets, skips the source scope, and treats unique conflicts as idempotent", async () => {
    const conflict = query({ error: { code: "23505" } });
    queueQueries(
      query({ data: source(), error: null }),
      query({ data: [
        { id: voiceA, display_name: "A", handle: "a" },
        { id: voiceB, display_name: "B", handle: "b" },
      ], error: null }),
      conflict,
    );
    const targetA = { type: "voice", voiceProfileId: voiceA };
    const targetB = { type: "voice", voiceProfileId: voiceB };
    const response = await PATCH(preferenceRequest({
      action: "copy", memoryId, targets: [targetA, targetB, targetB],
    }));
    expect(conflict.insert).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ memoryId, created: [], skipped: [targetA, targetB] });
  });

  it("maps a scope uniqueness conflict to the public conflict code", async () => {
    queueQueries(
      query({ data: source({ voice_profile_id: null }), error: null }),
      query({ data: [{ id: voiceB, display_name: "B", handle: "b" }], error: null }),
      query({ data: null, error: { code: "23505" } }),
    );
    const response = await PATCH(preferenceRequest({
      action: "setScope", memoryId, scope: { type: "voice", voiceProfileId: voiceB },
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "PREFERENCE_ALREADY_EXISTS" } });
  });

  it.each([
    { action: "copy", memoryId, targets: [] },
    { action: "copy", memoryId, targets: Array.from({ length: 21 }, () => ({ type: "global" })) },
    { action: "setScope", memoryId, scope: { type: "voice", voiceProfileId: "bad" } },
    { action: "unknown", memoryId },
  ])("rejects malformed input %#", async (body) => {
    const response = await PATCH(preferenceRequest(body));
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});
