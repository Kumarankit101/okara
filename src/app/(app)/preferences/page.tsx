import type { Metadata } from "next";

import { MemoryView } from "@/components/memory/memory-view";

export const metadata: Metadata = { title: "Writing preferences" };

export default function PreferencesPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-forest">
        Personalization
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
        Writing preferences
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        Review and control the examples, edits, and corrections that can guide your next drafts.
      </p>
      <div className="mt-8">
        <MemoryView />
      </div>
    </main>
  );
}
