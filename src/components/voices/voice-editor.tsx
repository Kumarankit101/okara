"use client";

import { LoaderCircle, PencilLine, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export type EditableVoiceProfile = {
  id: string;
  handle: string | null;
  displayName: string;
};

export type VoiceEditorResult = {
  profile: EditableVoiceProfile;
  rebuilt: boolean;
  sampleCount?: number;
};

export function VoiceEditor({
  profile,
  onClose,
  onUpdated,
}: {
  profile: EditableVoiceProfile;
  onClose: () => void;
  onUpdated: (result: VoiceEditorResult) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [samples, setSamples] = useState<string[]>([]);
  const [initialSamples, setInitialSamples] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, saving]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/voice-profiles?id=${encodeURIComponent(profile.id)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as {
          profile?: EditableVoiceProfile;
          samples?: Array<{ id: string; text: string }>;
          error?: { message?: string };
        };
        if (!response.ok || !payload.profile || !payload.samples) {
          throw new Error(payload.error?.message ?? "Could not load that voice.");
        }
        const loadedSamples = payload.samples.map((sample) => sample.text);
        setDisplayName(payload.profile.displayName);
        setSamples(loadedSamples);
        setInitialSamples(loadedSamples);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Could not load that voice.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [profile.id]);

  function normalized(values: string[]) {
    return values.map((sample) => sample.trim()).filter(Boolean);
  }

  const changed =
    JSON.stringify(normalized(samples)) !== JSON.stringify(normalized(initialSamples));
  const validSamples = normalized(samples);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changed && validSamples.length < 3) {
      setError("Keep at least three distinct samples when rebuilding a voice.");
      return;
    }
    if (changed && !authorizationConfirmed) {
      setError("Confirm that you are allowed to use the updated samples.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/voice-profiles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: profile.id,
          displayName,
          ...(changed
            ? { samples: validSamples, authorizationConfirmed: true }
            : {}),
        }),
      });
      const payload = (await response.json()) as {
        profile?: EditableVoiceProfile;
        rebuilt?: boolean;
        sampleCount?: number;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error?.message ?? "Could not update that voice.");
      }
      onUpdated({
        profile: payload.profile,
        rebuilt: Boolean(payload.rebuilt),
        sampleCount: payload.sampleCount,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that voice.");
    } finally {
      setSaving(false);
    }
  }

  const profileLabel = profile.handle ? `@${profile.handle}` : profile.displayName;

  return (
    <div className="fixed inset-0 z-50 bg-ink/35" role="presentation">
      <button
        type="button"
        aria-label="Close voice editor"
        className="absolute inset-0 size-full cursor-default"
        onClick={() => !saving && onClose()}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="write-voice-editor-title"
        className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l bg-surface p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">
              Voice profile
            </p>
            <h2 id="write-voice-editor-title" className="mt-2 text-2xl font-semibold">
              Manage {profileLabel}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Update the name or curate the source writing used to understand this voice.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close voice editor"
            disabled={saving}
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-canvas disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-5 rounded-xl border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-muted">
            <LoaderCircle className="size-5 animate-spin" /> Loading voice samples…
          </div>
        ) : (
          <form onSubmit={save} className="mt-7 space-y-7">
            <label className="block">
              <span className="text-sm font-semibold">Voice name</span>
              <input
                required
                minLength={1}
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
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
                  disabled={samples.length >= 30}
                  onClick={() => setSamples((current) => [...current, ""])}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold text-forest hover:bg-ink/5 disabled:opacity-50"
                >
                  <Plus className="size-4" /> Add sample
                </button>
              </div>

              {samples.length ? (
                <div className="mt-4 space-y-3">
                  {samples.map((sample, index) => (
                    <div key={index} className="rounded-2xl border bg-white p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-muted">Sample {index + 1}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSamples((current) =>
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
                          setSamples((current) =>
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

            {changed ? (
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
                disabled={saving}
                onClick={onClose}
                className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-ink/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  !displayName.trim() ||
                  (changed && (!authorizationConfirmed || validSamples.length < 3))
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-white hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <PencilLine className="size-4" />}
                {saving ? "Saving…" : changed ? "Rebuild voice" : "Save name"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
