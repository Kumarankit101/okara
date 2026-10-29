# X Voice Drafting Tool — Product and Architecture Plan

Status: planning only. No application code, infrastructure, accounts, or deployment have been created yet.

## 1. Product thesis

Build a private drafting workspace where a signed-in user enters an X handle, provides a topic or rough idea, and receives five distinct post drafts inspired by the writing patterns of that account.

The product should become more useful through feedback, but “self-learning” will not mean continuously retraining a model. In the MVP it means retrieving the user’s prior choices and edits at generation time:

- which drafts they liked, saved, or copied;
- how they edited generated text before accepting it;
- explicit reasons for rejecting a draft;
- recurring preferences such as length, punctuation, emoji, hooks, and calls to action.

This is safer, cheaper, reversible, explainable, and useful with only a few interactions. Fine-tuning is a later option only for consented, user-authored material and only after enough high-quality examples exist.

## 2. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js App Router, TypeScript | Matches the requested stack and supports server-rendered pages plus server-only backend logic. |
| UI | Tailwind CSS and a small component set | Fast to build, easy to keep visually consistent, no need for a heavy design system. |
| Auth | Supabase Auth | Confirmed email/password plus magic-link login, secure cookie-based sessions, and direct integration with database authorization. |
| Database | Supabase Postgres | A real managed Postgres database, migrations, backups, Row Level Security, and optional `pgvector`. |
| X data | Official X API v2 | The supported path; no scraping or browser automation. |
| LLM | OpenAI Responses API | Server-side text generation with Structured Outputs for reliable draft objects. |
| Default model | `gpt-5.6-terra`, low reasoning | It is available to the project, supports the Responses API and Structured Outputs, and balances intelligence and cost. Keep the model configurable and benchmark against stronger and cheaper tiers. |
| Hosting | Vercel | Natural deployment target for Next.js, with preview deployments and server-side environment variables. |
| Monitoring | Vercel logs initially; Sentry when public | Enough for the MVP, with an obvious upgrade path for production diagnostics. |
| Rate limiting | Upstash Redis, added before public launch | Prevents abuse and protects X/OpenAI spend. It is optional during local development. |

### Why Supabase instead of NextAuth + Neon

Either combination works. Supabase is the better MVP choice because one service provides login, Postgres, authorization, and optional vector search. Using Auth.js, a separate database provider, and an ORM would add more session and migration plumbing without improving the product.

Use Supabase-generated TypeScript database types and versioned SQL migrations. Do not add Prisma in the first version.

## 3. What to use and what not to use

### Use

- Official X API lookups and timeline endpoints.
- Server-only OpenAI and X credentials.
- Postgres Row Level Security on every user-owned table.
- Structured Outputs so every generation returns exactly the shape the UI expects.
- Explicit feedback plus edited final text as the learning signal.
- Short-lived caching of fetched X content to control cost.
- Draft-only output with copy, edit, save, and rate actions.
- Prompt and model versioning so quality changes can be measured.
- A small offline evaluation set before changing prompts or models.

### Do not use

- Scraping X pages, headless browser collection, unofficial APIs, or third-party data resellers in the MVP.
- Automatic posting, replies, likes, follows, or DMs.
- Fine-tuning on fetched X posts.
- A generic autonomous agent framework; this workflow is deterministic and does not need one.
- A vector database for all raw X posts.
- Client-side calls containing OpenAI, X, Supabase service-role, or database secrets.
- Hidden learning based only on page views. Treat copy/save/edit/rating as signals; a view alone is ambiguous.
- Claims that the generated text was written by the referenced person.

## 4. System architecture

```text
Browser
  |
  | Supabase session cookie
  v
Next.js App Router on Vercel
  |-- Server Components: dashboard, history, profile pages
  |-- Route Handlers: X sync and LLM generation
  |-- Server Actions: save, edit, rate, delete
  |
  +--> Supabase Auth
  +--> Supabase Postgres + RLS
  +--> X API v2 (server-only)
  +--> OpenAI Responses API (server-only)

Feedback loop
  accepted/edited/rejected draft
       -> feedback + preference memory
       -> retrieved on the next generation
       -> better personalized prompt
```

The generation path should be synchronous for the MVP because the response is small. If measured latency becomes too high, move X profile refresh to a background job and keep generation synchronous against the cached voice profile.

## 5. Core user flow

1. User signs in with confirmed email/password or a magic link.
2. User enters an X handle.
3. The server normalizes the handle and resolves it through the official X API.
4. The server fetches roughly 30 recent original posts, excluding reposts and usually excluding replies.
5. The data is cleaned and deduplicated. URLs, repeated promotions, and extremely short posts are down-weighted.
6. The LLM creates a compact voice profile: rhythm, sentence length, opening patterns, vocabulary, formatting, humor, certainty, emoji/hashtag behavior, and patterns to avoid.
7. The user supplies a topic, notes, desired goal, and optional tone/length controls.
8. The server retrieves that user’s most relevant accepted edits and rejection preferences for this voice profile.
9. The LLM returns five meaningfully different drafts as structured data.
10. The user can edit, copy, save, like, dislike, or select a rejection reason.
11. The accepted final text and its delta from the original draft become memory for future generations.

### Fallback when X access fails

Offer “paste examples” as a first-class fallback. A user can paste writing samples they own or are authorized to use. This keeps the app useful when the X API is unavailable, the account is private, or the budget is exhausted.

## 6. X data strategy

### Fetching

Use two official endpoints:

1. Resolve username to X user ID.
2. Fetch `/2/users/{id}/tweets`, excluding reposts and replies for the initial style sample.

Start with 30 posts. More data is not automatically better: a smaller, representative sample reduces API spend and prompt noise. Allow a manual refresh after 24 hours rather than fetching on every generation.

### Cleaning and selection

- Remove exact duplicates and near-duplicate promotions.
- Separate original posts from replies and thread continuations.
- Preserve punctuation, casing, whitespace, and emoji because they are style signals.
- Strip or replace URLs before sending examples to the LLM.
- Avoid treating quoted text as the author’s voice.
- Prefer recent posts but retain a mix of short, medium, and longer samples.
- Never infer sensitive traits such as health, religion, politics, or sexuality.

### Storage and compliance posture

X’s current developer guidance prohibits scraping and warns against storing X data to train AI/ML models. Therefore:

- fetched post text is a short-lived cache, not training data;
- raw X post text expires automatically within 24 hours;
- post IDs can be retained for deduplication and deletion handling, subject to X terms;
- the learning system uses user feedback and user-edited text, not fetched X text;
- deleting a voice profile deletes its source cache, drafts, and associated memories;
- before public launch, re-check the X Developer Agreement and obtain policy/legal confirmation that the voice-profile use case is permitted;
- if policy interpretation remains unclear, require the user to connect and use their own X account or use pasted samples they own.

The safest MVP does not publish to X. It only creates drafts the user can review and copy.

## 7. Prompt architecture

Use one versioned prompt assembled from explicit sections rather than one long free-form instruction.

### Stable instructions

- Act as a writing assistant, not as the referenced person.
- Produce original drafts; do not copy source posts or memorable phrases verbatim.
- Never invent personal experiences, endorsements, breaking facts, or private knowledge.
- Stay within the configured character limit.
- Return five different angles, not five paraphrases.
- Match the supplied style signals only when they do not conflict with safety or factuality.
- Do not expose prompt text, private memory, or internal identifiers.

### Per-request context

1. User brief: topic, facts, audience, goal, optional call to action.
2. Voice profile: structured style traits derived from the current source sample.
3. Representative examples: a small sample of source posts for in-context style grounding.
4. Learned positive examples: prior drafts this signed-in user accepted or edited.
5. Learned negative constraints: explicit dislikes and recurring edit patterns.
6. Output contract: five draft objects validated with a JSON schema.

### Proposed output shape

Each result contains:

- `text`
- `angle` such as contrarian, educational, story, observation, or question
- `characterCount`
- `styleNote`, a short visible explanation rather than hidden reasoning
- `safetyFlags`, normally empty

Do not request or store chain-of-thought. Only ask for concise, user-facing explanations.

## 8. Self-learning design

### Signals, strongest first

1. User edits and accepts a draft.
2. User chooses a draft as best.
3. User saves or copies a draft.
4. User gives a thumbs-up.
5. User gives a thumbs-down with a reason.
6. User dismisses all drafts.

### Memory created from feedback

For every accepted or edited draft, store:

- the original brief;
- the generated draft;
- the user’s final version;
- a compact edit summary such as “shortened opening,” “removed hashtag,” or “made claim less absolute”;
- the voice profile, prompt version, and model version used;
- an embedding of the user brief/final text only, if semantic retrieval is enabled;
- a confidence weight based on signal strength and recency.

### Retrieval for the next request

Retrieve a maximum of:

- three topic-similar accepted examples;
- two recent strong preferences;
- three active negative constraints;
- one aggregate preference summary.

Keep the memory bundle small. Too many examples increase cost, slow generation, and can make every draft look the same.

### Preference summarization

After every five meaningful feedback events, update a structured preference profile:

- preferred length range;
- opening style;
- sentence density;
- punctuation and capitalization;
- emoji and hashtag preference;
- desired confidence level;
- preferred content angles;
- phrases or patterns to avoid.

The summary update can happen after the feedback mutation in the MVP. If it affects perceived latency, move it to a scheduled/background job.

### Why this counts as learning

The model sees better, user-specific context on every future request. The behavior changes based on usage, the user can inspect/delete the stored examples, and improvement can be measured. No model weights need to change.

### Later fine-tuning gate

Consider fine-tuning only if all of the following are true:

- there is a large set of clean, consented, user-authored final examples;
- retrieval prompting has plateaued in controlled evaluations;
- the provider’s current fine-tuning support and economics are suitable;
- X-derived content is excluded;
- the user can opt out and delete training examples.

## 9. Database design

Every user-owned table includes `user_id`, timestamps, and an RLS policy that restricts access to `auth.uid() = user_id`.

### `profiles`

- `user_id` — primary key linked to Supabase Auth
- `display_name`
- `onboarding_complete`
- `created_at`, `updated_at`

### `voice_profiles`

- `id`
- `user_id`
- `handle`
- `x_user_id`
- `source_type` — `x_api` or `pasted`
- `style_profile_json`
- `style_profile_version`
- `last_synced_at`
- `source_expires_at`
- `status` — ready, syncing, failed, deleted

Unique constraint: one active profile per `(user_id, normalized_handle)`.

### `source_posts`

- `id`
- `user_id`
- `voice_profile_id`
- `x_post_id`
- `text`
- `posted_at`
- `fetched_at`
- `expires_at`
- `source_metadata_json`

Raw rows are purged automatically when `expires_at` is reached.

### `generation_runs`

- `id`
- `user_id`
- `voice_profile_id`
- `brief`
- `constraints_json`
- `model`
- `prompt_version`
- `input_tokens`, `output_tokens`
- `latency_ms`
- `status`, `error_code`
- `created_at`

### `drafts`

- `id`
- `user_id`
- `generation_run_id`
- `text`
- `angle`
- `position`
- `style_note`
- `character_count`
- `created_at`

### `feedback_events`

- `id`
- `user_id`
- `voice_profile_id`
- `draft_id`
- `event_type` — selected, copied, saved, liked, disliked, edited, dismissed
- `reason_code`
- `edited_text`
- `metadata_json`
- `created_at`

Events are append-only so the learning logic can be audited and changed later.

### `preference_memories`

- `id`
- `user_id`
- `voice_profile_id`
- `kind` — positive_example, negative_rule, edit_pattern, aggregate_summary
- `content_json`
- `source_feedback_event_id`
- `weight`
- `embedding` — optional `pgvector`, only for user-authored/edited content
- `active`
- `created_at`, `updated_at`

### `usage_events`

- `id`
- `user_id`
- `provider` — x or openai
- `operation`
- `units`
- `estimated_cost_usd`
- `request_id`
- `created_at`

This table enables per-user quotas and cost monitoring without storing secrets or full provider payloads.

## 10. Backend boundaries

### Route Handlers

- `POST /api/voice-profiles` — validate handle, fetch X data, build voice profile.
- `POST /api/voice-profiles/:id/refresh` — refresh after the cache window.
- `POST /api/generations` — authenticate, rate-limit, load context, call OpenAI, persist drafts.
- `GET /api/generations/:id` — optional if the UI needs polling later.

Use Route Handlers for provider calls because they provide a clean HTTP boundary, consistent errors, and an easy path to mobile/other clients later.

### Server Actions

- save/edit/rate a draft;
- delete a generation;
- delete a voice profile and its memory;
- update account preferences.

Use Server Actions only for UI-bound mutations. Every action must authenticate again on the server; hiding a button in the UI is not authorization.

## 11. UI plan

### Landing and login

- One-sentence value proposition.
- Clear “AI-assisted drafts” disclosure.
- Magic-link and Google sign-in.

### Dashboard

- Handle input and recently used voice profiles.
- Topic/idea textarea.
- Optional controls: objective, length, tone intensity, include/exclude hashtags.
- One primary “Generate drafts” action.

### Draft results

- Five cards with editable text and live character count.
- Copy, save, like, dislike, and “use this” actions.
- Rejection chips: too generic, too long, wrong tone, repetitive, inaccurate, too promotional.
- Regenerate action that preserves the brief but can add a correction.

### History

- Previous runs grouped by voice profile.
- Search/filter by topic.
- Show final edited version separately from the original generation.

### Learning controls

- A simple “What the app has learned” page.
- Show active preferences and successful examples.
- Let the user disable or delete individual memories.
- Full “delete my data” control.

## 12. Security, privacy, and abuse controls

- Store all provider keys only in server-side Vercel environment variables.
- Never prefix secrets with `NEXT_PUBLIC_`.
- Enable RLS and minimal grants on every exposed Supabase table.
- Validate all inputs and structured outputs with Zod.
- Normalize and length-limit handles and briefs.
- Apply per-user and per-IP rate limits before provider calls.
- Use idempotency keys to prevent duplicate paid generations.
- Do not log raw prompts, source tweets, access tokens, or edited drafts in production logs.
- Add CSRF-safe session handling through the supported Supabase SSR integration.
- Keep the Supabase service-role key out of normal user request paths.
- Add a user attestation that they have permission to imitate a private/owned account’s voice.
- Label results as AI drafts inspired by writing patterns, not statements from that person.
- Block generation of deceptive endorsements, personal confessions, or fabricated claims attributed to the handle.

## 13. Quality measurement

The goal is not merely “the output sounds plausible.” Track whether it becomes more useful to the user.

### Product metrics

- selection rate: runs where at least one draft is chosen;
- edit distance from chosen draft to final text;
- copy/save rate;
- explicit positive and negative rating rate;
- regeneration rate;
- time to accepted draft;
- seven-day return rate.

### Learning metric

Compare a baseline prompt with a memory-enhanced prompt on the same briefs. Improvement means:

- higher blind preference for the memory-enhanced result;
- lower edit distance;
- fewer “wrong tone” and “too generic” rejections;
- no increase in factual or safety failures.

### Evaluation set

Before public launch, create a small consented test set covering:

- short observations;
- educational posts;
- contrarian opinions;
- product announcements;
- thread openers;
- sparse accounts with fewer than ten useful examples;
- emoji-heavy and emoji-free styles;
- non-English or mixed-language profiles.

Run the same set whenever the prompt or model version changes.

## 14. Cost controls

Current X documentation lists Post reads at $0.005 per resource and User reads at $0.010 per resource. A new 30-post profile is therefore roughly $0.16 in X reads before any deduplication or special owned-read pricing. This makes caching essential.

For the LLM, a typical request using a few thousand input tokens and a small structured response should be low-cost on `gpt-5.6-terra`, but record actual token usage rather than relying on estimates.

Initial controls:

- fetch 30 posts once per profile per 24 hours;
- reuse the stored style profile between generations;
- cap five drafts per generation;
- cap free users by profiles and generations per day;
- set hard monthly provider budgets and alerts;
- expose an internal cost dashboard from `usage_events`.

## 15. Scalability and operational risk gates

Adding scalability controls to the plan reduces the chance that they are forgotten, but documentation alone does not mitigate production risk. A control counts as implemented only when it has an owner, a measurable trigger, a test, monitoring, and a verified recovery path.

### Controls required before the first public release

These are inexpensive to add early and expensive to retrofit after abuse or data growth:

- Add composite database indexes for the actual query paths, especially `(user_id, created_at)`, `(user_id, voice_profile_id)`, and active memory retrieval.
- Apply per-user and per-IP rate limits before any paid X or OpenAI operation.
- Enforce daily profile and generation quotas at the database/server boundary.
- Write one `usage_events` record for every provider operation and alert on spend anomalies.
- Cap the number of retrieved memories and the total prompt token budget.
- Use idempotency keys and a database uniqueness constraint to stop duplicate paid work.
- Set explicit provider timeouts, bounded retries with backoff, and user-safe error states.
- Test the pasted-sample fallback so the core drafting workflow remains usable during X outages.
- Store model and prompt versions on every run so a bad rollout can be identified and reversed.

### Controls introduced when measured thresholds are reached

Do not add distributed infrastructure only because future scale is imaginable. Add it when load tests or production measurements reach the trigger. The initial numbers below are operational starting points and should be revised using real traffic.

| Risk | Trigger | Control | Verification evidence |
|---|---|---|---|
| Slow or unreliable X ingestion | X/style-profile work pushes request p95 above 8 seconds, timeout errors exceed 1%, or more than 500 new profiles are processed daily | Move ingestion and voice analysis to an idempotent background queue with retry and dead-letter handling | Load test, forced timeout test, retry test, and proof that duplicate jobs do not create duplicate charges or rows |
| Cache stampede for a popular handle | More than five concurrent refreshes are requested for the same normalized handle | Add a distributed lock and stale-while-revalidate profile cache | Concurrency test showing one provider fetch and consistent results for all callers |
| Generation concurrency exceeds provider or server capacity | Provider 429s exceed 0.5%, queueing delay appears, or configured concurrency is repeatedly exhausted | Add a bounded Redis-backed generation queue with backpressure | Burst test, queue-depth alert, maximum-wait timeout, and graceful rejection test |
| Database queries degrade | Important query p95 exceeds 100 ms or query plans show sequential scans over growing user tables | Tune indexes and queries using production-like data; add pooling if connection pressure is the cause | Saved `EXPLAIN ANALYZE` evidence and before/after latency measurements |
| Append-only tables become operationally heavy | `feedback_events` or `usage_events` exceeds roughly 10 million rows, maintenance becomes slow, or retention deletes cause sustained load | Partition by time and archive only the data required for analytics/compliance | Migration rehearsal, partition-pruning check, restore test, and retention-job test |
| Prompt cost or latency grows with usage | Prompt token p95 exceeds the configured budget or generation p95/cost rises materially | Retrieve only the highest-value memories, compact old preferences, and summarize repeated patterns | Token-budget tests and an evaluation proving quality does not regress after compaction |
| Provider cost is unsustainable | Cost per accepted draft or per retained user exceeds the product budget | Tighten quotas, reuse permitted cached profiles, route simple work to the cheaper evaluated model, and adjust pricing | Cost dashboard, cohort margin report, and model-quality comparison |
| Single-provider outage affects the whole product | Provider availability breaches the service target | Use cached profiles, pasted samples, clear retry states, circuit breakers, and an evaluated model-provider fallback if commercially justified | Game-day outage test and documented recovery time |

### Model routing rule

Do not route models solely by price. Maintain a small evaluation set and use the least expensive configuration that meets the voice-quality, factuality, latency, and acceptance thresholds. A cheaper model may handle style extraction or preference summarization, while generation can use a stronger model only when tests show a meaningful improvement.

### Capacity review cadence

Review the following weekly during beta and monthly after traffic stabilizes:

- active users and generations per user;
- new and refreshed voice profiles;
- X and OpenAI cost per accepted draft;
- request, queue, and database p50/p95/p99 latency;
- provider errors, timeouts, and rate limits;
- cache hit rate and duplicate-work prevention;
- database row growth, storage, connections, and slow queries;
- selection rate, edit distance, and regeneration rate.

Each threshold breach creates a tracked engineering task with an owner and due date. A risk is considered mitigated only after its verification evidence passes; otherwise it remains an accepted residual risk and must be visible in the release checklist.

## 16. Delivery phases

### Phase 0 — policy and product validation

- Confirm X developer access, pricing, storage terms, and the use of public posts for style-grounded generation.
- Decide whether arbitrary public handles are allowed or whether the user must own/connect the account.
- Prepare privacy policy, terms, deletion flow, and AI disclosure.

Exit criterion: the data use is allowed and the product wording is approved.

### Phase 1 — foundation

- Create GitHub repository and Next.js App Router project.
- Configure TypeScript, linting, formatting, and environment validation.
- Create Supabase project, migrations, Auth, and RLS tests.
- Implement login and protected dashboard shell.

Exit criterion: two test accounts cannot read each other’s data.

### Phase 2 — voice ingestion

- Implement X username lookup and timeline fetch.
- Add normalization, filtering, caching, expiry, and pasted-sample fallback.
- Build and persist the structured voice profile.

Exit criterion: a valid handle produces a reviewable voice profile; failures are actionable.

### Phase 3 — draft generation

- Implement the versioned prompt builder.
- Add OpenAI Responses API call with Structured Outputs.
- Persist runs and five drafts.
- Build editable result cards and history.

Exit criterion: drafts are distinct, valid, under the character limit, and recover gracefully from provider errors.

### Phase 4 — learning loop

- Add selection, copy, save, edit, like/dislike, and reason events.
- Create preference memories and retrieval.
- Add the “What the app learned” page and memory deletion.
- Measure baseline versus memory-enhanced results.

Exit criterion: accepted edits demonstrably influence later generations for the same user/profile and never leak across users.

### Phase 5 — hardening

- Add rate limiting, quotas, idempotency, cost tracking, error monitoring, and data deletion jobs.
- Add unit, integration, RLS, and end-to-end tests.
- Run accessibility and responsive UI checks.
- Complete the evaluation set and prompt/model bakeoff.

Exit criterion: security and quality checks pass, and monthly spend is bounded.

### Phase 6 — delivery

- Connect the GitHub repository to Vercel.
- Configure production/preview environment variables.
- Run database migrations and production smoke tests.
- Add the final short README with architecture decisions, setup, tradeoffs, and known limitations.
- Deliver the Vercel URL and GitHub repository URL.

Exit criterion: a new user can sign in, create a voice profile, generate drafts, provide feedback, return later, and see saved history.

## 17. Testing strategy

- Unit: handle normalization, tweet filtering, prompt assembly, preference scoring, cost calculation.
- Contract: mock X and OpenAI responses, including timeouts, rate limits, invalid output, and refusals.
- Database: migrations plus allow/deny RLS tests for every operation.
- Integration: generation persists one run and five drafts atomically.
- End-to-end: sign in, add handle, generate, edit, accept, generate again, verify memory influence, delete data.
- Security: cross-user access, forged IDs, oversized input, repeated requests, secret exposure, and log redaction.
- Visual/accessibility: mobile and desktop layouts, keyboard navigation, focus states, contrast, and loading/error states.

## 18. Main risks and mitigations

| Risk | Mitigation |
|---|---|
| X data use is not approved for this workflow | Validate in Phase 0; fall back to connected accounts or user-pasted owned samples. |
| X API cost dominates the product | Fetch only 30 useful posts, cache 24 hours, deduplicate, and impose profile quotas. |
| Drafts become deceptive impersonation | Draft-only product, clear labels, no invented personal claims, no automatic posting. |
| “Learning” overfits after one click | Weight strong signals, require repeated patterns for global preferences, and make memory editable. |
| Cross-user data leakage | RLS, server-side ownership checks, database tests, and no shared semantic index. |
| Output sounds generic | Use representative examples, explicit style traits, distinct angles, and edit-derived memory. |
| Model or prompt changes reduce quality | Version both, keep an evaluation set, and roll out only after comparison. |
| Provider outage or rate limit | Friendly retry states, cached voice profiles, exponential backoff, and no partial database writes. |

## 19. Recommended decisions to lock before coding

1. Use Supabase for both Auth and Postgres.
2. Use only the official X API plus a pasted-sample fallback.
3. Keep the MVP draft-only with no direct publishing.
4. Default to `gpt-5.6-terra` at low reasoning, configurable by environment.
5. Generate five drafts using Structured Outputs.
6. Implement retrieval-based personalization, not fine-tuning.
7. Learn only from the signed-in user’s feedback and edits.
8. Expire raw X post text within 24 hours.
9. Add RLS tests, rate limits, cost logging, and deletion flows before public launch.
10. Treat X policy confirmation as a release blocker, not an afterthought.

## 20. Deliverables at the end of implementation

- Live Vercel production URL.
- GitHub repository URL.
- Next.js source with migrations and tests.
- Supabase database and Auth configuration.
- Server-side X and OpenAI integrations.
- Feedback-based learning system and user-visible memory controls.
- Short README explaining architecture, decisions, setup, tradeoffs, and limitations.
- A brief evaluation report showing whether personalization improved draft preference and edit distance.

