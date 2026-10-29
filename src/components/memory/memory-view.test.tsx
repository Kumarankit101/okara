// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryView } from "./memory-view";

describe("MemoryView", () => {
  afterEach(() => {
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
                category: "insight",
                title: "Draft length",
                detail: "You tend to shorten drafts when you edit them.",
                evidence: "Early signal from 1 edit",
                createdAt: "2026-10-30T00:00:00.000Z",
              },
              {
                id: "positive:0",
                category: "example",
                title: "Example to follow",
                detail: "A useful concrete example.",
                tags: ["Selected", "Saved"],
                createdAt: "2026-10-30T00:00:00.000Z",
              },
              {
                id: "edit:0",
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
    expect(await screen.findByText("Memory could not be loaded")).toBeTruthy();
  });
});
