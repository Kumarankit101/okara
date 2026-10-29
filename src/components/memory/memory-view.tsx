"use client";

import { Brain, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface MemoryRecord {
  id: string;
  kind: "positive_example" | "negative_rule" | "edit_pattern" | "aggregate_summary";
  title: string;
  detail: string;
  weight: number;
  createdAt: string;
}

export function MemoryView() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/memories", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as { memories: MemoryRecord[] };
          setMemories(payload.memories);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return <LoaderCircle className="mx-auto mt-24 size-6 animate-spin text-forest" />;
  }

  if (!memories.length) {
    return (
      <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-line text-center">
        <div className="max-w-sm">
          <Brain className="mx-auto size-7 text-forest" />
          <h2 className="mt-4 font-semibold">Nothing learned yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Select, edit, save, or reject drafts. Strong signals become private writing memory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {memories.map((memory) => (
        <article key={memory.id} className="rounded-3xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-forest">
              <Sparkles className="size-4" />
            </span>
            <span className="rounded-full bg-canvas px-2.5 py-1 font-mono text-[10px] uppercase text-muted">
              {memory.kind.replaceAll("_", " ")}
            </span>
          </div>
          <h2 className="mt-4 font-semibold">{memory.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{memory.detail}</p>
        </article>
      ))}
    </div>
  );
}
