"use client";

import { Clock3, FileText, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface HistoryDraft {
  id: string;
  text: string;
  angle: string;
  isSaved?: boolean;
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
          <header className="flex flex-col justify-between gap-2 sm:flex-row">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest">
                {run.profileName}
              </p>
              <h2 className="mt-2 max-w-3xl font-semibold">{run.brief}</h2>
            </div>
            <time className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <Clock3 className="size-3.5" />
              {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                new Date(run.createdAt),
              )}
            </time>
          </header>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {run.drafts.map((draft) => (
              <div key={draft.id} className="rounded-2xl bg-canvas p-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  {draft.angle}
                </span>
                <p className="mt-2 text-sm leading-6">{draft.text}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
