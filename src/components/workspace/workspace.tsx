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
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DraftCard, type DraftRecord } from "./draft-card";

interface VoiceProfileSummary {
  id: string;
  handle: string | null;
  displayName: string;
  sourceType: "x_api" | "pasted";
  status: "syncing" | "ready" | "failed";
}

type SourceMode = "x_api" | "pasted";

export function Workspace() {
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
  const [characterLimit, setCharacterLimit] = useState(280);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
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
      toneIntensity: 3,
      characterLimit,
      includeHashtags: false,
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
    draftId: string,
    eventType: string,
    editedText?: string,
    reasonCode?: string,
  ) {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId, eventType, editedText, reasonCode }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Feedback was not saved.");
    }
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
              <Button className="sm:ml-auto" type="submit" disabled={loading || !activeProfileId}>
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate five drafts
              </Button>
            </div>
          </form>

          {loading && !drafts.length ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl border border-line bg-surface" />
              ))}
            </div>
          ) : drafts.length ? (
            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Five angles, ready to refine</p>
                <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => setDrafts([])}>
                  <RefreshCw className="size-3.5" /> Clear
                </Button>
              </div>
              <div className="grid gap-4 2xl:grid-cols-2">
                {drafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    characterLimit={characterLimit}
                    onFeedback={sendFeedback}
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
