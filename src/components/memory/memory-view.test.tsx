// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryView } from "./memory-view";

describe("MemoryView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("groups memories by meaning without exposing internal category names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            memories: [
              {
                id: "summary:0",
                memoryId: "8c729106-7aaf-490d-8973-e119bb144e01",
                category: "insight",
                title: "Draft length",
                detail: "You tend to shorten drafts when you edit them.",
                evidence: "Early signal from 1 edit",
                createdAt: "2026-10-30T00:00:00.000Z",
              },
              {
                id: "positive:0",
                memoryId: "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71",
                category: "example",
                title: "Example to follow",
                detail: "A useful concrete example.",
                tags: ["Selected", "Saved"],
                createdAt: "2026-10-30T00:00:00.000Z",
              },
              {
                id: "edit:0",
                memoryId: "81b6df6c-5198-412c-a6a6-bc78d356d67f",
                category: "edit",
                title: "A rewrite Okara learned from",
                detail: "Prefer shorter drafts",
                tags: ["Prefer shorter drafts"],
                before: "A much longer original draft.",
                after: "A shorter draft.",
                createdAt: "2026-10-30T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<MemoryView />);

    expect(await screen.findByText("Your writing preferences")).toBeTruthy();
    expect(screen.getByText("You tend to shorten drafts when you edit them.")).toBeTruthy();
    expect(screen.getByText("Early signal from 1 edit")).toBeTruthy();
    expect(screen.getByText("A much longer original draft.")).toBeTruthy();
    expect(screen.getByText("A shorter draft.")).toBeTruthy();
    expect(screen.getByText("Selected")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.queryByText(/aggregate summary/i)).toBeNull();
    expect(screen.queryByText(/edit preference/i)).toBeNull();
    expect(screen.queryByText(/positive example/i)).toBeNull();
  });

  it("shows a clear error instead of silently presenting an empty page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    render(<MemoryView />);
    expect(await screen.findByText("Preferences could not be loaded")).toBeTruthy();
  });

  it("stops using a preference and lets the user undo the change", async () => {
    const user = userEvent.setup();
    const memoryId = "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            memories: [
              {
                id: `${memoryId}:0`,
                memoryId,
                category: "example",
                title: "Example to follow",
                detail: "A useful concrete example.",
                tags: ["Saved"],
                createdAt: "2026-10-30T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ memoryId, active: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ memoryId, active: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryView />);
    await screen.findByText("A useful concrete example.", { exact: false });
    await user.click(screen.getByRole("button", { name: "Manage preferences" }));
    await user.click(
      screen.getByRole("button", {
        name: "Stop using example: A useful concrete example.",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText("A useful concrete example.", { exact: false })).toBeNull(),
    );
    expect(screen.getByText("This preference will no longer guide future drafts.")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/memories",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ memoryId, active: false }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("A useful concrete example.", { exact: false })).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/memories",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ memoryId, active: true }),
      }),
    );
  });
});
