"use client";

import {
  Check,
  Copy,
  Heart,
  LoaderCircle,
  MessageSquareWarning,
  RotateCcw,
  Save,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { GeneratedDraft } from "@/lib/contracts";

export type FeedbackReason =
  | "too_generic"
  | "too_long"
  | "too_short"
  | "wrong_tone"
  | "too_soft"
  | "too_strong"
  | "repetitive"
  | "inaccurate"
  | "too_promotional"
  | "weak_opening"
  | "other";

export type FeedbackEventName =
  | "selected"
  | "saved"
  | "liked"
  | "disliked"
  | "edited"
  | "copied";

export interface FeedbackMutationInput {
  draftId: string;
  eventType: FeedbackEventName;
  active: boolean;
  editedText?: string;
  reasonCode?: FeedbackReason;
  reasonNote?: string;
  clientEventId: string;
}

export interface FeedbackMutationResult {
  selected: boolean;
  saved: boolean;
  liked: boolean;
  rejected: boolean;
  currentText: string;
  revision: number;
  reasonCode?: FeedbackReason | null;
  reasonNote?: string | null;
}

export interface DraftRecord extends GeneratedDraft {
  id: string;
  isSaved?: boolean;
  isSelected?: boolean;
  isLiked?: boolean;
  isRejected?: boolean;
  rejectionReason?: FeedbackReason | null;
  rejectionNote?: string | null;
  revision?: number;
}

interface FailedMutation {
  input: FeedbackMutationInput;
}

const rejectionReasons: Array<{ code: FeedbackReason; label: string }> = [
  { code: "too_generic", label: "Too generic" },
  { code: "too_long", label: "Too long" },
  { code: "too_short", label: "Too short" },
  { code: "too_soft", label: "Too soft" },
  { code: "too_strong", label: "Too strong" },
  { code: "wrong_tone", label: "Different tone issue" },
  { code: "repetitive", label: "Repetitive" },
  { code: "inaccurate", label: "Inaccurate" },
  { code: "too_promotional", label: "Too promotional" },
  { code: "weak_opening", label: "Weak opening" },
  { code: "other", label: "Something else" },
];

function newEventId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Feedback could not be saved.";
}

export function DraftCard({
  draft,
  characterLimit,
  onFeedback,
  highlighted = false,
}: {
  draft: DraftRecord;
  characterLimit: number;
  highlighted?: boolean;
  onFeedback: (input: FeedbackMutationInput) => Promise<FeedbackMutationResult>;
}) {
  const [text, setText] = useState(draft.text);
  const [saved, setSaved] = useState(Boolean(draft.isSaved));
  const [selected, setSelected] = useState(Boolean(draft.isSelected));
  const [liked, setLiked] = useState(Boolean(draft.isLiked));
  const [rejected, setRejected] = useState(Boolean(draft.isRejected));
  const [rejectionReason, setRejectionReason] = useState<FeedbackReason | null>(
    draft.rejectionReason ?? null,
  );
  const [rejectionNote, setRejectionNote] = useState(draft.rejectionNote ?? "");
  const [showReasons, setShowReasons] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherNote, setOtherNote] = useState("");
  const [pendingAction, setPendingAction] = useState<FeedbackEventName | null>(null);
  const [failedMutation, setFailedMutation] = useState<FailedMutation | null>(null);
  const [message, setMessage] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [editRecorded, setEditRecorded] = useState(false);
  const mutationInFlight = useRef(false);
  const count = Array.from(text).length;
  const edited = text !== draft.text;
  const disabled = Boolean(pendingAction) || count > characterLimit;

  function applyState(state: FeedbackMutationResult) {
    setSelected(state.selected);
    setSaved(state.saved);
    setLiked(state.liked);
    setRejected(state.rejected);
    setRejectionReason(state.reasonCode ?? null);
    setRejectionNote(state.reasonNote ?? "");
    if (state.currentText !== text) setText(state.currentText);
    if (edited) setEditRecorded(true);
  }

  async function runMutation(input: FeedbackMutationInput) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setPendingAction(input.eventType);
    setMessage("");
    setFailedMutation(null);
    try {
      const state = await onFeedback(input);
      applyState(state);
      setShowReasons(false);
      setShowOtherInput(false);
      setOtherNote("");
    } catch (error) {
      setMessage(errorMessage(error));
      setFailedMutation({ input });
    } finally {
      mutationInFlight.current = false;
      setPendingAction(null);
    }
  }

  function mutation(
    eventType: Exclude<FeedbackEventName, "copied">,
    active: boolean,
    reasonCode?: FeedbackReason,
    reasonNote?: string,
  ): FeedbackMutationInput {
    return {
      draftId: draft.id,
      eventType,
      active,
      editedText: edited ? text : undefined,
      reasonCode,
      reasonNote: reasonNote?.trim() || undefined,
      clientEventId: newEventId(),
    };
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopyNotice("Copy failed");
      return;
    }

    setCopyNotice("Copied");
    try {
      const state = await onFeedback({
        draftId: draft.id,
        eventType: "copied",
        active: true,
        editedText: edited ? text : undefined,
        clientEventId: newEventId(),
      });
      applyState(state);
    } catch {
      setCopyNotice("Copied · feedback sync failed");
    }
  }

  const rejectionLabel = rejectionReasons.find(
    ({ code }) => code === rejectionReason,
  )?.label;

  return (
    <article
      id={`draft-${draft.id}`}
      className={`scroll-mt-6 rounded-3xl border bg-surface p-5 transition sm:p-6 ${
        selected || highlighted
          ? "border-forest ring-4 ring-accent/30"
          : "border-line"
      }`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-forest">
            {draft.angle}
          </span>
          {edited ? (
            <span className="rounded-full bg-canvas px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
              {editRecorded ? "Edit saved" : "Edited"}
            </span>
          ) : null}
        </div>
        <span
          className={`font-mono text-xs ${
            count > characterLimit ? "text-danger" : "text-muted"
          }`}
        >
          {count}/{characterLimit}
        </span>
      </header>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setEditRecorded(false);
        }}
        aria-label={`Edit ${draft.angle} draft`}
        className="mt-4 min-h-32 w-full resize-y bg-transparent text-[17px] leading-7 outline-none"
      />

      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
        <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" />
        {draft.styleNote}
      </p>

      {rejected ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-danger">
          <span>
            Not right{rejectionLabel ? `: ${rejectionLabel}` : ""}
            {rejectionNote ? ` — ${rejectionNote}` : ""}
          </span>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 font-bold underline underline-offset-2"
            disabled={Boolean(pendingAction)}
            onClick={() => void runMutation(mutation("disliked", false))}
          >
            <RotateCcw className="size-3" /> Undo
          </button>
        </div>
      ) : null}

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button
          variant={selected ? "primary" : "secondary"}
          className="min-h-9 px-3.5 text-xs"
          onClick={() => void runMutation(mutation("selected", !selected))}
          disabled={disabled}
        >
          {pendingAction === "selected" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {selected ? "Selected" : "Use this"}
        </Button>
        <Button
          variant="ghost"
          className="min-h-9 px-3 text-xs"
          onClick={() => void copyDraft()}
          disabled={Boolean(pendingAction)}
        >
          <Copy className="size-3.5" /> {copyNotice || "Copy"}
        </Button>
        <Button
          variant="ghost"
          className="min-h-9 px-3 text-xs"
          onClick={() => void runMutation(mutation("saved", !saved))}
          disabled={disabled}
        >
          {pendingAction === "saved" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : saved ? (
            <Heart className="size-3.5 fill-current" />
          ) : (
            <Save className="size-3.5" />
          )}
          {saved ? "Saved" : "Save"}
        </Button>
        <Button
          variant={liked ? "secondary" : "ghost"}
          className="min-h-9 px-3 text-xs"
          onClick={() => void runMutation(mutation("liked", !liked))}
          disabled={disabled}
          aria-pressed={liked}
        >
          {pendingAction === "liked" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <ThumbsUp className={liked ? "size-3.5 fill-current" : "size-3.5"} />
          )}
          {liked ? "Liked" : "Like"}
        </Button>
        {!rejected ? (
          <div className="relative ml-auto">
            <Button
              variant="ghost"
              className="min-h-9 px-3 text-xs"
              onClick={() => setShowReasons((value) => !value)}
              disabled={disabled}
              aria-expanded={showReasons}
              aria-haspopup="menu"
            >
              <ThumbsDown className="size-3.5" /> Not right
            </Button>
            {showReasons ? (
              <div
                role="menu"
                aria-label="Why is this draft not right?"
                onKeyDown={(event) => {
                  if (event.key === "Escape") setShowReasons(false);
                }}
                className="absolute bottom-11 right-0 z-10 max-h-72 w-52 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl"
              >
                {rejectionReasons
                  .filter(({ code }) => code !== "other")
                  .map(({ code, label }) => (
                  <button
                    key={code}
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-canvas focus:bg-canvas"
                    onClick={() =>
                      void runMutation(mutation("disliked", true, code))
                    }
                  >
                    {label}
                  </button>
                  ))}
                {!showOtherInput ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-canvas focus:bg-canvas"
                    onClick={() => setShowOtherInput(true)}
                  >
                    Something else
                  </button>
                ) : (
                  <div className="mt-1 border-t border-line p-2">
                    <label className="block text-[11px] font-semibold text-muted">
                      What should change? <span className="font-normal">(optional)</span>
                      <textarea
                        value={otherNote}
                        onChange={(event) => setOtherNote(event.target.value)}
                        maxLength={280}
                        autoFocus
                        className="mt-1 min-h-16 w-full resize-y rounded-xl border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-forest"
                      />
                    </label>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold text-muted"
                        onClick={() => {
                          setShowOtherInput(false);
                          setOtherNote("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white"
                        onClick={() =>
                          void runMutation(
                            mutation("disliked", true, "other", otherNote),
                          )
                        }
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </footer>

      {message ? (
        <div role="alert" className="mt-3 flex items-center gap-3 text-xs text-danger">
          <span>{message}</span>
          {failedMutation ? (
            <button
              type="button"
              className="font-bold underline underline-offset-2"
              onClick={() => void runMutation(failedMutation.input)}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
