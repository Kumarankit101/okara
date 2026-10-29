import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, rpc } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

import { POST } from "./route";

const draftId = "8c729106-7aaf-490d-8973-e119bb144e01";
const clientEventId = "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71";

function feedbackRequest(body: Record<string, unknown>) {
  return new Request("https://okara.example/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function persistedResult(replayed = false) {
  return {
    feedbackId: "81b6df6c-5198-412c-a6a6-bc78d356d67f",
    replayed,
    memoryUpdated: true,
    state: {
      selected: true,
      saved: false,
      liked: false,
      rejected: false,
      currentText: "A revised draft",
      revision: 1,
      reasonCode: null,
      reasonNote: null,
    },
  };
}

describe("feedback route", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    rpc.mockReset();
  });

  it("sends an idempotent mutation to the atomic feedback RPC", async () => {
    rpc.mockResolvedValue({ data: persistedResult(), error: null });

    const response = await POST(
      feedbackRequest({
        draftId,
        clientEventId,
        eventType: "selected",
        editedText: "A revised draft",
      }),
    );

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("apply_feedback_v2", {
      p_active: true,
      p_client_event_id: clientEventId,
      p_draft_id: draftId,
      p_edited_text: "A revised draft",
      p_event_type: "selected",
      p_reason_code: null,
      p_reason_note: null,
    });
    expect(await response.json()).toEqual(persistedResult());
  });

  it("returns replayed idempotent mutations without creating a new result", async () => {
    rpc.mockResolvedValue({ data: persistedResult(true), error: null });

    const response = await POST(
      feedbackRequest({ draftId, clientEventId, eventType: "selected" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ replayed: true });
  });

  it("rejects negative feedback without a reason before calling the RPC", async () => {
    const response = await POST(
      feedbackRequest({ draftId, clientEventId, eventType: "disliked" }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
