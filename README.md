# Okara

Okara is a private AI writing workspace that turns an X handle or user-provided writing samples into five editable post drafts. It learns from explicit feedback and the user's own edits, so later generations become more useful without training on fetched X content.

## Why this architecture

- **Next.js App Router** keeps the UI, authenticated server rendering, and provider-facing route handlers in one deployable application.
- **Supabase Auth + Postgres + RLS** provides passwordless login, durable per-user data, and database-enforced isolation.
- **OpenAI Responses API + Structured Outputs** returns a validated five-draft contract from a server-only call. The model is configurable and defaults to `gpt-5.6-terra` at low reasoning.
- **Official X API v2 only** is used for handle ingestion. Pasted samples remain a first-class fallback when an X credential is unavailable or the user prefers owned content.
- **Retrieval-based learning** stores explicit preferences, selected examples, rejection signals, and edit patterns. A small, ranked context is added to future prompts for the same user and voice profile. This is cheaper, reversible, and auditable compared with early fine-tuning.

```text
Browser
  -> Next.js on Vercel
      -> Supabase Auth + Postgres + RLS
      -> OpenAI Responses API
      -> X API v2 (optional)
      -> user/profile-scoped preference retrieval
```

## Product flow

1. Sign in with a magic link.
2. Create a voice profile from an X handle or at least three pasted samples.
3. Enter a topic, optional intent, and character limit.
4. Receive exactly five distinct, editable drafts.
5. Copy, save, select, like, dislike, or edit a draft.
6. Reuse the workspace: ranked feedback memories influence only that user's future generations for that voice profile.

## Local setup

Requirements: Node.js 20+, npm, and a Supabase project.

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
X_BEARER_TOKEN=
CRON_SECRET=<random-string-at-least-16-characters>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`X_BEARER_TOKEN` is optional. Without it, use pasted samples.

Apply the database migration to a linked Supabase project:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Configure the Supabase Auth site URL as `http://localhost:3000` and add `http://localhost:3000/auth/callback` as a redirect URL. Then run:

```bash
npm run dev
```

## Validation

```bash
npm run check
```

This runs ESLint, TypeScript, the unit/integration test suite, and a production build. The SQL pgTAP suite in `supabase/tests/database/rls.test.sql` additionally checks RLS, ownership constraints, append-only feedback, and privileged usage writes when a local or linked Postgres instance is available.

## Data and safety choices

- Provider secrets stay server-side.
- Every persistent row is user-owned; RLS is enabled and forced.
- Raw X samples receive a 23-hour expiry and an hourly authenticated cleanup job, leaving operational headroom under the 24-hour retention ceiling. They are not used for model training.
- The app generates drafts only; it never posts automatically.
- Prompt inputs are treated as untrusted data, and structured model output is revalidated with Zod.
- Feedback memory is isolated by both `user_id` and `voice_profile_id` and bounded before prompt insertion.

## Scalability

The MVP runs synchronously and is appropriate for early usage. The data model and provider boundaries support staged scaling: add an idempotent job queue for X analysis, Redis rate limiting and duplicate suppression, cached voice profiles, database partitioning for append-only event tables, per-user quotas, and provider fallbacks as traffic grows. These controls reduce risk, but they do not remove it; `PLAN.md` defines concrete scale gates, observability, cost tracking, and failure-mode mitigations.

## Project references

- [`PLAN.md`](./PLAN.md) — product reasoning, architecture, database design, learning loop, scale gates, and risk analysis.
- [`AGENT_TRACKER.md`](./AGENT_TRACKER.md) — workstreams, agent roster, decisions, evidence, blockers, and integration status.
- [`supabase/migrations`](./supabase/migrations) — production schema and RLS policies.

## Current deployment prerequisites

A production deployment requires a Supabase project plus Vercel authentication and environment variables. Set the same random `CRON_SECRET` in Vercel so its scheduled cleanup request is authenticated. Live X-handle validation additionally requires an X API bearer token; the pasted-sample path works without one.
