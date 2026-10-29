-- Okara initial schema: authenticated user data, feedback memory, and usage data.
-- All mutable application rows carry user_id and are protected by RLS.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create type public.voice_source_type as enum ('x_api', 'pasted');
create type public.voice_profile_status as enum ('syncing', 'ready', 'failed', 'deleted');
create type public.generation_status as enum ('pending', 'completed', 'failed');
create type public.feedback_event_type as enum (
  'selected', 'copied', 'saved', 'liked', 'disliked', 'edited', 'dismissed'
);
create type public.feedback_reason_code as enum (
  'too_generic', 'too_long', 'wrong_tone', 'repetitive', 'inaccurate',
  'too_promotional', 'other'
);
create type public.preference_memory_kind as enum (
  'positive_example', 'negative_rule', 'edit_pattern', 'aggregate_summary'
);
create type public.usage_provider as enum ('x', 'openai');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 80
  )
);

create table public.voice_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  handle text,
  normalized_handle text generated always as (
    case
      when handle is null then null
      else lower(trim(leading '@' from btrim(handle)))
    end
  ) stored,
  display_name text not null,
  x_user_id text,
  source_type public.voice_source_type not null,
  style_profile_json jsonb not null default '{}'::jsonb,
  style_profile_version integer not null default 1,
  last_synced_at timestamptz,
  source_expires_at timestamptz,
  status public.voice_profile_status not null default 'syncing',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_profiles_id_user_unique unique (id, user_id),
  constraint voice_profiles_handle_length check (
    handle is null or (char_length(trim(leading '@' from btrim(handle))) between 1 and 15)
  ),
  constraint voice_profiles_handle_format check (
    handle is null or trim(leading '@' from btrim(handle)) ~ '^[A-Za-z0-9_]+$'
  ),
  constraint voice_profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint voice_profiles_style_version_positive check (style_profile_version > 0),
  constraint voice_profiles_x_source_fields check (
    source_type <> 'x_api' or (handle is not null and x_user_id is not null)
  )
);

create unique index voice_profiles_user_active_handle_unique
  on public.voice_profiles (user_id, normalized_handle)
  where normalized_handle is not null and status <> 'deleted';
create index voice_profiles_user_updated_idx
  on public.voice_profiles (user_id, updated_at desc);

create table public.source_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  voice_profile_id uuid not null,
  x_post_id text,
  text text not null,
  source_order smallint not null default 0,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '23 hours'),
  source_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_posts_id_user_unique unique (id, user_id),
  constraint source_posts_voice_profile_user_fk
    foreign key (voice_profile_id, user_id)
    references public.voice_profiles (id, user_id)
    on delete cascade,
  constraint source_posts_text_length check (char_length(text) between 1 and 2000),
  constraint source_posts_source_order_nonnegative check (source_order >= 0),
  constraint source_posts_expiry_after_fetch check (expires_at > fetched_at)
);

create unique index source_posts_profile_x_post_unique
  on public.source_posts (voice_profile_id, x_post_id)
  where x_post_id is not null;
create index source_posts_user_profile_idx
  on public.source_posts (user_id, voice_profile_id, source_order);
create index source_posts_expiry_idx on public.source_posts (expires_at);

create table public.generation_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  voice_profile_id uuid not null,
  brief text not null,
  constraints_json jsonb not null default '{}'::jsonb,
  model text not null,
  prompt_version text not null,
  idempotency_key text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status public.generation_status not null default 'pending',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_runs_id_user_unique unique (id, user_id),
  constraint generation_runs_voice_profile_user_fk
    foreign key (voice_profile_id, user_id)
    references public.voice_profiles (id, user_id)
    on delete cascade,
  constraint generation_runs_brief_length check (char_length(brief) between 10 and 4000),
  constraint generation_runs_model_length check (char_length(model) between 1 and 120),
  constraint generation_runs_prompt_version_length check (char_length(prompt_version) between 1 and 80),
  constraint generation_runs_token_counts_nonnegative check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
  ),
  constraint generation_runs_latency_nonnegative check (latency_ms is null or latency_ms >= 0)
);

create unique index generation_runs_user_idempotency_unique
  on public.generation_runs (user_id, idempotency_key)
  where idempotency_key is not null;
create index generation_runs_user_created_idx
  on public.generation_runs (user_id, created_at desc);
create index generation_runs_user_profile_created_idx
  on public.generation_runs (user_id, voice_profile_id, created_at desc);

create table public.drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_run_id uuid not null,
  text text not null,
  angle text not null,
  position smallint not null,
  style_note text not null,
  character_count integer generated always as (char_length(text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drafts_id_user_unique unique (id, user_id),
  constraint drafts_generation_run_user_fk
    foreign key (generation_run_id, user_id)
    references public.generation_runs (id, user_id)
    on delete cascade,
  constraint drafts_text_length check (char_length(text) between 1 and 500),
  constraint drafts_angle_allowed check (
    angle in ('observation', 'educational', 'contrarian', 'story', 'question', 'announcement', 'opinion')
  ),
  constraint drafts_position_range check (position between 0 and 4),
  constraint drafts_style_note_length check (char_length(style_note) between 1 and 240),
  constraint drafts_run_position_unique unique (generation_run_id, position)
);

create index drafts_user_created_idx on public.drafts (user_id, created_at desc);

create table public.feedback_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  voice_profile_id uuid not null,
  draft_id uuid not null,
  event_type public.feedback_event_type not null,
  reason_code public.feedback_reason_code,
  edited_text text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint feedback_events_id_user_unique unique (id, user_id),
  constraint feedback_events_voice_profile_user_fk
    foreign key (voice_profile_id, user_id)
    references public.voice_profiles (id, user_id)
    on delete cascade,
  constraint feedback_events_draft_user_fk
    foreign key (draft_id, user_id)
    references public.drafts (id, user_id)
    on delete cascade,
  constraint feedback_events_edited_text_length check (
    edited_text is null or char_length(edited_text) between 1 and 500
  ),
  constraint feedback_events_edit_requires_text check (
    event_type <> 'edited' or edited_text is not null
  ),
  constraint feedback_events_dislike_reason check (
    event_type <> 'disliked' or reason_code is not null
  )
);

create index feedback_events_user_created_idx
  on public.feedback_events (user_id, created_at desc);
create index feedback_events_user_profile_created_idx
  on public.feedback_events (user_id, voice_profile_id, created_at desc);
create index feedback_events_draft_idx on public.feedback_events (draft_id, created_at desc);

create table public.preference_memories (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  voice_profile_id uuid not null,
  kind public.preference_memory_kind not null,
  content_json jsonb not null,
  source_feedback_event_id uuid,
  weight numeric(5, 4) not null default 1.0,
  embedding extensions.vector(1536),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preference_memories_voice_profile_user_fk
    foreign key (voice_profile_id, user_id)
    references public.voice_profiles (id, user_id)
    on delete cascade,
  constraint preference_memories_feedback_user_fk
    foreign key (source_feedback_event_id, user_id)
    references public.feedback_events (id, user_id)
    on delete set null (source_feedback_event_id),
  constraint preference_memories_weight_range check (weight between 0 and 10),
  constraint preference_memories_content_object check (jsonb_typeof(content_json) = 'object')
);

create index preference_memories_user_profile_active_idx
  on public.preference_memories (user_id, voice_profile_id, kind, weight desc, updated_at desc)
  where active;

create table public.usage_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.usage_provider not null,
  operation text not null,
  units numeric(14, 4) not null,
  estimated_cost_usd numeric(14, 6) not null default 0,
  request_id text,
  created_at timestamptz not null default now(),
  constraint usage_events_operation_length check (char_length(operation) between 1 and 100),
  constraint usage_events_units_nonnegative check (units >= 0),
  constraint usage_events_cost_nonnegative check (estimated_cost_usd >= 0)
);

create index usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);
create index usage_events_provider_created_idx
  on public.usage_events (provider, created_at desc);
create unique index usage_events_provider_request_unique
  on public.usage_events (provider, request_id)
  where request_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger voice_profiles_set_updated_at
  before update on public.voice_profiles
  for each row execute function public.set_updated_at();
create trigger source_posts_set_updated_at
  before update on public.source_posts
  for each row execute function public.set_updated_at();
create trigger generation_runs_set_updated_at
  before update on public.generation_runs
  for each row execute function public.set_updated_at();
create trigger drafts_set_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();
create trigger preference_memories_set_updated_at
  before update on public.preference_memories
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.delete_expired_source_posts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.source_posts where expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.delete_expired_source_posts() from public, anon, authenticated;
grant execute on function public.delete_expired_source_posts() to service_role;

alter table public.profiles enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.source_posts enable row level security;
alter table public.generation_runs enable row level security;
alter table public.drafts enable row level security;
alter table public.feedback_events enable row level security;
alter table public.preference_memories enable row level security;
alter table public.usage_events enable row level security;

alter table public.profiles force row level security;
alter table public.voice_profiles force row level security;
alter table public.source_posts force row level security;
alter table public.generation_runs force row level security;
alter table public.drafts force row level security;
alter table public.feedback_events force row level security;
alter table public.preference_memories force row level security;
alter table public.usage_events force row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.voice_profiles to authenticated;
grant select, insert, update, delete on public.source_posts to authenticated;
grant select, insert, update, delete on public.generation_runs to authenticated;
grant select, insert, update, delete on public.drafts to authenticated;
grant select, insert, delete on public.feedback_events to authenticated;
grant select, insert, update, delete on public.preference_memories to authenticated;
grant select on public.usage_events to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'voice_profiles', 'source_posts', 'generation_runs',
    'drafts', 'feedback_events', 'preference_memories', 'usage_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || '_update_own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name || '_delete_own', table_name
    );
  end loop;
end
$$;

comment on table public.source_posts is
  'Short-lived voice samples. X-derived text must expire within 24 hours.';
comment on table public.feedback_events is
  'Append-only application feedback. Authenticated clients receive no UPDATE grant.';
comment on table public.usage_events is
  'Provider usage ledger. Authenticated clients are read-only; server service role writes authoritative rows.';
