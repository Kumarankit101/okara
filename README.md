# Okara

Okara turns an X handle or user-provided writing samples into five editable post drafts in that voice. It learns from explicit feedback and edits so future drafts improve for that user without fine-tuning on fetched X content.

- **Live:** [okara-eight.vercel.app](https://okara-eight.vercel.app)
- **Repository:** [github.com/Kumarankit101/okara](https://github.com/Kumarankit101/okara)

## Architecture

```text
Browser
  -> Next.js App Router on Vercel
      -> Supabase Auth + Postgres + RLS
      -> OpenAI Responses API (server-side)
      -> X API v2 (optional)
      -> ranked user/voice preferences
```

## Decisions and why

| Decision | Why |
|---|---|
| Next.js App Router | Keeps the UI, authenticated server logic, and API routes in one deployable application. |
| Supabase Auth + Postgres | Provides confirmed email/password login, durable storage, and database-enforced per-user isolation through RLS. |
| OpenAI Structured Outputs | Produces a validated contract of exactly five drafts while keeping the API key on the server. |
| Official X API plus pasted samples | Avoids scraping and keeps the product usable when X credentials are unavailable or users prefer owned content. |
| Retrieval-based learning | Preferences are reversible, inspectable, immediately useful, and cheaper than premature fine-tuning. |
| Bounded deterministic ranking | Sends only the most relevant preferences to the model, reducing latency, prompt size, and duplicate/conflicting guidance. |

## How learning works

Copy, save, select, like, dislike, rejection reasons, and edits are stored as feedback. Idempotency keys prevent retries or repeated clicks from multiplying a learning signal. User-written revisions and explicit rejection reasons carry more evidence than unchanged copies.

Before each generation, Okara ranks active preferences by voice scope, topic, goal, tone, recency, evidence, and effectiveness. It removes conflicts and near-duplicates, then sends at most eight preferences—about 1,200 tokens—to the model. Each generation records which preferences were used so the result remains auditable.

Preferences can be Global or voice-specific. Users can disable, move, or copy them between voices from the Writing Preferences page.

## Local setup

Requirements: Node.js 20+, npm, and a Supabase project.

```bash
npm install
cp .env.example .env.local
```

Configure `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
X_BEARER_TOKEN=
CRON_SECRET=<at-least-16-random-characters>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`X_BEARER_TOKEN` is optional; pasted samples work without it.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npm run dev
```

Add `http://localhost:3000/auth/callback` to the Supabase Auth redirect allow-list. Keep email confirmation enabled. Public registration requires custom SMTP because Supabase's built-in sender is intended for limited testing.

## Validation and deployment

```bash
npm run check
```

This runs ESLint, TypeScript, 127 unit/integration tests, and a production build. Database tests under `supabase/tests/database/` cover RLS, ownership, atomic feedback, and auditing.

Production uses Vercel, Supabase Auth/Postgres, and server-side OpenAI calls. Raw X samples expire after 23 hours and are removed hourly. The app generates drafts only and never posts automatically.

See [PLAN.md](./PLAN.md) for the detailed architecture and scalability analysis, and [AGENT_TRACKER.md](./AGENT_TRACKER.md) for implementation and validation evidence.
