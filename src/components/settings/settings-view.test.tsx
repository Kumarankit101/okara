// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsView } from "./settings-view";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingsView", () => {
  it("shows account, voice, privacy, and session controls", () => {
    render(
      <SettingsView
        email="writer@example.com"
        initialDisplayName="Writer"
        memberSinceLabel="Oct 29, 2026"
        initialVoiceProfiles={[
          {
            id: "9b51f3d8-4c1e-4f34-8107-74b1983bd55c",
            handle: "writer",
            displayName: "Writer voice",
            name: "@writer",
            detail: "Writer voice",
            sourceLabel: "Imported from X",
            lastSyncedLabel: "Analyzed Oct 29, 2026",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your identity" })).toBeTruthy();
    expect(screen.getByDisplayValue("Writer")).toBeTruthy();
    expect(screen.getByText("writer@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage voice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete voice" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review learned preferences" }).getAttribute("href"),
    ).toBe("/preferences");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("loads a voice and lets the user curate samples before rebuilding", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        profile: { displayName: "Writer voice" },
        samples: [
          { id: "1", text: "First sufficiently detailed writing sample." },
          { id: "2", text: "Second sufficiently detailed writing sample." },
          { id: "3", text: "Third sufficiently detailed writing sample." },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        profile: { displayName: "Sharper voice", handle: "writer" },
        rebuilt: true,
        sampleCount: 3,
      }), { status: 200 }));

    render(
      <SettingsView
        email="writer@example.com"
        initialDisplayName="Writer"
        memberSinceLabel="Oct 29, 2026"
        initialVoiceProfiles={[{
          id: "9b51f3d8-4c1e-4f34-8107-74b1983bd55c",
          handle: "writer",
          displayName: "Writer voice",
          name: "@writer",
          detail: "Writer voice",
          sourceLabel: "Imported from X",
          lastSyncedLabel: "Analyzed Oct 29, 2026",
        }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Manage voice" }));
    expect(await screen.findByRole("dialog", { name: "Manage @writer" })).toBeTruthy();
    await user.clear(screen.getByLabelText("Voice name"));
    await user.type(screen.getByLabelText("Voice name"), "Sharper voice");
    const firstSample = screen.getByDisplayValue("First sufficiently detailed writing sample.");
    await user.clear(firstSample);
    await user.type(firstSample, "A sharper replacement sample with enough detail.");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Rebuild voice" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/voice-profiles",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(await screen.findByText("Sharper voice was rebuilt from 3 samples.")).toBeTruthy();
    fetchMock.mockRestore();
  });
});
