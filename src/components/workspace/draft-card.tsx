"use client";

import {
  Check,
  Copy,
  Heart,
  MessageSquareWarning,
  Save,
  ThumbsDown,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { GeneratedDraft } from "@/lib/contracts";

export interface DraftRecord extends GeneratedDraft {
  id: string;
  isSaved?: boolean;
  isSelected?: boolean;
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
  onFeedback: (
    draftId: string,
    eventType: string,
    editedText?: string,
    reasonCode?: string,
  ) => Promise<void>;
}) {
  const [text, setText] = useState(draft.text);
  const [saved, setSaved] = useState(Boolean(draft.isSaved));
  const [selected, setSelected] = useState(Boolean(draft.isSelected));
  const [showReasons, setShowReasons] = useState(false);
  const count = Array.from(text).length;

  async function copyDraft() {
    await navigator.clipboard.writeText(text);
    await onFeedback(draft.id, "copied", text === draft.text ? undefined : text);
  }

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
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-forest">
          {draft.angle}
        </span>
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
        onChange={(event) => setText(event.target.value)}
        aria-label={`Edit ${draft.angle} draft`}
        className="mt-4 min-h-32 w-full resize-y bg-transparent text-[17px] leading-7 outline-none"
      />

      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
        <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" />
        {draft.styleNote}
      </p>

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button
          variant={selected ? "primary" : "secondary"}
          className="min-h-9 px-3.5 text-xs"
          onClick={async () => {
            await onFeedback(draft.id, "selected", text);
            setSelected(true);
          }}
          disabled={count > characterLimit}
        >
          <Check className="size-3.5" /> {selected ? "Selected" : "Use this"}
        </Button>
        <Button
          variant="ghost"
          className="min-h-9 px-3 text-xs"
          onClick={copyDraft}
        >
          <Copy className="size-3.5" /> Copy
        </Button>
        <Button
          variant="ghost"
          className="min-h-9 px-3 text-xs"
          onClick={async () => {
            await onFeedback(draft.id, "saved", text);
            setSaved(true);
          }}
        >
          {saved ? <Heart className="size-3.5 fill-current" /> : <Save className="size-3.5" />}
          {saved ? "Saved" : "Save"}
        </Button>
        <div className="relative ml-auto">
          <Button
            variant="ghost"
            className="min-h-9 px-3 text-xs"
            onClick={() => setShowReasons((value) => !value)}
          >
            <ThumbsDown className="size-3.5" /> Not right
          </Button>
          {showReasons ? (
            <div className="absolute bottom-11 right-0 z-10 w-52 rounded-2xl border border-line bg-white p-2 shadow-xl">
              {[
                ["too_generic", "Too generic"],
                ["too_long", "Too long"],
                ["wrong_tone", "Wrong tone"],
                ["repetitive", "Repetitive"],
                ["inaccurate", "Inaccurate"],
                ["too_promotional", "Too promotional"],
              ].map(([code, label]) => (
                <button
                  key={code}
                  className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-canvas"
                  onClick={async () => {
                    await onFeedback(draft.id, "disliked", undefined, code);
                    setShowReasons(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
