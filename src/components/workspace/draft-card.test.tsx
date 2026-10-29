// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DraftCard,
  type FeedbackMutationInput,
  type FeedbackMutationResult,
} from "./draft-card";

const draft = {
  id: "8c729106-7aaf-490d-8973-e119bb144e01",
  text: "A useful original draft.",
  angle: "educational" as const,
  characterCount: 24,
  styleNote: "Direct and practical",
  safetyFlags: [],
};

function state(
  overrides: Partial<FeedbackMutationResult> = {},
): FeedbackMutationResult {
  return {
    selected: false,
    saved: false,
    liked: false,
    rejected: false,
    currentText: draft.text,
    revision: 0,
    reasonCode: null,
    reasonNote: null,
    ...overrides,
  };
}

describe("DraftCard feedback", () => {
  afterEach(() => cleanup());

  it("suppresses repeated clicks while a feedback mutation is pending", async () => {
    const user = userEvent.setup();
    let resolveMutation: (value: FeedbackMutationResult) => void = () => undefined;
    const onFeedback = vi.fn(
      () =>
        new Promise<FeedbackMutationResult>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    render(
      <DraftCard draft={draft} characterLimit={280} onFeedback={onFeedback} />,
    );

    const button = screen.getByRole("button", { name: "Use this" });
    await user.click(button);
    await user.click(button);

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty("disabled", true);

    resolveMutation(state({ selected: true }));
    expect(await screen.findByRole("button", { name: "Selected" })).toBeTruthy();
  });

  it("preserves edited text, rolls back failed state, and retries the same event", async () => {
    const user = userEvent.setup();
    const editedText = "A shorter edited draft.";
    const onFeedback = vi
      .fn<(input: FeedbackMutationInput) => Promise<FeedbackMutationResult>>()
      .mockRejectedValueOnce(new Error("Feedback service unavailable"))
      .mockResolvedValueOnce(
        state({ saved: true, currentText: editedText, revision: 1 }),
      );
    render(
      <DraftCard draft={draft} characterLimit={280} onFeedback={onFeedback} />,
    );

    const editor = screen.getByRole("textbox", {
      name: "Edit educational draft",
    });
    await user.clear(editor);
    await user.type(editor, editedText);
    expect(screen.getByText("Edited")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Feedback service unavailable",
    );
    expect(editor).toHaveProperty("value", editedText);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();

    const firstInput = onFeedback.mock.calls[0]?.[0];
    expect(firstInput?.editedText).toBe(editedText);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();
    expect(onFeedback.mock.calls[1]?.[0].clientEventId).toBe(
      firstInput?.clientEventId,
    );
    expect(screen.getByText("Edit saved")).toBeTruthy();
  });

  it("keeps clipboard success independent from telemetry failure", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onFeedback = vi.fn().mockRejectedValue(new Error("Telemetry failed"));
    render(
      <DraftCard draft={draft} characterLimit={280} onFeedback={onFeedback} />,
    );

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(draft.text);
    expect(
      await screen.findByRole("button", {
        name: "Copied · feedback sync failed",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("records an accessible rejection reason and supports undo", async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn(
      async (input: FeedbackMutationInput): Promise<FeedbackMutationResult> =>
        state({
          rejected: input.active,
          reasonCode: input.active ? input.reasonCode : null,
          revision: input.active ? 1 : 2,
        }),
    );
    render(
      <DraftCard draft={draft} characterLimit={280} onFeedback={onFeedback} />,
    );

    const rejectButton = screen.getByRole("button", { name: "Not right" });
    await user.click(rejectButton);
    expect(rejectButton.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("menu", { name: "Why is this draft not right?" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("menuitem", { name: "Too generic" }));
    expect(await screen.findByText("Not right: Too generic")).toBeTruthy();
    expect(onFeedback.mock.calls[0]?.[0]).toMatchObject({
      eventType: "disliked",
      active: true,
      reasonCode: "too_generic",
    });

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Not right" })).toBeTruthy();
    expect(onFeedback.mock.calls[1]?.[0]).toMatchObject({
      eventType: "disliked",
      active: false,
    });
  });

  it("toggles explicit positive feedback only after server confirmation", async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn(
      async (input: FeedbackMutationInput): Promise<FeedbackMutationResult> =>
        state({ liked: input.active, revision: input.active ? 1 : 2 }),
    );
    render(
      <DraftCard draft={draft} characterLimit={280} onFeedback={onFeedback} />,
    );

    await user.click(screen.getByRole("button", { name: "Like" }));
    const liked = await screen.findByRole("button", { name: "Liked" });
    expect(liked.getAttribute("aria-pressed")).toBe("true");

    await user.click(liked);
    expect(
      (await screen.findByRole("button", { name: "Like" })).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });
});
