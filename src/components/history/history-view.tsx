"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Hash,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Objective = "engage" | "educate" | "announce" | "persuade" | "entertain";

interface HistorySummary {
  id: string;
  brief: string;
  createdAt: string;
  profileName: string;
  objective: Objective;
}

interface HistoryDraft {
  id: string;
  text: string;
  angle: string;
  isSaved: boolean;
  isSelected: boolean;
  isLiked?: boolean;
}

interface HistoryRunDetail extends HistorySummary {
  voiceProfileId: string;
  toneIntensity: number;
  characterLimit: number;
  includeHashtags: boolean;
  correction?: string;
  drafts: HistoryDraft[];
}

const PAGE_SIZE = 20;

const objectiveLabels: Record<Objective, string> = {
  engage: "Engage",
  educate: "Educate",
  announce: "Announce",
  persuade: "Persuade",
  entertain: "Entertain",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function HistoryView() {
  const [runs, setRuns] = useState<HistorySummary[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setListError("");
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
        if (debouncedQuery) params.set("query", debouncedQuery);
        const response = await fetch(`/api/generations?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("History could not be loaded.");
        const payload = (await response.json()) as {
          runs: HistorySummary[];
          hasMore: boolean;
          total: number;
        };
        setRuns(payload.runs);
        setHasMore(payload.hasMore);
        setTotal(payload.total);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListError("History could not be loaded. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    if (!selectedRunId) return;
    const controller = new AbortController();

    async function loadDetail() {
      try {
        const response = await fetch(
          `/api/generations?runId=${encodeURIComponent(selectedRunId!)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Generation details could not be loaded.");
        const payload = (await response.json()) as { run: HistoryRunDetail };
        setDetail(payload.run);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError("Generation details could not be loaded. Please try again.");
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => controller.abort();
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedRunId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedRunId]);

  async function loadMore() {
    setLoadingMore(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(runs.length),
      });
      if (debouncedQuery) params.set("query", debouncedQuery);
      const response = await fetch(`/api/generations?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("More history could not be loaded.");
      const payload = (await response.json()) as {
        runs: HistorySummary[];
        hasMore: boolean;
        total: number;
      };
      setRuns((current) => [...current, ...payload.runs]);
      setHasMore(payload.hasMore);
      setTotal(payload.total);
    } catch {
      setListError("More history could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function closeDrawer() {
    setSelectedRunId(null);
    setDetail(null);
    setDetailError("");
  }

  function openDrawer(runId: string) {
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    setSelectedRunId(runId);
  }

  return (
    <>
      <section aria-label="Generation history">
        <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Search generation briefs</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by what you wanted to write…"
              className="min-h-12 w-full rounded-2xl border border-line bg-surface pl-11 pr-4 text-sm placeholder:text-muted/80 focus:border-forest"
            />
          </label>
          {!loading && total > 0 ? (
            <p className="text-sm text-muted">
              Showing {runs.length} of {total} generation{total === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="size-6 animate-spin text-forest" />
          </div>
        ) : listError && !runs.length ? (
          <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-line text-center text-sm text-danger">
            {listError}
          </div>
        ) : !runs.length ? (
          <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-line text-center">
            <div>
              <FileText className="mx-auto size-7 text-forest" />
              <h2 className="mt-4 font-semibold">
                {debouncedQuery ? "No matching generations" : "No generations yet"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {debouncedQuery
                  ? "Try a different word from your original brief."
                  : "Your writing briefs will collect here."}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => openDrawer(run.id)}
                aria-label={`Open details for ${run.brief}`}
                className="group grid w-full gap-3 py-5 text-left transition hover:bg-surface/70 focus-visible:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"
              >
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-base font-semibold leading-6 group-hover:text-forest sm:text-lg">
                    {run.brief}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="font-semibold text-forest">{run.profileName}</span>
                    <span>{objectiveLabels[run.objective]}</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" /> {formatDate(run.createdAt)}
                    </span>
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-forest">
                  View details
                  <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        )}

        {listError && runs.length ? (
          <p role="alert" className="mt-4 text-center text-sm text-danger">
            {listError}
          </p>
        ) : null}
        {hasMore ? (
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Load 20 more
            </Button>
          </div>
        ) : null}
      </section>

      {selectedRunId ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close generation details"
            className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
            onClick={closeDrawer}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-drawer-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-line bg-canvas shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">
                  Generation details
                </p>
                <h2 id="history-drawer-title" className="mt-2 line-clamp-3 text-xl font-semibold tracking-[-0.025em]">
                  {detail?.brief ?? runs.find((run) => run.id === selectedRunId)?.brief ?? "Loading generation"}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeDrawer}
                aria-label="Close details"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-canvas text-muted transition hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </header>

            {detailLoading ? (
              <div className="grid flex-1 place-items-center">
                <LoaderCircle className="size-6 animate-spin text-forest" />
              </div>
            ) : detailError ? (
              <div className="grid flex-1 place-items-center px-6 text-center text-sm text-danger">
                {detailError}
              </div>
            ) : detail ? (
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-accent-soft px-3 py-1.5 font-semibold text-forest">
                    {detail.profileName}
                  </span>
                  <span className="rounded-full border border-line bg-surface px-3 py-1.5">
                    Goal: {objectiveLabels[detail.objective]}
                  </span>
                  <span className="rounded-full border border-line bg-surface px-3 py-1.5">
                    Tone: {detail.toneIntensity}/5
                  </span>
                  <span className="rounded-full border border-line bg-surface px-3 py-1.5">
                    Limit: {detail.characterLimit}
                  </span>
                  {detail.includeHashtags ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5">
                      <Hash className="size-3" /> Hashtags
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" /> {formatDate(detail.createdAt)}
                  </span>
                  <Link
                    href={`/dashboard?run=${encodeURIComponent(detail.id)}`}
                    className="inline-flex items-center gap-1.5 font-bold text-forest hover:underline"
                  >
                    Open complete run in Write <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>

                {detail.correction ? (
                  <section className="mt-6 rounded-2xl border border-line bg-surface p-4">
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                      <SlidersHorizontal className="size-3.5" /> Extra direction
                    </h3>
                    <p className="mt-2 text-sm leading-6">{detail.correction}</p>
                  </section>
                ) : null}

                <section className="mt-7">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Sparkles className="size-4 text-forest" /> Drafts
                    </h3>
                    <span className="text-xs text-muted">{detail.drafts.length} generated</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {detail.drafts.map((draft) => (
                      <article key={draft.id} className="rounded-2xl border border-line bg-surface p-4">
                        <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                          <span>{draft.angle}</span>
                          <span className="flex items-center gap-2 text-forest">
                            {draft.isSelected ? (
                              <span className="inline-flex items-center gap-1"><Check className="size-3" /> Selected</span>
                            ) : draft.isSaved ? (
                              "Saved"
                            ) : draft.isLiked ? (
                              "Liked"
                            ) : null}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{draft.text}</p>
                        <Link
                          href={`/dashboard?run=${encodeURIComponent(detail.id)}&draft=${encodeURIComponent(draft.id)}`}
                          aria-label={`Open ${draft.angle} draft in Write`}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-forest hover:underline"
                        >
                          Continue with this draft <ArrowRight className="size-3.5" />
                        </Link>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}
