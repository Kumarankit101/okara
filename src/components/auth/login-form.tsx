"use client";

import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Work email</span>
        <span className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 focus-within:border-forest focus-within:ring-3 focus-within:ring-accent/40">
          <Mail className="size-4 text-muted" />
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="min-h-13 w-full bg-transparent text-sm outline-none placeholder:text-muted/60"
          />
        </span>
      </label>
      <Button className="w-full" type="submit" disabled={status === "loading"}>
        {status === "loading" ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <ArrowRight className="size-4" />
        )}
        Email me a sign-in link
      </Button>
      {message ? (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
            status === "error"
              ? "bg-red-50 text-danger"
              : "bg-accent-soft text-forest"
          }`}
        >
          {message}
        </p>
      ) : null}
      <p className="text-center text-xs leading-5 text-muted">
        No password to remember. By continuing, you agree to use only writing
        samples you own or are authorized to use.
      </p>
    </form>
  );
}
