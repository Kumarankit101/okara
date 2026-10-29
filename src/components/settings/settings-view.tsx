"use client";

import { Database, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

type VoiceProfileSetting = {
  id: string;
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
  const [notice, setNotice] = useState<Notice>(null);

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
              Deleting a voice also removes its drafts, source samples, history, feedback, and learned preferences. This cannot be undone.
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
                <button
                  type="button"
                  onClick={() => deleteVoiceProfile(profile)}
                  disabled={deletingId === profile.id}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 py-2 text-sm font-bold text-danger hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {deletingId === profile.id ? "Deleting…" : "Delete voice"}
                </button>
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
              href="/memory"
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
