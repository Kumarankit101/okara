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
    <main className="paper-grid relative h-dvh overflow-hidden px-3 py-3 sm:px-6 sm:py-5">
      <div className="absolute -left-32 top-20 size-96 rounded-full bg-accent/35 blur-3xl" />
      <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col justify-center [@media(max-width:767px)_and_(max-height:740px)]:justify-start">
        <Link
          href="/"
          className="mb-2 inline-flex w-fit shrink-0 items-center gap-2 text-sm font-semibold text-muted hover:text-ink sm:mb-3 [@media(max-width:767px)_and_(max-height:740px)]:mb-1"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
        <section className="soft-shadow grid rounded-[1.5rem] border border-ink/10 bg-surface p-4 sm:rounded-[2rem] sm:p-6 md:grid-cols-[0.75fr_1.25fr] md:gap-6 [@media(max-width:767px)_and_(max-height:740px)]:p-3">
          <div className="md:flex md:flex-col md:justify-center">
            <Brand />
            <div className="mt-4 hidden size-10 items-center justify-center rounded-2xl bg-accent-soft text-forest sm:flex md:mt-5 [@media(max-width:767px)_and_(max-height:740px)]:hidden">
              <LockKeyhole className="size-5" />
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.045em] sm:mt-4 sm:text-3xl [@media(max-width:767px)_and_(max-height:740px)]:mt-1 [@media(max-width:767px)_and_(max-height:740px)]:text-lg [@media(max-width:767px)_and_(max-height:740px)]:leading-[1.4]">
              Your writing preferences are private.
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted sm:text-base [@media(max-width:767px)_and_(max-height:740px)]:hidden">
              Save voice profiles, drafts, edits, and preferences to your private workspace.
            </p>
          </div>
          <LoginForm initialError={error ? safeAuthErrors[error] ?? "Sign-in could not be completed. Try again." : ""} />
        </section>
      </div>
    </main>
  );
}
