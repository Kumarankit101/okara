// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsView } from "./settings-view";

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
    expect(screen.getByRole("button", { name: "Delete voice" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review learned preferences" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
