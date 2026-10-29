import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };
export const instant = false;

const safeAuthErrors: Record<string, string> = {
  missing_auth_code: "That sign-in link is incomplete. Request a new one and try again.",
  auth_callback_failed: "That sign-in link is invalid, expired, or already used. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="paper-grid relative grid min-h-screen place-items-center overflow-hidden px-5 py-12">
      <div className="absolute -left-32 top-20 size-96 rounded-full bg-accent/35 blur-3xl" />
      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
        <section className="soft-shadow rounded-[2rem] border border-ink/10 bg-surface p-7 sm:p-9">
          <Brand />
          <div className="mt-9 flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-forest">
            <LockKeyhole className="size-5" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em]">
            Your writing memory is private.
          </h1>
          <p className="mt-3 leading-7 text-muted">
            Sign in to save voice profiles, drafts, edits, and preferences to your
            workspace.
          </p>
          <LoginForm initialError={error ? safeAuthErrors[error] ?? "Sign-in could not be completed. Try again." : ""} />
        </section>
      </div>
    </main>
  );
}
