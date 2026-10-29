// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryView } from "./history-view";

describe("HistoryView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links a historical draft back to its populated writing workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            runs: [
              {
                id: "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71",
                brief: "Explain why product feedback compounds over time.",
                createdAt: "2026-10-29T10:00:00.000Z",
                profileName: "Founder voice",
                drafts: [
                  {
                    id: "8c729106-7aaf-490d-8973-e119bb144e01",
                    text: "Feedback becomes useful when it changes the next draft.",
                    angle: "observation",
                    isSaved: true,
                    isSelected: false,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<HistoryView />);

    const draftLink = await screen.findByRole("link", {
      name: "Open observation draft in Write",
    });
    expect(draftLink.getAttribute("href")).toBe(
      "/dashboard?run=6dc28089-29b6-4f48-9be8-e4fa0e7d8c71&draft=8c729106-7aaf-490d-8973-e119bb144e01",
    );
    expect(screen.getByText("Saved")).toBeTruthy();
  });
});
