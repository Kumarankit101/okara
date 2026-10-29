"use client";

import {
  AlertCircle,
  AtSign,
  ChevronDown,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DraftCard,
  type DraftRecord,
  type FeedbackMutationInput,
  type FeedbackMutationResult,
} from "./draft-card";

interface VoiceProfileSummary {
  id: string;
  handle: string | null;
  displayName: string;
  sourceType: "x_api" | "pasted";
  status: "syncing" | "ready" | "failed";
}

type SourceMode = "x_api" | "pasted";

interface RestoredGeneration {
  id: string;
  createdAt: string;
  profileName: string;
  voiceProfileId: string;
  brief: string;
  objective: "engage" | "educate" | "announce" | "persuade" | "entertain";
  toneIntensity: number;
  characterLimit: number;
  includeHashtags: boolean;
  correction?: string;
  drafts: DraftRecord[];
}

export function Workspace({
  restoredRunId,
  highlightedDraftId,
}: {
  restoredRunId?: string;
  highlightedDraftId?: string;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<VoiceProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("pasted");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [samples, setSamples] = useState("");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [brief, setBrief] = useState("");
  const [objective, setObjective] = useState("engage");
  const [toneIntensity, setToneIntensity] = useState(3);
  const [characterLimit, setCharacterLimit] = useState(280);
  const [includeHashtags, setIncludeHashtags] = useState(false);
  const [correction, setCorrection] = useState("");
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringRun, setRestoringRun] = useState(Boolean(restoredRunId));
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [error, setError] = useState("");
  const generationInFlight = useRef(false);
  const generationAttempt = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId),
    [profiles, activeProfileId],
  );

  useEffect(() => {
    async function loadProfiles() {
      setProfilesLoading(true);
      try {
        const response = await fetch("/api/voice-profiles", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          profiles: VoiceProfileSummary[];
        };
        setProfiles(payload.profiles);
        setActiveProfileId(
          (current) => current || payload.profiles[0]?.id || "",
        );
      } finally {
        setProfilesLoading(false);
      }
    }
    void loadProfiles();
  }, []);

  useEffect(() => {
    if (!restoredRunId) return;

    let cancelled = false;
    async function restoreGeneration() {
      await Promise.resolve();
      if (cancelled) return;
      setRestoringRun(true);
      setError("");
      try {
        const response = await fetch(
          `/api/generations?runId=${encodeURIComponent(restoredRunId!)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          run?: RestoredGeneration;
          error?: { message?: string };
        };
        if (!response.ok || !payload.run) {
          throw new Error(payload.error?.message ?? "Could not restore that generation.");
        }
        if (cancelled) return;
        setActiveProfileId(payload.run.voiceProfileId);
        setBrief(payload.run.brief);
        setObjective(payload.run.objective);
        setToneIntensity(payload.run.toneIntensity);
        setCharacterLimit(payload.run.characterLimit);
        setIncludeHashtags(payload.run.includeHashtags);
        setCorrection(payload.run.correction ?? "");
        setDrafts(payload.run.drafts);
        setRestoredAt(payload.run.createdAt);
        generationAttempt.current = null;
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Could not restore that generation.",
          );
        }
      } finally {
        if (!cancelled) setRestoringRun(false);
      }
    }
    void restoreGeneration();
    return () => {
      cancelled = true;
    };
  }, [restoredRunId]);

  useEffect(() => {
    if (!highlightedDraftId || restoringRun || !drafts.length) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`draft-${highlightedDraftId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drafts, highlightedDraftId, restoringRun]);

  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !authorizationConfirmed) return;
    setLoading(true);
    setError("");

    const sampleList = samples
      .split(/\n\s*\n/)
      .map((sample) => sample.trim())
      .filter(Boolean);
    const body =
      sourceMode === "x_api"
        ? { sourceType: "x_api", handle, authorizationConfirmed }
        : {
            sourceType: "pasted",
            handle: handle || undefined,
            displayName,
            samples: sampleList,
            authorizationConfirmed,
          };

    try {
      const response = await fetch("/api/voice-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        profile?: VoiceProfileSummary;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error?.message ?? "Could not create that voice profile.");
      }
      setProfiles((current) => [payload.profile!, ...current]);
      setActiveProfileId(payload.profile.id);
      setHandle("");
      setDisplayName("");
      setSamples("");
      setAuthorizationConfirmed(false);
      setShowProfileForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create profile.");
    } finally {
      setLoading(false);
    }
  }

  async function generateDrafts(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generationInFlight.current) return;
    if (!activeProfileId) {
      setError("Create or choose a voice profile first.");
      return;
    }
    const requestBody = {
      voiceProfileId: activeProfileId,
      brief,
      objective,
      toneIntensity,
      characterLimit,
      includeHashtags,
      correction: correction.trim() || undefined,
    };
    const fingerprint = JSON.stringify(requestBody);
    const idempotencyKey =
      generationAttempt.current?.fingerprint === fingerprint
        ? generationAttempt.current.idempotencyKey
        : crypto.randomUUID();
    generationAttempt.current = { fingerprint, idempotencyKey };
    generationInFlight.current = true;
    setLoading(true);
    setError("");
    setDrafts([]);
    setRestoredAt(null);
    if (restoredRunId) router.replace("/dashboard", { scroll: false });
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as {
        drafts?: DraftRecord[];
        error?: { message?: string };
      };
      if (!response.ok || !payload.drafts) {
        throw new Error(payload.error?.message ?? "Draft generation failed.");
      }
      setDrafts(payload.drafts);
      generationAttempt.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Draft generation failed.");
    } finally {
      generationInFlight.current = false;
      setLoading(false);
    }
  }

  async function sendFeedback(
    input: FeedbackMutationInput,
  ): Promise<FeedbackMutationResult> {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as {
      state?: FeedbackMutationResult;
      error?: { message?: string };
    };
    if (!response.ok || !payload.state) {
      const message = payload.error?.message ?? "Feedback was not saved.";
      setError(message);
      throw new Error(message);
    }
    const state = payload.state;
    setError("");
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id === input.draftId) {
          return {
            ...draft,
            text: state.currentText,
            characterCount: Array.from(state.currentText).length,
            isSelected: state.selected,
            isSaved: state.saved,
            isLiked: state.liked,
            isRejected: state.rejected,
            rejectionReason: state.reasonCode ?? null,
            rejectionNote: state.reasonNote ?? null,
            revision: state.revision,
          };
        }
        return input.eventType === "selected" && input.active
          ? { ...draft, isSelected: false }
          : draft;
      }),
    );
    return state;
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-forest">
            Writing workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Turn the idea into the draft.
          </h1>
        </div>
        {profiles.length ? (
          <label className="relative block min-w-56">
            <span className="sr-only">Active voice profile</span>
            <select
              value={activeProfileId}
              onChange={(event) => setActiveProfileId(event.target.value)}
              className="min-h-11 w-full appearance-none rounded-full border border-line bg-surface px-4 pr-10 text-sm font-semibold outline-none focus:border-forest"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.handle ? `@${profile.handle}` : profile.displayName}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-3.5 size-4 text-muted" />
          </label>
        ) : null}
      </header>

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[390px_1fr]">
        <aside className="space-y-6">
          {(showProfileForm || (!profiles.length && !profilesLoading)) ? (
            <form
              onSubmit={createProfile}
              className="rounded-3xl border border-line bg-surface p-5 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-forest">
                  <Plus className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold">Add a writing voice</h2>
                  <p className="mt-0.5 text-xs text-muted">Start with samples you own.</p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 rounded-xl bg-canvas p-1">
                {(["pasted", "x_api"] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => {
                      setSourceMode(mode);
                      setAuthorizationConfirmed(false);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      sourceMode === mode ? "bg-white shadow-sm" : "text-muted"
                    }`}
                  >
                    {mode === "pasted" ? <FileText className="size-3.5" /> : <AtSign className="size-3.5" />}
                    {mode === "pasted" ? "Paste samples" : "X handle"}
                  </button>
                ))}
              </div>

              {sourceMode === "pasted" ? (
                <div className="mt-5 space-y-4">
                  <label className="block text-sm font-semibold">
                    Voice name
                    <input
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="My founder voice"
                      className="mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Writing samples
                    <textarea
                      required
                      value={samples}
                      onChange={(event) => setSamples(event.target.value)}
                      placeholder={"Paste at least 3 samples.\n\nSeparate each sample with a blank line."}
                      className="mt-2 min-h-44 w-full resize-y rounded-xl border border-line bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-forest"
                    />
                  </label>
                </div>
              ) : (
                <label className="mt-5 block text-sm font-semibold">
                  X handle
                  <span className="mt-2 flex items-center rounded-xl border border-line bg-white px-3 focus-within:border-forest">
                    <AtSign className="size-4 text-muted" />
                    <input
                      required
                      value={handle}
                      onChange={(event) => setHandle(event.target.value)}
                      placeholder="username"
                      className="min-h-11 w-full bg-transparent px-2 text-sm font-normal outline-none"
                    />
                  </span>
                  <span className="mt-2 block text-xs font-normal leading-5 text-muted">
                    Only use accounts you are authorized to reference. Official X API access is required.
                  </span>
                </label>
              )}
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas px-3 py-3 text-xs leading-5 text-muted">
                <input
                  required
                  type="checkbox"
                  checked={authorizationConfirmed}
                  onChange={(event) => setAuthorizationConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-forest"
                />
                <span>
                  I confirm that I own these samples or am authorized to use this account as a writing reference.
                </span>
              </label>
              <Button
                className="mt-5 w-full"
                type="submit"
                disabled={loading || !authorizationConfirmed}
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Build voice profile
              </Button>
            </form>
          ) : (
            <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Active voice
              </p>
              {profilesLoading ? (
                <div className="mt-5 h-20 animate-pulse rounded-2xl bg-canvas" />
              ) : (
                <>
                  <h2 className="mt-3 text-xl font-semibold">
                    {activeProfile?.handle ? `@${activeProfile.handle}` : activeProfile?.displayName}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {activeProfile?.sourceType === "x_api"
                      ? "Built from recent original posts through the official X API."
                      : "Built from writing samples provided by you."}
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-5 w-full"
                    onClick={() => {
                      setHandle("");
                      setDisplayName("");
                      setSamples("");
                      setAuthorizationConfirmed(false);
                      setShowProfileForm(true);
                      setError("");
                    }}
                  >
                    <Plus className="size-4" /> Add another voice
                  </Button>
                </>
              )}
            </section>
          )}

          <section className="rounded-3xl bg-forest p-5 text-white sm:p-6">
            <Sparkles className="size-5 text-accent" />
            <h2 className="mt-4 font-semibold">How learning works</h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Selections and edits become private examples for this voice. Raw X source text is never used for model training.
            </p>
          </section>
        </aside>

        <section className="min-w-0">
          <form
            onSubmit={generateDrafts}
            className="rounded-3xl border border-line bg-surface p-5 sm:p-7"
          >
            <label className="block">
              <span className="text-sm font-semibold">What do you want to say?</span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                required
                minLength={10}
                placeholder="Share the point, useful facts, audience, and desired outcome. The clearer the brief, the better the drafts."
                className="mt-3 min-h-36 w-full resize-y bg-transparent text-lg leading-8 outline-none placeholder:text-muted/45"
              />
              <span className="mt-4 block text-xs font-semibold text-muted">
                Refinement note <span className="font-normal">(optional)</span>
              </span>
              <input
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
                maxLength={1000}
                placeholder="For example: make the opening less promotional"
                className="mt-2 min-h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-forest"
              />
            </label>
            <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                Goal
                <select
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  className="rounded-full border border-line bg-white px-3 py-2 text-xs text-ink outline-none"
                >
                  <option value="engage">Engage</option>
                  <option value="educate">Educate</option>
                  <option value="announce">Announce</option>
                  <option value="persuade">Persuade</option>
                  <option value="entertain">Entertain</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                Tone
                <select
                  value={toneIntensity}
                  onChange={(event) => setToneIntensity(Number(event.target.value))}
                  className="rounded-full border border-line bg-white px-3 py-2 text-xs text-ink outline-none"
                >
                  <option value={1}>Subtle</option>
                  <option value={2}>Measured</option>
                  <option value={3}>Balanced</option>
                  <option value={4}>Strong</option>
                  <option value={5}>Bold</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                Limit
                <select
                  value={characterLimit}
                  onChange={(event) => setCharacterLimit(Number(event.target.value))}
                  className="rounded-full border border-line bg-white px-3 py-2 text-xs text-ink outline-none"
                >
                  <option value={180}>180 chars</option>
                  <option value={280}>280 chars</option>
                  <option value={500}>500 chars</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                <input
                  type="checkbox"
                  checked={includeHashtags}
                  onChange={(event) => setIncludeHashtags(event.target.checked)}
                  className="size-4 accent-forest"
                />
                Hashtags
              </label>
              <Button
                className="sm:ml-auto"
                type="submit"
                disabled={loading || restoringRun || !activeProfileId}
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate five drafts
              </Button>
            </div>
          </form>

          {restoredAt ? (
            <div className="mt-6 flex flex-col justify-between gap-2 rounded-2xl border border-forest/20 bg-accent-soft px-4 py-3 text-sm sm:flex-row sm:items-center">
              <p className="font-semibold text-forest-deep">
                Restored from history ·{" "}
                {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                  new Date(restoredAt),
                )}
              </p>
              <Link href="/history" className="font-bold text-forest underline">
                Back to history
              </Link>
            </div>
          ) : null}

          {(loading || restoringRun) && !drafts.length ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl border border-line bg-surface" />
              ))}
            </div>
          ) : drafts.length ? (
            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Five angles, ready to refine</p>
                <Button
                  variant="ghost"
                  className="min-h-9 px-3 text-xs"
                  onClick={() => {
                    setDrafts([]);
                    setRestoredAt(null);
                    if (restoredRunId) router.replace("/dashboard", { scroll: false });
                  }}
                >
                  <RefreshCw className="size-3.5" /> Clear
                </Button>
              </div>
              <div className="grid gap-4 2xl:grid-cols-2">
                {drafts.map((draft) => (
                  <DraftCard
                    key={`${draft.id}:${draft.revision ?? 0}:${draft.isSelected ? 1 : 0}:${draft.isSaved ? 1 : 0}:${draft.isLiked ? 1 : 0}:${draft.isRejected ? 1 : 0}`}
                    draft={draft}
                    characterLimit={characterLimit}
                    onFeedback={sendFeedback}
                    highlighted={draft.id === highlightedDraftId}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 grid min-h-72 place-items-center rounded-3xl border border-dashed border-line bg-canvas/50 p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-forest shadow-sm">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="mt-5 font-semibold">Your drafts will appear here</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Add a voice, write a specific brief, and Okara will explore five meaningfully different angles.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
