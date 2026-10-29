# Okara

Okara is a private AI writing workspace that turns an X handle or user-provided writing samples into five editable post drafts. It learns from explicit feedback and the user's own edits, so later generations become more useful without training on fetched X content.

**Live app:** [https://okara-eight.vercel.app](https://okara-eight.vercel.app)

**Repository:** [https://github.com/Kumarankit101/okara](https://github.com/Kumarankit101/okara)

## Why this architecture

- **Next.js App Router** keeps the UI, authenticated server rendering, and provider-facing route handlers in one deployable application.
- **Supabase Auth + Postgres + RLS** provides confirmed email/password and passwordless login, durable per-user data, and database-enforced isolation.
- **OpenAI Responses API + Structured Outputs** returns a validated five-draft contract from a server-only call. The model is configurable and defaults to `gpt-5.6-terra` at low reasoning.
- **Official X API v2 only** is used for handle ingestion. Pasted samples remain a first-class fallback when an X credential is unavailable or the user prefers owned content.
- **Retrieval-based learning** separates audit events, current draft state, and stable preference memories. It deduplicates repeated actions and adds only a small, contextually ranked set to future prompts for the same user and voice profile. This is cheaper, reversible, and auditable compared with early fine-tuning.

```text
Browser
  -> Next.js on Vercel
      -> Supabase Auth + Postgres + RLS
      -> OpenAI Responses API
      -> X API v2 (optional)
      -> user/profile-scoped preference retrieval
```

## Product flow

1. Sign in with email/password or a magic link. New password accounts must confirm their email first.
2. Create a voice profile from an X handle or at least three pasted samples.
3. Enter a topic, optional intent, and character limit.
4. Receive exactly five distinct, editable drafts.
5. Copy, save, select, like, dislike, or edit a draft.
6. Reuse the workspace: ranked feedback memories influence only that user's future generations for that voice profile.
7. Use Settings to update account details, review retention behavior, or delete a voice and its associated data.
8. Open any historical draft to restore its voice, brief, controls, latest edits, and full five-draft workspace.

## How the feedback loop learns

- Save, select, like, reject, copy-after-edit, and explicit edits are recorded as append-only audit events while a separate row stores each draft's current state.
- Every client action has an idempotency key. Network retries replay safely; repeated deliberate clicks remain auditable but update the same stable memory instead of multiplying its influence.
- Rejection reasons and user-written revisions create stronger evidence than unchanged copies. A rejection suppresses conflicting positive memory until the user undoes it or gives new positive feedback.
- Before generation, deterministic ranking scores relevant memories by topic, goal, tone, recency, evidence, and past effectiveness, then removes conflicts and near-duplicates and enforces source diversity.
- The prompt receives at most eight memories (roughly 1,200 tokens). No embedding call is required, keeping retrieval latency and provider cost near zero; the generation model remains the only paid inference call in this path.
- Each generation stores which memories were used and their score breakdown, making the behavior inspectable and suitable for later offline evaluation.

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

For local development, add `http://localhost:3000/auth/callback` to the Supabase Auth redirect allow-list without replacing the production site URL. Then run:

```bash
npm run dev
```

For password registration, keep Supabase **Confirm email** enabled and align the hosted password policy with `supabase/config.toml` (minimum 8 characters with letters and numbers). Public signup also requires custom SMTP; Supabase's built-in sender is limited to organization-member addresses and low test-volume delivery.

## Validation

```bash
npm run check
```

This runs ESLint, TypeScript, the unit/integration test suite, and a production build. SQL pgTAP suites in `supabase/tests/database/` additionally check RLS, ownership constraints, atomic feedback behavior, append-only auditing, and privileged usage writes when a local or linked Postgres instance is available.

## Data and safety choices

- Provider secrets stay server-side.
- Every persistent row is user-owned; RLS is enabled and forced.
- Raw X samples receive a 23-hour expiry and an hourly Supabase Cron cleanup job, leaving operational headroom under the 24-hour retention ceiling. They are not used for model training.
- The app generates drafts only; it never posts automatically.
- Prompt inputs are treated as untrusted data, and structured model output is revalidated with Zod.
- Feedback memory is isolated by both `user_id` and `voice_profile_id` and bounded before prompt insertion.

## Scalability

The MVP runs synchronously and is appropriate for early usage. The data model and provider boundaries support staged scaling: add an idempotent job queue for X analysis, Redis rate limiting and duplicate suppression, cached voice profiles, database partitioning for append-only event tables, per-user quotas, and provider fallbacks as traffic grows. These controls reduce risk, but they do not remove it; `PLAN.md` defines concrete scale gates, observability, cost tracking, and failure-mode mitigations.

## Project references

- [`PLAN.md`](./PLAN.md) — product reasoning, architecture, database design, learning loop, scale gates, and risk analysis.
- [`AGENT_TRACKER.md`](./AGENT_TRACKER.md) — workstreams, agent roster, decisions, evidence, blockers, and integration status.
- [`supabase/migrations`](./supabase/migrations) — production schema and RLS policies.

## Production deployment

The application is deployed on Vercel at [okara-eight.vercel.app](https://okara-eight.vercel.app), backed by Supabase Auth/Postgres and server-side OpenAI calls. Email/password registration, confirmation-required first sign-in, and magic links are implemented; configure custom SMTP before opening registration to arbitrary public addresses. The checked-in database migration schedules source cleanup in Supabase Cron; `CRON_SECRET` remains available for authenticated manual cleanup calls. Live X-handle validation additionally requires an X API bearer token; the pasted-sample path works without one.
