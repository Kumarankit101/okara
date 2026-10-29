"use client";

import { ArrowRight, CheckCircle2, KeyRound, LoaderCircle, Mail, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type AuthMode = "signin" | "signup";
type RequestStatus = "idle" | "loading" | "sent" | "error";

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<RequestStatus>(initialError ? "error" : "idle");
  const [message, setMessage] = useState(initialError);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStatus("idle");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setConfirmationRequired(false);
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup" && password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signin"
            ? { mode, email, password }
            : { mode, displayName, email, password, confirmPassword },
        ),
      });
      const payload = (await response.json()) as {
        status?: "signed_in" | "confirmation_required";
        redirectTo?: string;
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Authentication could not be completed.");
      }
      if (payload.status === "signed_in") {
        router.replace(payload.redirectTo ?? "/dashboard");
        router.refresh();
        return;
      }
      setStatus("sent");
      setConfirmationRequired(true);
      setMessage(payload.message ?? "Check your inbox to confirm your email address.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function sendMagicLink() {
    if (!email) {
      setStatus("error");
      setMessage("Enter your email address first.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Unable to send the sign-in link.");
      }
      setStatus("sent");
      setMessage(payload.message ?? "Check your inbox for your secure sign-in link.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  if (confirmationRequired) {
    return (
      <div className="mt-8 rounded-3xl border border-forest/20 bg-accent-soft p-5 text-forest-deep">
        <CheckCircle2 className="size-7" />
        <h2 className="mt-4 text-lg font-semibold">Confirm your email</h2>
        <p role="status" className="mt-2 text-sm leading-6">{message}</p>
        <p className="mt-2 break-all text-xs font-semibold">{email}</p>
        <button type="button" onClick={() => changeMode("signin")} className="mt-5 text-sm font-bold underline underline-offset-4">
          Return to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 rounded-xl bg-canvas p-1" aria-label="Authentication mode">
        {(["signin", "signup"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => changeMode(item)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === item ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {item === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
        {mode === "signup" ? (
          <AuthField label="Display name" icon={<UserRound className="size-4 text-muted" />}>
            <input type="text" autoComplete="name" required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" className="min-h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted/60" />
          </AuthField>
        ) : null}

        <AuthField label="Work email" icon={<Mail className="size-4 text-muted" />}>
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="min-h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted/60" />
        </AuthField>

        <AuthField label="Password" icon={<KeyRound className="size-4 text-muted" />}>
          <input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : 1} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full bg-transparent text-sm outline-none" />
        </AuthField>

        {mode === "signup" ? (
          <AuthField label="Confirm password" icon={<KeyRound className="size-4 text-muted" />}>
            <input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-12 w-full bg-transparent text-sm outline-none" />
          </AuthField>
        ) : null}

        {mode === "signup" ? <p className="text-xs leading-5 text-muted">Use at least 8 characters with a letter and a number.</p> : null}

        <Button className="w-full" type="submit" disabled={status === "loading"}>
          {status === "loading" ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {mode === "signin" ? "Sign in with password" : "Create account"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" className="w-full" disabled={status === "loading"} onClick={sendMagicLink}>
        <Mail className="size-4" /> Email me a sign-in link
      </Button>

      {message ? (
        <p role="status" className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ${status === "error" ? "bg-red-50 text-danger" : "bg-accent-soft text-forest"}`}>
          {message}
        </p>
      ) : null}
      <p className="mt-5 text-center text-xs leading-5 text-muted">
        New accounts must confirm their email before signing in. By continuing, you agree to use only writing samples you own or are authorized to use.
      </p>
    </div>
  );
}

function AuthField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <span className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 focus-within:border-forest focus-within:ring-3 focus-within:ring-accent/40">
        {icon}
        {children}
      </span>
    </label>
  );
}
