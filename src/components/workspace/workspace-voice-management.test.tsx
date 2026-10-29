// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Workspace } from "./workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Workspace voice management", () => {
  it("opens the active voice editor directly from Write", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/voice-profiles") {
        return Promise.resolve(new Response(JSON.stringify({
          profiles: [{
            id: "voice-1",
            handle: null,
            displayName: "Founder voice",
            sourceType: "pasted",
            status: "ready",
          }],
        }), { status: 200 }));
      }
      if (url === "/api/voice-profiles?id=voice-1") {
        return Promise.resolve(new Response(JSON.stringify({
          profile: { id: "voice-1", handle: null, displayName: "Founder voice" },
          samples: [],
        }), { status: 200 }));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<Workspace />);
    await user.click(await screen.findByRole("button", { name: "Manage voice" }));

    expect(await screen.findByRole("dialog", { name: "Manage Founder voice" })).toBeTruthy();
    expect(screen.getByText(/previous raw samples have expired/i)).toBeTruthy();
  });
});
