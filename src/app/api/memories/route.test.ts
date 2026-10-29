import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from, update, firstEq, secondEq, select, maybeSingle } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  firstEq: vi.fn(),
  secondEq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

import { PATCH } from "./route";

const memoryId = "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71";

function preferenceRequest(body: Record<string, unknown>) {
  return new Request("https://okara.example/api/memories", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("memories preference management", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    from.mockReset();
    update.mockReset();
    firstEq.mockReset();
    secondEq.mockReset();
    select.mockReset();
    maybeSingle.mockReset();

    from.mockReturnValue({ update });
    update.mockReturnValue({ eq: firstEq });
    firstEq.mockReturnValue({ eq: secondEq });
    secondEq.mockReturnValue({ select });
    select.mockReturnValue({ maybeSingle });
  });

  it("deactivates only the authenticated user's selected preference", async () => {
    maybeSingle.mockResolvedValue({ data: { id: memoryId, active: false }, error: null });

    const response = await PATCH(preferenceRequest({ memoryId, active: false }));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("preference_memories");
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(firstEq).toHaveBeenCalledWith("id", memoryId);
    expect(secondEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(await response.json()).toEqual({ memoryId, active: false });
  });

  it("returns not found without exposing another user's preference", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await PATCH(preferenceRequest({ memoryId, active: false }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "PREFERENCE_NOT_FOUND" },
    });
  });

  it("rejects malformed preference identifiers before touching the database", async () => {
    const response = await PATCH(preferenceRequest({ memoryId: "not-a-uuid", active: false }));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});
