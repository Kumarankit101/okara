// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryView } from "./history-view";

const runId = "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71";
const draftId = "8c729106-7aaf-490d-8973-e119bb144e01";

function summaryResponse(overrides?: { hasMore?: boolean; total?: number }) {
  return new Response(
    JSON.stringify({
      runs: [
        {
          id: runId,
          brief: "Explain why product feedback compounds over time.",
          createdAt: "2026-10-29T10:00:00.000Z",
          profileName: "Founder voice",
          objective: "educate",
        },
      ],
      hasMore: overrides?.hasMore ?? false,
      total: overrides?.total ?? 1,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function detailResponse() {
  return new Response(
    JSON.stringify({
      run: {
        id: runId,
        brief: "Explain why product feedback compounds over time.",
        createdAt: "2026-10-29T10:00:00.000Z",
        profileName: "Founder voice",
        voiceProfileId: "c3850a97-7776-48ba-887f-a73e9935afe1",
        objective: "educate",
        toneIntensity: 4,
        characterLimit: 280,
        includeHashtags: false,
        correction: "Keep it practical.",
        drafts: [
          {
            id: draftId,
            text: "Feedback becomes useful when it changes the next draft.",
            angle: "observation",
            isSaved: true,
            isSelected: false,
          },
        ],
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("HistoryView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows compact run summaries and loads drafts only after opening the drawer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(summaryResponse())
      .mockResolvedValueOnce(detailResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<HistoryView />);

    expect(
      await screen.findByRole("button", {
        name: "Open details for Explain why product feedback compounds over time.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Feedback becomes useful when it changes the next draft.")).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("limit=20&offset=0");

    await userEvent.click(
      screen.getByRole("button", {
        name: "Open details for Explain why product feedback compounds over time.",
      }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(await screen.findByText("Feedback becomes useful when it changes the next draft.")).toBeTruthy();
    expect(screen.getByText("Goal: Educate")).toBeTruthy();
    expect(screen.getByText("Tone: Confident")).toBeTruthy();
    expect(screen.queryByText("Tone: 4/5")).toBeNull();
    expect(screen.getByText("Keep it practical.")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open observation draft in Write" }).getAttribute("href"),
    ).toBe(`/dashboard?run=${runId}&draft=${draftId}`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/generations?runId=${runId}`);
  });

  it("searches briefs on the server and paginates without loading draft bodies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(summaryResponse({ hasMore: true, total: 50 }))
      .mockResolvedValueOnce(summaryResponse({ total: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<HistoryView />);

    expect(await screen.findByText("Showing 1 of 50 generations")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load 20 more" })).toBeTruthy();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search generation briefs" }),
      "feedback",
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("query=feedback");
  });
});
