// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Workspace } from "./workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const profiles = [
  {
    id: "voice-1",
    handle: null,
    displayName: "Founder voice",
    sourceType: "pasted",
    status: "ready",
  },
  {
    id: "voice-2",
    handle: "writer",
    displayName: "Writer voice",
    sourceType: "x_api",
    status: "ready",
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Workspace voice selection", () => {
  it("keeps the selector and add-voice form synchronized", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ profiles }), { status: 200 }),
    );

    render(<Workspace />);

    const selector = await screen.findByRole("combobox", {
      name: "Active voice profile",
    });
    expect(within(selector).getByRole("option", { name: "Add voice" })).toBeTruthy();
    expect((selector as HTMLSelectElement).value).toBe("voice-1");

    await user.click(screen.getByRole("button", { name: "Add voice" }));

    expect((selector as HTMLSelectElement).value).toBe("add-voice");
    expect(screen.getByRole("heading", { name: "Add a writing voice" })).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "Voice name" }), "Unsaved voice");
    await user.selectOptions(selector, "voice-2");

    expect((selector as HTMLSelectElement).value).toBe("voice-2");
    expect(screen.queryByRole("heading", { name: "Add a writing voice" })).toBeNull();
    expect(screen.getByRole("heading", { name: "@writer" })).toBeTruthy();

    await user.selectOptions(selector, "add-voice");

    expect((selector as HTMLSelectElement).value).toBe("add-voice");
    expect(
      (screen.getByRole("textbox", { name: "Voice name" }) as HTMLInputElement).value,
    ).toBe("");
  });

  it("selects a newly created profile and returns to the active-voice card", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input) !== "/api/voice-profiles") {
        return Promise.reject(new Error(`Unexpected request: ${String(input)}`));
      }
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              profile: {
                id: "voice-3",
                handle: null,
                displayName: "Product voice",
                sourceType: "pasted",
                status: "ready",
              },
            }),
            { status: 201 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ profiles }), { status: 200 }));
    });

    render(<Workspace />);

    const selector = await screen.findByRole("combobox", {
      name: "Active voice profile",
    });
    await user.selectOptions(selector, "add-voice");
    await user.type(screen.getByRole("textbox", { name: "Voice name" }), "Product voice");
    await user.type(
      screen.getByRole("textbox", { name: "Writing samples" }),
      "First sample.\n\nSecond sample.\n\nThird sample.",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /I confirm that I own these samples/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Build voice profile" }));

    expect(await screen.findByRole("heading", { name: "Product voice" })).toBeTruthy();
    expect((selector as HTMLSelectElement).value).toBe("voice-3");
    expect(screen.queryByRole("heading", { name: "Add a writing voice" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/voice-profiles",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
