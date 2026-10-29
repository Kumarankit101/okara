"use client";

import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  CircleSlash2,
  LoaderCircle,
  PencilLine,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { MemoryCategory } from "@/lib/learning/memory-presentation";

interface MemoryRecord {
  id: string;
  category: MemoryCategory;
  title: string;
  detail: string;
  evidence?: string;
  tags?: string[];
  before?: string;
  after?: string;
  example?: string;
  createdAt: string;
}

function Pills({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-forest"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  icon: typeof Brain;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-forest">
        <Icon className="size-4" />
      </span>
      <div>
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

export function MemoryView() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/memories", { cache: "no-store" });
        if (!response.ok) throw new Error("Memory request failed");
        const payload = (await response.json()) as { memories: MemoryRecord[] };
        setMemories(payload.memories);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return <LoaderCircle className="mx-auto mt-24 size-6 animate-spin text-forest" />;
  }

  if (failed) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-line text-center">
        <div className="max-w-sm px-6">
          <AlertCircle className="mx-auto size-7 text-danger" />
          <h2 className="mt-4 font-semibold">Memory could not be loaded</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Refresh the page to try again.</p>
        </div>
      </div>
    );
  }

  if (!memories.length) {
    return (
      <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-line text-center">
        <div className="max-w-sm px-6">
          <Brain className="mx-auto size-7 text-forest" />
          <h2 className="mt-4 font-semibold">Nothing learned yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Select, edit, save, like, or reject drafts. Clear signals will appear here in plain
            language.
          </p>
        </div>
      </div>
    );
  }

  const examples = memories.filter((memory) => memory.category === "example");
  const edits = memories.filter((memory) => memory.category === "edit");
  const insights = memories.filter((memory) => memory.category === "insight");
  const avoid = memories.filter((memory) => memory.category === "avoid");

  return (
    <div className="space-y-7">
      <section
        aria-label="Memory summary"
        className="grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3"
      >
        {[
          [examples.length, "good examples"],
          [edits.length, "rewrites learned from"],
          [avoid.length, "things to avoid"],
        ].map(([count, label], index) => (
          <div
            key={label}
            className={`px-5 py-4 ${index ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}
          >
            <p className="text-2xl font-semibold tracking-[-0.04em]">{count}</p>
            <p className="mt-0.5 text-xs font-semibold text-muted">{label}</p>
          </div>
        ))}
      </section>

      {insights.length > 0 && (
        <section aria-labelledby="memory-preferences" className="space-y-3">
          <SectionHeading
            id="memory-preferences"
            icon={SlidersHorizontal}
            title="Your writing preferences"
            description="Patterns inferred from your own rewrites. Early signals are labeled clearly."
          />
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {insights.map((memory) => (
              <article
                key={memory.id}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4"
              >
                <h3 className="text-sm font-semibold">{memory.title}</h3>
                <p className="text-sm leading-6 text-muted">{memory.detail}</p>
                {memory.evidence && (
                  <span className="w-fit rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted">
                    {memory.evidence}
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {examples.length > 0 && (
        <section aria-labelledby="memory-examples" className="space-y-3">
          <SectionHeading
            id="memory-examples"
            icon={CheckCircle2}
            title="Examples to follow"
            description="Drafts you selected, saved, liked, or copied after editing."
          />
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {examples.slice(0, 6).map((memory) => (
              <article key={memory.id} className="px-5 py-4">
                <p className="text-sm leading-6">“{memory.detail}”</p>
                <Pills
                  items={memory.tags?.length ? memory.tags : memory.evidence ? [memory.evidence] : []}
                />
              </article>
            ))}
          </div>
          {examples.length > 6 && (
            <p className="text-xs text-muted">Showing the 6 most recent of {examples.length} examples.</p>
          )}
        </section>
      )}

      {edits.length > 0 && (
        <section aria-labelledby="memory-edits" className="space-y-3">
          <SectionHeading
            id="memory-edits"
            icon={PencilLine}
            title="Rewrites Okara learned from"
            description="The exact changes behind your editing preferences."
          />
          <div className="space-y-3">
            {edits.slice(0, 3).map((memory) => (
              <article key={memory.id} className="rounded-2xl border border-line bg-surface p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                  <div className="rounded-xl bg-canvas p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Before</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {memory.before ?? "Original draft unavailable"}
                    </p>
                  </div>
                  <ArrowRight className="mx-auto size-4 rotate-90 self-center text-forest sm:rotate-0" />
                  <div className="rounded-xl bg-accent-soft/70 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-forest">
                      Your version
                    </p>
                    <p className="mt-2 text-sm leading-6">
                      {memory.after ?? "Edited draft unavailable"}
                    </p>
                  </div>
                </div>
                <Pills items={memory.tags} />
              </article>
            ))}
          </div>
          {edits.length > 3 && (
            <p className="text-xs text-muted">Showing the 3 most recent of {edits.length} rewrites.</p>
          )}
        </section>
      )}

      {avoid.length > 0 && (
        <section aria-labelledby="memory-avoid" className="space-y-3">
          <SectionHeading
            id="memory-avoid"
            icon={CircleSlash2}
            title="Things to avoid"
            description="Problems you explicitly marked as not right."
          />
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {avoid.slice(0, 5).map((memory) => (
              <article key={memory.id} className="px-5 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                  <h3 className="shrink-0 text-sm font-semibold text-danger">{memory.title}</h3>
                  <p className="text-sm leading-6 text-muted">{memory.detail}</p>
                </div>
                {memory.example && (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
                    Example: “{memory.example}”
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <p className="border-t border-line pt-5 text-xs leading-5 text-muted">
        Okara ranks these memories for each brief and sends only the most relevant few—not the
        entire list—to the generation model. This memory is private to your account and voice.
      </p>
    </div>
  );
}
