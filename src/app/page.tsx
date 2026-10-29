import { ArrowRight, Check, PencilLine, Sparkles } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";

const sampleDrafts = [
  {
    angle: "Observation",
    text: "The best writing systems don’t remove your voice. They remove the blank page.",
  },
  {
    angle: "Contrarian",
    text: "Consistency isn’t posting every day. It’s sounding like the same thoughtful person whenever you do.",
  },
  {
    angle: "Question",
    text: "What would you publish if the first draft already sounded like you?",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-deep"
          >
            Start writing <ArrowRight className="size-4" />
          </Link>
        </div>
      </nav>

      <section className="paper-grid relative border-y border-line">
        <div className="absolute -left-24 top-20 size-72 rounded-full bg-accent/35 blur-3xl" />
        <div className="absolute -right-20 bottom-0 size-80 rounded-full bg-forest/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-28">
          <div className="float-in max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-accent-soft px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-forest">
              <Sparkles className="size-3.5" /> Learns from every edit
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              Your voice,
              <br />
              past the blank page.
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-muted sm:text-xl">
              Give Okara a writing voice and a rough idea. Get five original X
              drafts, refine your favorite, and watch the suggestions get sharper
              over time.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-sm font-semibold text-white transition hover:bg-forest-deep"
              >
                Create your first drafts <ArrowRight className="size-4" />
              </Link>
              <span className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-medium text-muted">
                <Check className="size-4 text-forest" /> Draft-only. You stay in
                control.
              </span>
            </div>
          </div>

          <div className="soft-shadow float-in relative rounded-[2rem] border border-ink/10 bg-surface p-4 sm:p-6">
            <div className="flex items-center justify-between border-b border-line px-1 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
                  Topic
                </p>
                <p className="mt-1 font-medium">Why creative systems matter</p>
              </div>
              <div className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-forest">
                5 drafts
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {sampleDrafts.map((draft, index) => (
                <article
                  key={draft.angle}
                  className={`rounded-2xl border p-4 transition ${
                    index === 0
                      ? "border-forest bg-white shadow-sm"
                      : "border-line bg-canvas/60"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-forest">
                      {draft.angle}
                    </span>
                    {index === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                        <PencilLine className="size-3" /> editable
                      </span>
                    ) : null}
                  </div>
                  <p className="leading-6">{draft.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-3">
        {[
          ["01", "Bring a voice", "Use an authorized X handle or paste writing samples you own."],
          ["02", "Shape the idea", "Add the point, audience, and outcome. Okara creates five distinct angles."],
          ["03", "Teach by choosing", "Select, edit, save, or reject. Your decisions become private writing memory."],
        ].map(([number, title, body]) => (
          <div key={number} className="border-t border-ink/20 pt-5">
            <span className="font-mono text-xs font-semibold text-forest">{number}</span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
            <p className="mt-3 leading-7 text-muted">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-muted sm:flex-row">
          <Brand className="opacity-80" />
          <p>Original drafts. Explicit feedback. Private memory.</p>
        </div>
      </footer>
    </main>
  );
}
