"use client";

import {
  AlertCircle,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  CircleSlash2,
  EyeOff,
  LoaderCircle,
  PencilLine,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { MemoryCategory } from "@/lib/learning/memory-presentation";

interface VoiceProfile {
  id: string;
  displayName: string;
  handle: string | null;
}

type MemoryScope =
  | { type: "global"; label: string }
  | { type: "voice"; voiceProfileId: string; label: string };

interface MemoryRecord {
  id: string;
  memoryId: string;
  category: MemoryCategory;
  title: string;
  detail: string;
  evidence?: string;
  tags?: string[];
  before?: string;
  after?: string;
  example?: string;
  createdAt: string;
  scope: MemoryScope;
}

function scopeKey(scope: MemoryScope) {
  return scope.type === "global" ? "global" : `voice:${scope.voiceProfileId}`;
}

function preferredScope(memories: MemoryRecord[]) {
  const global = memories.find((memory) => memory.scope.type === "global");
  return global ? "global" : memories[0] ? scopeKey(memories[0].scope) : "global";
}

function scopeInput(scope: MemoryScope) {
  return scope.type === "global"
    ? { type: "global" as const }
    : { type: "voice" as const, voiceProfileId: scope.voiceProfileId };
}

function ScopeBadge({ scope }: { scope: MemoryScope }) {
  return (
    <span className="inline-flex w-fit rounded-full border border-forest/15 bg-accent-soft/60 px-2.5 py-1 text-[11px] font-semibold text-forest">
      {scope.type === "global" ? "Global · All voices" : `Voice · ${scope.label}`}
    </span>
  );
}

interface RemovedPreference {
  memoryId: string;
  records: MemoryRecord[];
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

function StopUsingButton({
  label,
  memoryId,
  pending,
  onStop,
}: {
  label: string;
  memoryId: string;
  pending: boolean;
  onStop: (memoryId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Stop using ${label}`}
      disabled={pending}
      onClick={() => onStop(memoryId)}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-wait disabled:opacity-50"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <EyeOff className="size-3.5" />}
      Stop using
    </button>
  );
}

function ManageScopeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Manage scope for ${label}`}
      onClick={onClick}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-forest transition hover:bg-accent-soft"
    >
      <SlidersHorizontal className="size-3.5" />
      Manage scope
    </button>
  );
}

function ManageActions({
  label,
  memory,
  pending,
  onScope,
  onStop,
}: {
  label: string;
  memory: MemoryRecord;
  pending: boolean;
  onScope: (memory: MemoryRecord) => void;
  onStop: (memoryId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <ManageScopeButton label={label} onClick={() => onScope(memory)} />
      <StopUsingButton
        label={label}
        memoryId={memory.memoryId}
        pending={pending}
        onStop={onStop}
      />
    </div>
  );
}

function PreferenceNotice({
  removed,
  pending,
  error,
  onUndo,
}: {
  removed: RemovedPreference | null;
  pending: boolean;
  error: string | null;
  onUndo: () => void;
}) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!removed) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-forest/15 bg-accent-soft/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span>This preference will no longer guide future drafts.</span>
      <button
        type="button"
        disabled={pending}
        onClick={onUndo}
        className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-full px-3 font-semibold text-forest hover:bg-white/70 disabled:cursor-wait disabled:opacity-50"
      >
        {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        Undo
      </button>
    </div>
  );
}

export function MemoryView() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [managing, setManaging] = useState(false);
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RemovedPreference | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState("global");
  const [scopeMemory, setScopeMemory] = useState<MemoryRecord | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [copyTargets, setCopyTargets] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/memories", { cache: "no-store" });
        if (!response.ok) throw new Error("Memory request failed");
        const payload = (await response.json()) as {
          profiles?: VoiceProfile[];
          memories: MemoryRecord[];
        };
        const normalizedMemories = payload.memories.map((memory) => ({
          ...memory,
          scope: memory.scope ?? ({ type: "global", label: "All voices" } as const),
        }));
        setMemories(normalizedMemories);
        setFilter(preferredScope(normalizedMemories));
        setProfiles(payload.profiles ?? []);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function setPreferenceActive(memoryId: string, active: boolean) {
    const response = await fetch("/api/memories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setActive", memoryId, active }),
    });
    if (!response.ok) throw new Error("Preference update failed");
  }


  async function refreshMemories() {
    const response = await fetch("/api/memories", { cache: "no-store" });
    if (!response.ok) throw new Error("Memory request failed");
    const payload = (await response.json()) as {
      profiles?: VoiceProfile[];
      memories: MemoryRecord[];
    };
    const normalizedMemories = payload.memories.map((memory) => ({
      ...memory,
      scope: memory.scope ?? ({ type: "global", label: "All voices" } as const),
    }));
    const refreshedProfiles = payload.profiles ?? [];
    setMemories(normalizedMemories);
    setFilter((current) => {
      const currentStillExists =
        current === "global" ||
        refreshedProfiles.some((profile) => `voice:${profile.id}` === current);
      return currentStillExists ? current : preferredScope(normalizedMemories);
    });
    setProfiles(refreshedProfiles);
  }

  function scopeFromKey(key: string): MemoryScope | null {
    if (key === "global") return { type: "global", label: "All voices" };
    const id = key.replace(/^voice:/, "");
    const profile = profiles.find((item) => item.id === id);
    return profile
      ? { type: "voice", voiceProfileId: profile.id, label: profile.displayName }
      : null;
  }

  function openScopeManager(memory: MemoryRecord) {
    setMutationError(null);
    setStatus(null);
    setMoveTarget(scopeKey(memory.scope));
    setCopyTargets([]);
    setScopeMemory(memory);
  }

  async function mutateScope(action: "move" | "copy") {
    if (!scopeMemory || pendingMemoryId) return;
    const target = scopeFromKey(moveTarget);
    const targets = copyTargets.map(scopeFromKey).filter((scope): scope is MemoryScope => !!scope);
    if ((action === "move" && !target) || (action === "copy" && !targets.length)) return;
    setPendingMemoryId(scopeMemory.memoryId);
    setMutationError(null);
    try {
      const body =
        action === "move"
          ? { action: "setScope", memoryId: scopeMemory.memoryId, scope: scopeInput(target!) }
          : {
              action: "copy",
              memoryId: scopeMemory.memoryId,
              targets: targets.map(scopeInput),
            };
      const response = await fetch("/api/memories", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Preference update failed");
      await refreshMemories();
      if (action === "move" && target) setFilter(scopeKey(target));
      setScopeMemory(null);
      setStatus(
        action === "move"
          ? `Preference moved to ${target?.label}.`
          : `Preference copied to ${targets.map((item) => item.label).join(", ")}.`,
      );
    } catch {
      setMutationError(
        action === "move"
          ? "This preference could not be moved. Please try again."
          : "This preference could not be copied. Please try again.",
      );
    } finally {
      setPendingMemoryId(null);
    }
  }

  async function stopUsing(memoryId: string) {
    const records = memories.filter((memory) => memory.memoryId === memoryId);
    if (!records.length) return;
    setPendingMemoryId(memoryId);
    setMutationError(null);
    try {
      await setPreferenceActive(memoryId, false);
      setMemories((current) => current.filter((memory) => memory.memoryId !== memoryId));
      setRemoved({ memoryId, records });
    } catch {
      setMutationError("That preference could not be updated. Please try again.");
    } finally {
      setPendingMemoryId(null);
    }
  }

  async function undoRemoval() {
    if (!removed) return;
    const snapshot = removed;
    setPendingMemoryId(snapshot.memoryId);
    setMutationError(null);
    try {
      await setPreferenceActive(snapshot.memoryId, true);
      setMemories((current) =>
        [...snapshot.records, ...current].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
      );
      setRemoved(null);
    } catch {
      setMutationError("Undo could not be completed. Please try again.");
    } finally {
      setPendingMemoryId(null);
    }
  }

  if (loading) {
    return <LoaderCircle className="mx-auto mt-24 size-6 animate-spin text-forest" />;
  }

  if (failed) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-line text-center">
        <div className="max-w-sm px-6">
          <AlertCircle className="mx-auto size-7 text-danger" />
          <h2 className="mt-4 font-semibold">Preferences could not be loaded</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Refresh the page to try again.</p>
        </div>
      </div>
    );
  }

  if (!memories.length) {
    return (
      <div className="space-y-4">
        <PreferenceNotice
          removed={removed}
          pending={pendingMemoryId !== null}
          error={mutationError}
          onUndo={undoRemoval}
        />
        <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-line text-center">
          <div className="max-w-sm px-6">
            <Brain className="mx-auto size-7 text-forest" />
            <h2 className="mt-4 font-semibold">No active preferences yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Select, edit, save, like, or reject drafts. Clear preferences will appear here in
              plain language.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const visibleMemories = memories.filter((memory) => scopeKey(memory.scope) === filter);
  const examples = visibleMemories.filter((memory) => memory.category === "example");
  const edits = visibleMemories.filter((memory) => memory.category === "edit");
  const insights = visibleMemories.filter((memory) => memory.category === "insight");
  const avoid = visibleMemories.filter((memory) => memory.category === "avoid");

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">
            {managing ? "Manage where preferences apply" : "You control these preferences"}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            {managing
              ? "Move, copy, or stop a preference while keeping your feedback history intact."
              : "Only active preferences can influence future drafts. You can stop using any item and undo the change."}
          </p>
        </div>
        <Button
          variant="secondary"
          className="min-h-9 shrink-0 px-4 text-xs"
          aria-pressed={managing}
          onClick={() => {
            setManaging((current) => !current);
            setMutationError(null);
          }}
        >
          {managing ? <Check className="size-3.5" /> : <Settings2 className="size-3.5" />}
          {managing ? "Done" : "Manage preferences"}
        </Button>
      </section>

      <PreferenceNotice
        removed={removed}
        pending={pendingMemoryId !== null}
        error={scopeMemory ? null : mutationError}
        onUndo={undoRemoval}
      />

      {status && (
        <p role="status" className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-forest">
          {status}
        </p>
      )}

      <nav aria-label="Filter preferences by where they apply" className="flex gap-2 overflow-x-auto pb-1">
        {[
          ["global", "Global"],
          ...profiles.map((profile) => [`voice:${profile.id}`, profile.displayName]),
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition ${
              filter === value
                ? "border-forest bg-forest text-white"
                : "border-line bg-surface text-muted hover:border-forest/30 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section
        aria-label="Preference summary"
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

      {!visibleMemories.length && (
        <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
          <h2 className="text-sm font-semibold">No preferences in this scope yet</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Move or copy a preference here from another voice.
          </p>
        </div>
      )}

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
                <div className="flex flex-wrap items-center gap-2">
                  <ScopeBadge scope={memory.scope} />
                  {memory.evidence && (
                    <span className="w-fit rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted">
                      {memory.evidence}
                    </span>
                  )}
                  {managing && (
                    <ManageActions
                      label={memory.title}
                      memory={memory}
                      pending={pendingMemoryId === memory.memoryId}
                      onScope={openScopeManager}
                      onStop={stopUsing}
                    />
                  )}
                </div>
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
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-6">“{memory.detail}”</p>
                  {managing && (
                    <ManageActions
                      label={`example: ${memory.detail.slice(0, 48)}`}
                      memory={memory}
                      pending={pendingMemoryId === memory.memoryId}
                      onScope={openScopeManager}
                      onStop={stopUsing}
                    />
                  )}
                </div>
                <div className="mt-2"><ScopeBadge scope={memory.scope} /></div>
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
                {managing && (
                  <div className="mb-3 flex justify-end">
                    <ManageActions
                      label="this rewrite"
                      memory={memory}
                      pending={pendingMemoryId === memory.memoryId}
                      onScope={openScopeManager}
                      onStop={stopUsing}
                    />
                  </div>
                )}
                <div className="mb-3"><ScopeBadge scope={memory.scope} /></div>
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                    <h3 className="shrink-0 text-sm font-semibold text-danger">{memory.title}</h3>
                    <p className="text-sm leading-6 text-muted">{memory.detail}</p>
                  </div>
                  {managing && (
                    <ManageActions
                      label={memory.title}
                      memory={memory}
                      pending={pendingMemoryId === memory.memoryId}
                      onScope={openScopeManager}
                      onStop={stopUsing}
                    />
                  )}
                </div>
                <div className="mt-2"><ScopeBadge scope={memory.scope} /></div>
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

      {scopeMemory && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-end bg-ink/35 p-0 sm:place-items-center sm:p-6"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pendingMemoryId) setScopeMemory(null);
          }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !pendingMemoryId) setScopeMemory(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-dialog-title"
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-xl sm:max-w-lg sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="scope-dialog-title" className="text-lg font-semibold">Manage where this applies</h2>
                <p className="mt-1 text-sm text-muted">
                  Currently: <span className="font-semibold text-ink">{scopeMemory.scope.label}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label="Close scope manager"
                autoFocus
                disabled={pendingMemoryId !== null}
                onClick={() => setScopeMemory(null)}
                className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-canvas disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            {mutationError && (
              <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                {mutationError}
              </p>
            )}

            <fieldset className="mt-6">
              <legend className="font-semibold">Move</legend>
              <p className="mt-1 text-xs leading-5 text-muted">
                This changes where the original preference applies.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ["global", "Global", "Use for all voices"],
                  ...profiles.map((profile) => [
                    `voice:${profile.id}`,
                    profile.displayName,
                    "Use for this voice only",
                  ]),
                ].map(([value, label, description]) => (
                  <label key={value} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 text-sm">
                    <input
                      type="radio"
                      name="move-scope"
                      value={value}
                      checked={moveTarget === value}
                      onChange={() => setMoveTarget(value)}
                    />
                    <span><span className="block font-semibold">{label}</span><span className="text-xs text-muted">{description}</span></span>
                  </label>
                ))}
              </div>
              <Button
                className="mt-3 w-full sm:w-auto"
                disabled={pendingMemoryId !== null || moveTarget === scopeKey(scopeMemory.scope)}
                onClick={() => void mutateScope("move")}
              >
                {pendingMemoryId ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Move preference
              </Button>
            </fieldset>

            <fieldset className="mt-7 border-t border-line pt-6">
              <legend className="font-semibold">Copy</legend>
              <p className="mt-1 text-xs leading-5 text-muted">
                Copies are independent. Later changes to one will not affect the others.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  { key: "global", label: "Global", description: "Copy for all voices" },
                  ...profiles.map((profile) => ({
                    key: `voice:${profile.id}`,
                    label: profile.displayName,
                    description: "Copy for this voice",
                  })),
                ].filter((option) => option.key !== scopeKey(scopeMemory.scope)).map((option) => (
                  <label key={option.key} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={copyTargets.includes(option.key)}
                      onChange={() => setCopyTargets((current) =>
                        current.includes(option.key)
                          ? current.filter((key) => key !== option.key)
                          : [...current, option.key],
                      )}
                    />
                    <span><span className="block font-semibold">{option.label}</span><span className="text-xs text-muted">{option.description}</span></span>
                  </label>
                ))}
              </div>
              <Button
                variant="secondary"
                className="mt-3 w-full sm:w-auto"
                disabled={pendingMemoryId !== null || copyTargets.length === 0}
                onClick={() => void mutateScope("copy")}
              >
                {pendingMemoryId ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Copy preference
              </Button>
            </fieldset>
          </div>
        </div>
      )}

      <p className="border-t border-line pt-5 text-xs leading-5 text-muted">
        Okara ranks these preferences for each brief and sends only the most relevant few—not the
        entire list—to the generation model. They are private to your account and chosen scope.
      </p>
    </div>
  );
}
