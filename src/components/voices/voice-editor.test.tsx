// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceEditor } from "./voice-editor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VoiceEditor", () => {
  it("renames a loaded voice and reports the update", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        profile: { id: "voice-1", handle: null, displayName: "Founder voice" },
        samples: [
          { id: "sample-1", text: "First detailed writing sample." },
          { id: "sample-2", text: "Second detailed writing sample." },
          { id: "sample-3", text: "Third detailed writing sample." },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        profile: { id: "voice-1", handle: null, displayName: "Sharper voice" },
        rebuilt: false,
      }), { status: 200 }));

    render(
      <VoiceEditor
        profile={{ id: "voice-1", handle: null, displayName: "Founder voice" }}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    const name = await screen.findByLabelText("Voice name");
    await user.clear(name);
    await user.type(name, "Sharper voice");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(onUpdated).toHaveBeenCalledWith({
      profile: { id: "voice-1", handle: null, displayName: "Sharper voice" },
      rebuilt: false,
      sampleCount: undefined,
    });
  });
});
