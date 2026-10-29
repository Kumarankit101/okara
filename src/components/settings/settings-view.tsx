"use client";

import {
  Database,
  LoaderCircle,
  LogOut,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type VoiceProfileSetting = {
  id: string;
  handle: string | null;
  displayName: string;
  name: string;
  detail: string;
  sourceLabel: string;
  lastSyncedLabel: string;
};

type SettingsViewProps = {
  email: string;
  initialDisplayName: string;
  memberSinceLabel: string;
  initialVoiceProfiles: VoiceProfileSetting[];
};

type Notice = { kind: "success" | "error"; message: string } | null;

export function SettingsView({
  email,
  initialDisplayName,
  memberSinceLabel,
  initialVoiceProfiles,
}: SettingsViewProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [voiceProfiles, setVoiceProfiles] = useState(initialVoiceProfiles);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<VoiceProfileSetting | null>(null);
  const [voiceDisplayName, setVoiceDisplayName] = useState("");
  const [voiceSamples, setVoiceSamples] = useState<string[]>([]);
  const [initialSamples, setInitialSamples] = useState<string[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!editingProfile) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !voiceSaving) setEditingProfile(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editingProfile, voiceSaving]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const payload = (await response.json()) as {
        displayName?: string;
        error?: { message?: string };
      };
      if (!response.ok || !payload.displayName) {
        throw new Error(payload.error?.message ?? "Could not save your profile.");
      }
      setDisplayName(payload.displayName);
      setNotice({ kind: "success", message: "Account details saved." });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save your profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteVoiceProfile(profile: VoiceProfileSetting) {
    const confirmed = window.confirm(
      `Delete ${profile.name}? This permanently removes its drafts, history, source samples, feedback, and learned preferences.`,
    );
    if (!confirmed) return;

    setDeletingId(profile.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/voice-profiles?id=${encodeURIComponent(profile.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not delete that voice profile.");
      }
      setVoiceProfiles((current) => current.filter((item) => item.id !== profile.id));
      setNotice({ kind: "success", message: `${profile.name} was deleted.` });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Could not delete that voice profile.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function openVoiceEditor(profile: VoiceProfileSetting) {
    setEditingProfile(profile);
    setVoiceDisplayName(profile.displayName);
    setVoiceSamples([]);
    setInitialSamples([]);
    setAuthorizationConfirmed(false);
    setVoiceError("");
    setVoiceLoading(true);
    try {
      const response = await fetch(
        `/api/voice-profiles?id=${encodeURIComponent(profile.id)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        profile?: { displayName: string };
        samples?: Array<{ id: string; text: string }>;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile || !payload.samples) {
        throw new Error(payload.error?.message ?? "Could not load that voice.");
      }
      const loadedSamples = payload.samples.map((sample) => sample.text);
      setVoiceDisplayName(payload.profile.displayName);
      setVoiceSamples(loadedSamples);
      setInitialSamples(loadedSamples);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Could not load that voice.");
    } finally {
      setVoiceLoading(false);
    }
  }

  function normalizedSamples(samples: string[]) {
    return samples.map((sample) => sample.trim()).filter(Boolean);
  }

  function samplesChanged() {
    return (
      JSON.stringify(normalizedSamples(voiceSamples)) !==
      JSON.stringify(normalizedSamples(initialSamples))
    );
  }

  async function saveVoiceProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProfile) return;
    const samples = normalizedSamples(voiceSamples);
    const rebuild = samplesChanged();
    if (rebuild && samples.length < 3) {
      setVoiceError("Keep at least three distinct samples when rebuilding a voice.");
      return;
    }
    if (rebuild && !authorizationConfirmed) {
      setVoiceError("Confirm that you are allowed to use the updated samples.");
      return;
    }

    setVoiceSaving(true);
    setVoiceError("");
    try {
      const response = await fetch("/api/voice-profiles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingProfile.id,
          displayName: voiceDisplayName,
          ...(rebuild ? { samples, authorizationConfirmed: true } : {}),
        }),
      });
      const payload = (await response.json()) as {
        profile?: { displayName: string; handle: string | null };
        rebuilt?: boolean;
        sampleCount?: number;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error?.message ?? "Could not update that voice.");
      }
      setVoiceProfiles((current) =>
        current.map((profile) =>
          profile.id === editingProfile.id
            ? {
                ...profile,
                handle: payload.profile!.handle,
                displayName: payload.profile!.displayName,
                name: payload.profile!.handle
                  ? `@${payload.profile!.handle}`
                  : payload.profile!.displayName,
                detail: payload.profile!.displayName,
                lastSyncedLabel: payload.rebuilt
                  ? "Analyzed just now"
                  : profile.lastSyncedLabel,
              }
            : profile,
        ),
      );
      setEditingProfile(null);
      setNotice({
        kind: "success",
        message: payload.rebuilt
          ? `${payload.profile.displayName} was rebuilt from ${payload.sampleCount} samples.`
          : `${payload.profile.displayName} was renamed.`,
      });
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Could not update that voice.");
    } finally {
      setVoiceSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            notice.kind === "success"
              ? "border-forest/20 bg-accent-soft text-forest-deep"
              : "border-danger/20 bg-red-50 text-danger"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="rounded-3xl border bg-surface p-5 sm:p-7">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">
            Account
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">
            Your identity
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            This name is used inside your private workspace. Your email is the magic-link sign-in identity and cannot be changed here.
          </p>
        </div>

        <form onSubmit={saveProfile} className="mt-6 max-w-xl space-y-5">
          <label className="block">
            <span className="text-sm font-semibold">Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={1}
              maxLength={80}
              required
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Email</p>
              <p className="mt-1 break-all text-sm text-muted">{email}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Member since</p>
              <p className="mt-1 text-sm text-muted">{memberSinceLabel}</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !displayName.trim()}
            className="rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-white transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save account details"}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border bg-surface p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 size-5 text-forest" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">
              Voice profiles
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">
              Manage writing voices
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Rename a voice or curate the samples that define it. Rebuilding keeps its drafts and preferences; deleting removes everything attached to it.
            </p>
          </div>
        </div>

        <div className="mt-6 divide-y rounded-2xl border bg-white">
          {voiceProfiles.length ? (
            voiceProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{profile.name}</p>
                  <p className="mt-1 text-sm text-muted">{profile.detail}</p>
                  <p className="mt-1 text-xs text-muted">
                    {profile.sourceLabel} · {profile.lastSyncedLabel}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openVoiceEditor(profile)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold text-forest hover:bg-ink/5"
                  >
                    <PencilLine className="size-4" /> Manage voice
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteVoiceProfile(profile)}
                    disabled={deletingId === profile.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 py-2 text-sm font-bold text-danger hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    {deletingId === profile.id ? "Deleting…" : "Delete voice"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-5 text-sm text-muted">
              No voice profiles yet. Create one from the{" "}
              <Link href="/dashboard" className="font-bold text-forest underline">
                writing workspace
              </Link>
              .
            </div>
          )}
        </div>
      </section>

      {editingProfile ? (
        <div className="fixed inset-0 z-50 bg-ink/35" role="presentation">
          <button
            type="button"
            aria-label="Close voice editor"
            className="absolute inset-0 size-full cursor-default"
            onClick={() => !voiceSaving && setEditingProfile(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-editor-title"
            className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l bg-surface p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">
                  Voice profile
                </p>
                <h2 id="voice-editor-title" className="mt-2 text-2xl font-semibold">
                  Manage {editingProfile.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Update the name or curate the source writing used to understand this voice.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close voice editor"
                disabled={voiceSaving}
                onClick={() => setEditingProfile(null)}
                className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-canvas disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>

            {voiceError ? (
              <p role="alert" className="mt-5 rounded-xl border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
                {voiceError}
              </p>
            ) : null}

            {voiceLoading ? (
              <div className="mt-8 flex items-center gap-3 text-sm text-muted">
                <LoaderCircle className="size-5 animate-spin" /> Loading voice samples…
              </div>
            ) : (
              <form onSubmit={saveVoiceProfile} className="mt-7 space-y-7">
                <label className="block">
                  <span className="text-sm font-semibold">Voice name</span>
                  <input
                    required
                    minLength={1}
                    maxLength={80}
                    value={voiceDisplayName}
                    onChange={(event) => setVoiceDisplayName(event.target.value)}
                    className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none focus:border-forest"
                  />
                </label>

                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">Source samples</h3>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        Add, edit, or remove samples, then rebuild the voice. At least three distinct samples are required.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={voiceSamples.length >= 30}
                      onClick={() => setVoiceSamples((current) => [...current, ""])}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold text-forest hover:bg-ink/5 disabled:opacity-50"
                    >
                      <Plus className="size-4" /> Add sample
                    </button>
                  </div>

                  {voiceSamples.length ? (
                    <div className="mt-4 space-y-3">
                      {voiceSamples.map((sample, index) => (
                        <div key={index} className="rounded-2xl border bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-muted">Sample {index + 1}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setVoiceSamples((current) =>
                                  current.filter((_, sampleIndex) => sampleIndex !== index),
                                )
                              }
                              className="inline-flex items-center gap-1 text-xs font-bold text-danger"
                            >
                              <Trash2 className="size-3.5" /> Remove
                            </button>
                          </div>
                          <textarea
                            value={sample}
                            maxLength={2000}
                            onChange={(event) =>
                              setVoiceSamples((current) =>
                                current.map((item, sampleIndex) =>
                                  sampleIndex === index ? event.target.value : item,
                                ),
                              )
                            }
                            className="min-h-28 w-full resize-y bg-transparent text-sm leading-6 outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed bg-canvas p-5 text-sm leading-6 text-muted">
                      The previous raw samples have expired. You can still rename this voice, or add at least three authorized samples to rebuild it.
                    </div>
                  )}
                </div>

                {samplesChanged() ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-canvas px-4 py-3 text-xs leading-5 text-muted">
                    <input
                      required
                      type="checkbox"
                      checked={authorizationConfirmed}
                      onChange={(event) => setAuthorizationConfirmed(event.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-forest"
                    />
                    I confirm that I own these updated samples or am authorized to use them as a writing reference.
                  </label>
                ) : null}

                <div className="rounded-xl bg-accent-soft px-4 py-3 text-xs leading-5 text-forest-deep">
                  Rebuilding updates the style analysis while preserving this voice’s drafts, history, and learned preferences. Raw samples expire after 23 hours.
                </div>

                <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={voiceSaving}
                    onClick={() => setEditingProfile(null)}
                    className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-ink/5 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      voiceSaving ||
                      !voiceDisplayName.trim() ||
                      (samplesChanged() && (!authorizationConfirmed || normalizedSamples(voiceSamples).length < 3))
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-white hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {voiceSaving ? <LoaderCircle className="size-4 animate-spin" /> : <PencilLine className="size-4" />}
                    {voiceSaving ? "Saving…" : samplesChanged() ? "Rebuild voice" : "Save name"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border bg-surface p-5 sm:p-7">
          <ShieldCheck className="size-5 text-forest" />
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">
            Data and personalization
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Raw writing samples expire after 23 hours and are deleted by an hourly job. Drafts and explicit feedback stay private to your account until their voice is deleted.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/preferences"
              className="rounded-xl border px-3 py-2 text-sm font-bold text-forest hover:bg-ink/5"
            >
              Review learned preferences
            </Link>
            <Link
              href="/history"
              className="rounded-xl border px-3 py-2 text-sm font-bold text-forest hover:bg-ink/5"
            >
              Review draft history
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border bg-surface p-5 sm:p-7">
          <LogOut className="size-5 text-forest" />
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">Session</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign out on this device. Your saved drafts, voices, and preferences remain in your account.
          </p>
          <form action="/auth/signout" method="post" className="mt-5">
            <button className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-ink/5">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
