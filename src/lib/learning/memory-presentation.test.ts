import { describe, expect, it } from "vitest";

import { presentMemory } from "./memory-presentation";

describe("presentMemory", () => {
  it("explains saved positive examples using the action that created the signal", () => {
    expect(
      presentMemory("positive_example", {
        text: "A concrete draft worth following.",
        signals: { selected: true, saved: true, liked: false },
      }),
    ).toEqual([
      expect.objectContaining({
        category: "example",
        detail: "A concrete draft worth following.",
        tags: ["Selected", "Saved"],
      }),
    ]);
  });

  it("turns an edit into an exact before-and-after comparison and useful patterns", () => {
    const [memory] = presentMemory("edit_pattern", {
      original: "This is a very long opening that takes too long to get to the point!",
      final: "Start with the point.",
    });

    expect(memory).toEqual(
      expect.objectContaining({
        category: "edit",
        before: expect.stringContaining("very long opening"),
        after: "Start with the point.",
      }),
    );
    expect(memory?.tags).toContain("Prefer substantially shorter drafts");
  });

  it("labels legacy memories using their source feedback action", () => {
    expect(
      presentMemory("positive_example", {
        text: "An older copied draft.",
        signals: ["copied"],
      })[0]?.tags,
    ).toEqual(["Copied"]);
  });

  it("states what a preference summary means and how much evidence supports it", () => {
    expect(
      presentMemory("aggregate_summary", {
        observations: 1,
        preferredLength: "shorter",
      }),
    ).toEqual([
      {
        category: "insight",
        title: "Draft length",
        detail: "You tend to shorten drafts when you edit them.",
        evidence: "Early signal from 1 edit",
      },
    ]);
  });

  it("hides records that contain no understandable information", () => {
    expect(presentMemory("positive_example", {})).toEqual([]);
    expect(presentMemory("edit_pattern", {})).toEqual([]);
    expect(presentMemory("aggregate_summary", { observations: 1 })).toEqual([]);
  });
});
