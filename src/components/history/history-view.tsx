"use client";

import { ArrowUpRight, Clock3, FileText, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface HistoryDraft {
  id: string;
  text: string;
  angle: string;
  isSaved: boolean;
  isSelected: boolean;
}

interface HistoryRun {
  id: string;
  brief: string;
  createdAt: string;
  profileName: string;
  drafts: HistoryDraft[];
}

export function HistoryView() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/generations", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as { runs: HistoryRun[] };
          setRuns(payload.runs);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-72 place-items-center">
        <LoaderCircle className="size-6 animate-spin text-forest" />
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-line text-center">
        <div>
          <FileText className="mx-auto size-7 text-forest" />
          <h2 className="mt-4 font-semibold">No generations yet</h2>
          <p className="mt-2 text-sm text-muted">Your briefs and drafts will collect here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {runs.map((run) => (
        <article key={run.id} className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <header className="flex flex-col justify-between gap-3 sm:flex-row">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest">
                {run.profileName}
              </p>
              <h2 className="mt-2 max-w-3xl font-semibold">{run.brief}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <time className="flex items-center gap-1.5 text-xs text-muted">
                <Clock3 className="size-3.5" />
                {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                  new Date(run.createdAt),
                )}
              </time>
              <Link
                href={`/dashboard?run=${encodeURIComponent(run.id)}`}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold text-forest hover:bg-canvas"
              >
                Open in Write <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </header>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {run.drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/dashboard?run=${encodeURIComponent(run.id)}&draft=${encodeURIComponent(draft.id)}`}
                aria-label={`Open ${draft.angle} draft in Write`}
                className="group rounded-2xl bg-canvas p-4 transition hover:-translate-y-0.5 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-forest"
              >
                <span className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  {draft.angle}
                  <span className="flex items-center gap-2">
                    {draft.isSelected ? "Selected" : draft.isSaved ? "Saved" : null}
                    <ArrowUpRight className="size-3.5 text-forest transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </span>
                <p className="mt-2 text-sm leading-6">{draft.text}</p>
              </Link>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
