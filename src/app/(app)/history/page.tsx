import type { Metadata } from "next";

import { HistoryView } from "@/components/history/history-view";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-forest">
        Draft archive
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
        History
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        Find a past brief, then open its details and drafts without scanning a wall of posts.
      </p>
      <div className="mt-8">
        <HistoryView />
      </div>
    </main>
  );
}
