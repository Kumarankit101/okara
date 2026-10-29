// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Workspace } from "./workspace";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("Workspace history restoration", () => {
  beforeEach(() => {
    replace.mockReset();
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    window.cancelAnimationFrame = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the voice, controls, and edited drafts from a historical run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/voice-profiles") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                profiles: [
                  {
                    id: "2ba6b355-3106-44bb-a5ba-84a91f31d811",
                    handle: null,
                    displayName: "Founder voice",
                    sourceType: "pasted",
                    status: "ready",
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              run: {
                id: "6dc28089-29b6-4f48-9be8-e4fa0e7d8c71",
                createdAt: "2026-10-29T10:00:00.000Z",
                profileName: "Founder voice",
                voiceProfileId: "2ba6b355-3106-44bb-a5ba-84a91f31d811",
                brief: "Explain why product feedback compounds over time.",
                objective: "educate",
                toneIntensity: 4,
                characterLimit: 280,
                includeHashtags: true,
                correction: "Keep the opening direct",
                drafts: [
                  {
                    id: "8c729106-7aaf-490d-8973-e119bb144e01",
                    text: "This is the edited historical draft.",
                    angle: "educational",
                    characterCount: 36,
                    styleNote: "Direct and practical",
                    safetyFlags: [],
                    isSaved: true,
                    isSelected: false,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        );
      }),
    );

    render(
      <Workspace
        restoredRunId="6dc28089-29b6-4f48-9be8-e4fa0e7d8c71"
        highlightedDraftId="8c729106-7aaf-490d-8973-e119bb144e01"
      />,
    );

    expect(
      await screen.findByDisplayValue("Explain why product feedback compounds over time."),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("Keep the opening direct")).toBeTruthy();
    expect(screen.getByDisplayValue("This is the edited historical draft.")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Educate", selected: true })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Strong", selected: true })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Hashtags" })).toHaveProperty(
      "checked",
      true,
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
