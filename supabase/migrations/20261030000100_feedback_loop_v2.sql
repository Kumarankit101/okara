-- Feedback loop v2: idempotent current state, stable learning memories, and retrieval audit.
-- This migration is additive and preserves the append-only feedback event ledger.

alter type public.feedback_reason_code add value if not exists 'too_short';
alter type public.feedback_reason_code add value if not exists 'too_soft';
alter type public.feedback_reason_code add value if not exists 'too_strong';
alter type public.feedback_reason_code add value if not exists 'weak_opening';

alter table public.feedback_events
  add column if not exists client_event_id uuid,
  add column if not exists event_version smallint not null default 2;

alter table public.feedback_events
  drop constraint if exists feedback_events_event_version_positive,
  add constraint feedback_events_event_version_positive check (event_version > 0);

alter table public.feedback_events
  drop constraint if exists feedback_events_dislike_reason,
  add constraint feedback_events_dislike_reason check (
    event_type <> 'disliked'
    or reason_code is not null
    or metadata_json @> '{"active": false}'::jsonb
  );

create unique index if not exists feedback_events_user_client_event_unique
  on public.feedback_events (user_id, client_event_id)
  where client_event_id is not null;

alter table public.preference_memories
  add column if not exists memory_key text,
  add column if not exists source_draft_id uuid,
  add column if not exists objective text,
  add column if not exists tone_intensity smallint,
  add column if not exists evidence_count integer not null default 1;

alter table public.preference_memories
  drop constraint if exists preference_memories_id_user_unique,
  add constraint preference_memories_id_user_unique unique (id, user_id),
  drop constraint if exists preference_memories_source_draft_user_fk,
  add constraint preference_memories_source_draft_user_fk
    foreign key (source_draft_id, user_id)
    references public.drafts (id, user_id)
    on delete cascade,
  drop constraint if exists preference_memories_memory_key_length,
  add constraint preference_memories_memory_key_length check (
    memory_key is null or char_length(memory_key) between 3 and 180
  ),
  drop constraint if exists preference_memories_objective_allowed,
  add constraint preference_memories_objective_allowed check (
    objective is null or objective in ('engage', 'educate', 'announce', 'persuade', 'entertain')
  ),
  drop constraint if exists preference_memories_tone_range,
  add constraint preference_memories_tone_range check (
    tone_intensity is null or tone_intensity between 1 and 5
  ),
  drop constraint if exists preference_memories_evidence_positive,
  add constraint preference_memories_evidence_positive check (evidence_count > 0);

-- Recover source/context for existing memories from their originating feedback event.
update public.preference_memories as memory
set
  source_draft_id = coalesce(memory.source_draft_id, event.draft_id),
  objective = coalesce(
    memory.objective,
    case
      when run.constraints_json ->> 'objective' in ('engage', 'educate', 'announce', 'persuade', 'entertain')
        then run.constraints_json ->> 'objective'
      else 'engage'
    end
  ),
  tone_intensity = coalesce(
    memory.tone_intensity,
    case
      when (run.constraints_json ->> 'toneIntensity') ~ '^[1-5]$'
        then (run.constraints_json ->> 'toneIntensity')::smallint
      else 3
    end
  )
from public.feedback_events as event
join public.drafts as draft on draft.id = event.draft_id and draft.user_id = event.user_id
join public.generation_runs as run on run.id = draft.generation_run_id and run.user_id = draft.user_id
where memory.source_feedback_event_id = event.id
  and memory.user_id = event.user_id;

update public.preference_memories
set memory_key = case
  when kind = 'aggregate_summary' then 'summary:' || voice_profile_id::text
  when source_draft_id is not null and kind = 'positive_example' then 'positive:' || source_draft_id::text
  when source_draft_id is not null and kind = 'negative_rule' then 'negative:' || source_draft_id::text
  when source_draft_id is not null and kind = 'edit_pattern' then 'edit:' || source_draft_id::text
  else 'legacy:' || id::text
end
where memory_key is null;

-- Preserve duplicate legacy rows for audit, but keep only the newest one active and keyed canonically.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, voice_profile_id, memory_key
      order by active desc, updated_at desc, created_at desc, id desc
    ) as duplicate_rank,
    count(*) over (partition by user_id, voice_profile_id, memory_key) as evidence_total
  from public.preference_memories
), keepers as (
  select id, evidence_total from ranked where duplicate_rank = 1
)
update public.preference_memories as memory
set evidence_count = greatest(memory.evidence_count, keepers.evidence_total)
from keepers
where memory.id = keepers.id;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, voice_profile_id, memory_key
      order by active desc, updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.preference_memories
)
update public.preference_memories as memory
set
  active = false,
  memory_key = memory.memory_key || ':legacy:' || memory.id::text
from ranked
where memory.id = ranked.id and ranked.duplicate_rank > 1;

create unique index if not exists preference_memories_user_profile_key_unique
  on public.preference_memories (user_id, voice_profile_id, memory_key);
create index if not exists preference_memories_context_rank_idx
  on public.preference_memories (
    user_id, voice_profile_id, objective, tone_intensity, kind, weight desc, updated_at desc
  ) where active;

create table if not exists public.draft_feedback_state (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  voice_profile_id uuid not null,
  generation_run_id uuid not null,
  draft_id uuid not null,
  current_text text not null,
  revision integer not null default 0,
  is_selected boolean not null default false,
  is_saved boolean not null default false,
  rating text,
  rejection_reason public.feedback_reason_code,
  rejection_note text,
  last_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_feedback_state_id_user_unique unique (id, user_id),
  constraint draft_feedback_state_user_draft_unique unique (user_id, draft_id),
  constraint draft_feedback_state_voice_profile_user_fk
    foreign key (voice_profile_id, user_id)
    references public.voice_profiles (id, user_id)
    on delete cascade,
  constraint draft_feedback_state_generation_run_user_fk
    foreign key (generation_run_id, user_id)
    references public.generation_runs (id, user_id)
    on delete cascade,
  constraint draft_feedback_state_draft_user_fk
    foreign key (draft_id, user_id)
    references public.drafts (id, user_id)
    on delete cascade,
  constraint draft_feedback_state_last_event_user_fk
    foreign key (last_event_id, user_id)
    references public.feedback_events (id, user_id)
    on delete set null (last_event_id),
  constraint draft_feedback_state_text_length check (char_length(current_text) between 1 and 500),
  constraint draft_feedback_state_revision_nonnegative check (revision >= 0),
  constraint draft_feedback_state_rating_allowed check (rating is null or rating in ('positive', 'negative')),
  constraint draft_feedback_state_rejection_consistent check (
    (rating = 'negative' and rejection_reason is not null)
    or (rating is distinct from 'negative' and rejection_reason is null and rejection_note is null)
  ),
  constraint draft_feedback_state_rejection_note_length check (
    rejection_note is null or char_length(rejection_note) between 1 and 500
  )
);

insert into public.draft_feedback_state (
  user_id, voice_profile_id, generation_run_id, draft_id, current_text, revision,
  is_saved, rating, rejection_reason, rejection_note, last_event_id
)
select
  draft.user_id,
  run.voice_profile_id,
  draft.generation_run_id,
  draft.id,
  coalesce(latest_edit.edited_text, draft.text),
  coalesce(edit_count.revision, 0),
  exists (
    select 1 from public.feedback_events event
    where event.user_id = draft.user_id and event.draft_id = draft.id and event.event_type = 'saved'
  ),
  case latest_rating.event_type when 'liked' then 'positive' when 'disliked' then 'negative' else null end,
  case when latest_rating.event_type = 'disliked' then latest_rating.reason_code else null end,
  case when latest_rating.event_type = 'disliked' then latest_rating.metadata_json ->> 'reasonNote' else null end,
  latest_event.id
from public.drafts as draft
join public.generation_runs as run on run.id = draft.generation_run_id and run.user_id = draft.user_id
left join lateral (
  select event.edited_text
  from public.feedback_events event
  where event.user_id = draft.user_id and event.draft_id = draft.id and event.edited_text is not null
  order by event.created_at desc, event.id desc
  limit 1
) latest_edit on true
left join lateral (
  select count(*)::integer as revision
  from public.feedback_events event
  where event.user_id = draft.user_id
    and event.draft_id = draft.id
    and event.edited_text is not null
    and event.edited_text is distinct from draft.text
) edit_count on true
left join lateral (
  select event.event_type, event.reason_code, event.metadata_json
  from public.feedback_events event
  where event.user_id = draft.user_id
    and event.draft_id = draft.id
    and event.event_type in ('liked', 'disliked')
  order by event.created_at desc, event.id desc
  limit 1
) latest_rating on true
left join lateral (
  select event.id
  from public.feedback_events event
  where event.user_id = draft.user_id and event.draft_id = draft.id
  order by event.created_at desc, event.id desc
  limit 1
) latest_event on true
on conflict (user_id, draft_id) do nothing;

-- Legacy selected events did not support undo. Choose only the newest selection per run.
with selected_drafts as (
  select
    state.id,
    row_number() over (
      partition by state.user_id, state.generation_run_id
      order by event.created_at desc, event.id desc
    ) as selection_rank
  from public.draft_feedback_state state
  join lateral (
    select feedback.id, feedback.created_at
    from public.feedback_events feedback
    where feedback.user_id = state.user_id
      and feedback.draft_id = state.draft_id
      and feedback.event_type = 'selected'
    order by feedback.created_at desc, feedback.id desc
    limit 1
  ) event on true
)
update public.draft_feedback_state state
set is_selected = selected_drafts.selection_rank = 1
from selected_drafts
where state.id = selected_drafts.id;

create unique index if not exists draft_feedback_state_one_selected_per_run
  on public.draft_feedback_state (user_id, generation_run_id)
  where is_selected;
create index if not exists draft_feedback_state_user_profile_updated_idx
  on public.draft_feedback_state (user_id, voice_profile_id, updated_at desc);

drop trigger if exists draft_feedback_state_set_updated_at on public.draft_feedback_state;
create trigger draft_feedback_state_set_updated_at
  before update on public.draft_feedback_state
  for each row execute function public.set_updated_at();

create table if not exists public.generation_memory_links (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_run_id uuid not null,
  memory_id uuid not null,
  category public.preference_memory_kind not null,
  final_score numeric(8, 6) not null,
  score_components_json jsonb not null default '{}'::jsonb,
  prompt_position smallint not null,
  outcome text,
  created_at timestamptz not null default now(),
  constraint generation_memory_links_generation_run_user_fk
    foreign key (generation_run_id, user_id)
    references public.generation_runs (id, user_id)
    on delete cascade,
  constraint generation_memory_links_memory_user_fk
    foreign key (memory_id, user_id)
    references public.preference_memories (id, user_id)
    on delete cascade,
  constraint generation_memory_links_run_memory_unique unique (generation_run_id, memory_id),
  constraint generation_memory_links_score_range check (final_score between -1 and 2),
  constraint generation_memory_links_prompt_position_nonnegative check (prompt_position >= 0),
  constraint generation_memory_links_outcome_allowed check (
    outcome is null or outcome in ('positive', 'negative', 'neutral')
  )
);

create index if not exists generation_memory_links_user_run_idx
  on public.generation_memory_links (user_id, generation_run_id, prompt_position);

alter table public.draft_feedback_state enable row level security;
alter table public.draft_feedback_state force row level security;
alter table public.generation_memory_links enable row level security;
alter table public.generation_memory_links force row level security;

revoke all on public.draft_feedback_state from anon, authenticated;
revoke all on public.generation_memory_links from anon, authenticated;
grant select on public.draft_feedback_state to authenticated;
grant select, insert, delete on public.generation_memory_links to authenticated;

drop policy if exists draft_feedback_state_select_own on public.draft_feedback_state;
create policy draft_feedback_state_select_own on public.draft_feedback_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists generation_memory_links_select_own on public.generation_memory_links;
create policy generation_memory_links_select_own on public.generation_memory_links
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists generation_memory_links_insert_own on public.generation_memory_links;
create policy generation_memory_links_insert_own on public.generation_memory_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists generation_memory_links_delete_own on public.generation_memory_links;
create policy generation_memory_links_delete_own on public.generation_memory_links
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.apply_feedback_v2(
  p_draft_id uuid,
  p_event_type public.feedback_event_type,
  p_client_event_id uuid,
  p_active boolean default true,
  p_edited_text text default null,
  p_reason_code public.feedback_reason_code default null,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.drafts%rowtype;
  v_run public.generation_runs%rowtype;
  v_state public.draft_feedback_state%rowtype;
  v_existing_event public.feedback_events%rowtype;
  v_feedback_id uuid := extensions.gen_random_uuid();
  v_effective_text text;
  v_previous_state jsonb;
  v_state_json jsonb;
  v_event_reason public.feedback_reason_code;
  v_positive_active boolean;
  v_positive_weight numeric(5, 4);
  v_memory_updated boolean := false;
  v_objective text;
  v_tone smallint;
  v_edit_observations integer;
  v_average_length_delta numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_client_event_id is null then
    raise exception 'clientEventId is required.' using errcode = '22023';
  end if;
  if p_edited_text is not null and char_length(btrim(p_edited_text)) not between 1 and 500 then
    raise exception 'Edited text must contain between 1 and 500 characters.' using errcode = '22023';
  end if;
  if p_reason_note is not null and char_length(btrim(p_reason_note)) not between 1 and 500 then
    raise exception 'Reason note must contain between 1 and 500 characters.' using errcode = '22023';
  end if;

  select draft.* into v_draft
  from public.drafts draft
  where draft.id = p_draft_id and draft.user_id = v_user_id;
  if not found then
    raise exception 'Draft was not found.' using errcode = 'P0002';
  end if;

  select run.* into v_run
  from public.generation_runs run
  where run.id = v_draft.generation_run_id and run.user_id = v_user_id;
  if not found then
    raise exception 'Generation was not found.' using errcode = 'P0002';
  end if;

  v_objective := case
    when v_run.constraints_json ->> 'objective' in ('engage', 'educate', 'announce', 'persuade', 'entertain')
      then v_run.constraints_json ->> 'objective'
    else 'engage'
  end;
  v_tone := case
    when (v_run.constraints_json ->> 'toneIntensity') ~ '^[1-5]$'
      then (v_run.constraints_json ->> 'toneIntensity')::smallint
    else 3
  end;

  insert into public.draft_feedback_state (
    user_id, voice_profile_id, generation_run_id, draft_id, current_text
  ) values (
    v_user_id, v_run.voice_profile_id, v_run.id, v_draft.id, v_draft.text
  ) on conflict (user_id, draft_id) do nothing;

  select state.* into v_state
  from public.draft_feedback_state state
  where state.user_id = v_user_id and state.draft_id = p_draft_id
  for update;

  select event.* into v_existing_event
  from public.feedback_events event
  where event.user_id = v_user_id and event.client_event_id = p_client_event_id;
  if found then
    if v_existing_event.draft_id <> p_draft_id or v_existing_event.event_type <> p_event_type then
      raise exception 'clientEventId was already used for different feedback.' using errcode = '22023';
    end if;
    v_state_json := jsonb_build_object(
      'selected', v_state.is_selected,
      'saved', v_state.is_saved,
      'liked', coalesce(v_state.rating = 'positive', false),
      'rejected', coalesce(v_state.rating = 'negative', false),
      'currentText', v_state.current_text,
      'revision', v_state.revision,
      'reasonCode', v_state.rejection_reason,
      'reasonNote', v_state.rejection_note
    );
    return jsonb_build_object(
      'replayed', true,
      'state', v_state_json,
      'feedbackId', v_existing_event.id,
      'memoryUpdated', false
    );
  end if;

  if p_event_type = 'disliked' and p_active and p_reason_code is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;
  if p_event_type = 'edited' and p_active and p_edited_text is null then
    raise exception 'Edited feedback requires edited text.' using errcode = '22023';
  end if;

  v_effective_text := case
    when p_event_type = 'edited' and not p_active then v_draft.text
    when p_edited_text is not null then btrim(p_edited_text)
    else v_state.current_text
  end;
  v_event_reason := case
    when p_event_type = 'disliked' then coalesce(p_reason_code, v_state.rejection_reason)
    else p_reason_code
  end;

  v_previous_state := jsonb_build_object(
    'selected', v_state.is_selected,
    'saved', v_state.is_saved,
    'liked', coalesce(v_state.rating = 'positive', false),
    'rejected', coalesce(v_state.rating = 'negative', false),
    'currentText', v_state.current_text,
    'revision', v_state.revision,
    'reasonCode', v_state.rejection_reason,
    'reasonNote', v_state.rejection_note
  );

  insert into public.feedback_events (
    id, user_id, voice_profile_id, draft_id, event_type, reason_code, edited_text,
    client_event_id, event_version, metadata_json
  ) values (
    v_feedback_id, v_user_id, v_run.voice_profile_id, v_draft.id, p_event_type,
    v_event_reason,
    case
      when p_event_type = 'edited' then v_effective_text
      when p_edited_text is distinct from v_draft.text then p_edited_text
      else null
    end,
    p_client_event_id, 2,
    jsonb_build_object(
      'active', p_active,
      'reasonNote', nullif(btrim(coalesce(p_reason_note, '')), ''),
      'previousState', v_previous_state,
      'objective', v_objective,
      'toneIntensity', v_tone
    )
  )
  on conflict (user_id, client_event_id) where client_event_id is not null do nothing;

  if not found then
    select event.* into v_existing_event
    from public.feedback_events event
    where event.user_id = v_user_id and event.client_event_id = p_client_event_id;
    if v_existing_event.draft_id <> p_draft_id or v_existing_event.event_type <> p_event_type then
      raise exception 'clientEventId was already used for different feedback.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'state', v_previous_state,
      'feedbackId', v_existing_event.id,
      'memoryUpdated', false
    );
  end if;

  if p_event_type = 'selected' and p_active then
    update public.draft_feedback_state
    set is_selected = false
    where user_id = v_user_id
      and generation_run_id = v_run.id
      and draft_id <> v_draft.id
      and is_selected;

    update public.preference_memories memory
    set
      active = coalesce(state.rating <> 'negative', true)
        and (state.is_saved or coalesce(state.rating = 'positive', false)),
      weight = case
        when state.rating = 'negative' then 0
        when state.rating = 'positive' then 0.7000
        when state.is_saved then 0.3000
        else 0
      end
    from public.draft_feedback_state state
    where state.user_id = v_user_id
      and state.generation_run_id = v_run.id
      and state.draft_id <> v_draft.id
      and memory.user_id = state.user_id
      and memory.voice_profile_id = state.voice_profile_id
      and memory.memory_key = 'positive:' || state.draft_id::text;
  end if;

  update public.draft_feedback_state
  set
    current_text = v_effective_text,
    revision = revision + case when current_text is distinct from v_effective_text then 1 else 0 end,
    is_selected = case
      when p_event_type = 'selected' then p_active
      when p_event_type = 'disliked' and p_active then false
      else is_selected
    end,
    is_saved = case when p_event_type = 'saved' then p_active else is_saved end,
    rating = case
      when p_event_type = 'liked' and p_active then 'positive'
      when p_event_type = 'liked' and not p_active and rating = 'positive' then null
      when p_event_type = 'disliked' and p_active then 'negative'
      when p_event_type = 'disliked' and not p_active and rating = 'negative' then null
      else rating
    end,
    rejection_reason = case
      when p_event_type = 'disliked' and p_active then p_reason_code
      when p_event_type = 'disliked' and not p_active then null
      when p_event_type = 'liked' and p_active then null
      else rejection_reason
    end,
    rejection_note = case
      when p_event_type = 'disliked' and p_active then nullif(btrim(coalesce(p_reason_note, '')), '')
      when p_event_type = 'disliked' and not p_active then null
      when p_event_type = 'liked' and p_active then null
      else rejection_note
    end,
    last_event_id = v_feedback_id
  where user_id = v_user_id and draft_id = v_draft.id
  returning * into v_state;

  v_positive_active := coalesce(v_state.rating <> 'negative', true)
    and (v_state.is_selected or v_state.is_saved or coalesce(v_state.rating = 'positive', false));
  v_positive_weight := case
    when v_state.rating = 'negative' then 0
    when v_state.is_selected then 1.0000
    when v_state.rating = 'positive' then 0.7000
    when v_state.is_saved then 0.3000
    else 0
  end;

  if p_event_type in ('selected', 'saved', 'liked', 'disliked') then
    insert into public.preference_memories (
      user_id, voice_profile_id, kind, content_json, source_feedback_event_id, weight,
      active, memory_key, source_draft_id, objective, tone_intensity, evidence_count
    ) values (
      v_user_id, v_run.voice_profile_id, 'positive_example',
      jsonb_build_object(
        'text', v_state.current_text,
        'brief', v_run.brief,
        'signals', jsonb_build_object(
          'selected', v_state.is_selected,
          'saved', v_state.is_saved,
          'liked', coalesce(v_state.rating = 'positive', false)
        )
      ),
      v_feedback_id, v_positive_weight, v_positive_active,
      'positive:' || v_draft.id::text, v_draft.id, v_objective, v_tone, 1
    )
    on conflict (user_id, voice_profile_id, memory_key) do update set
      content_json = excluded.content_json,
      source_feedback_event_id = excluded.source_feedback_event_id,
      weight = excluded.weight,
      active = excluded.active,
      objective = excluded.objective,
      tone_intensity = excluded.tone_intensity,
      updated_at = now();
    v_memory_updated := true;
  elsif p_event_type = 'copied' and v_effective_text is distinct from v_draft.text then
    insert into public.preference_memories (
      user_id, voice_profile_id, kind, content_json, source_feedback_event_id, weight,
      active, memory_key, source_draft_id, objective, tone_intensity, evidence_count
    ) values (
      v_user_id, v_run.voice_profile_id, 'positive_example',
      jsonb_build_object('text', v_effective_text, 'brief', v_run.brief, 'signals', jsonb_build_array('copied_edited')),
      v_feedback_id, 0.7000, true,
      'positive:' || v_draft.id::text, v_draft.id, v_objective, v_tone, 1
    )
    on conflict (user_id, voice_profile_id, memory_key) do update set
      content_json = excluded.content_json,
      source_feedback_event_id = excluded.source_feedback_event_id,
      weight = greatest(public.preference_memories.weight, excluded.weight),
      active = true,
      objective = excluded.objective,
      tone_intensity = excluded.tone_intensity,
      updated_at = now();
    v_memory_updated := true;
  end if;

  if p_event_type = 'disliked' then
    insert into public.preference_memories (
      user_id, voice_profile_id, kind, content_json, source_feedback_event_id, weight,
      active, memory_key, source_draft_id, objective, tone_intensity, evidence_count
    ) values (
      v_user_id, v_run.voice_profile_id, 'negative_rule',
      jsonb_build_object(
        'reason', v_state.rejection_reason,
        'note', v_state.rejection_note,
        'example', v_draft.text,
        'brief', v_run.brief
      ),
      v_feedback_id, 1.0000, coalesce(v_state.rating = 'negative', false),
      'negative:' || v_draft.id::text, v_draft.id, v_objective, v_tone, 1
    )
    on conflict (user_id, voice_profile_id, memory_key) do update set
      content_json = excluded.content_json,
      source_feedback_event_id = excluded.source_feedback_event_id,
      weight = excluded.weight,
      active = excluded.active,
      objective = excluded.objective,
      tone_intensity = excluded.tone_intensity,
      updated_at = now();
    v_memory_updated := true;
  end if;

  if v_state.current_text is distinct from v_draft.text then
    insert into public.preference_memories (
      user_id, voice_profile_id, kind, content_json, source_feedback_event_id, weight,
      active, memory_key, source_draft_id, objective, tone_intensity, evidence_count
    ) values (
      v_user_id, v_run.voice_profile_id, 'edit_pattern',
      jsonb_build_object('original', v_draft.text, 'final', v_state.current_text, 'brief', v_run.brief),
      v_feedback_id, 1.0000, true,
      'edit:' || v_draft.id::text, v_draft.id, v_objective, v_tone, 1
    )
    on conflict (user_id, voice_profile_id, memory_key) do update set
      content_json = excluded.content_json,
      source_feedback_event_id = excluded.source_feedback_event_id,
      weight = excluded.weight,
      active = true,
      objective = excluded.objective,
      tone_intensity = excluded.tone_intensity,
      updated_at = now();
    v_memory_updated := true;
  elsif p_event_type = 'edited' and not p_active then
    update public.preference_memories
    set active = false, source_feedback_event_id = v_feedback_id, updated_at = now()
    where user_id = v_user_id
      and voice_profile_id = v_run.voice_profile_id
      and memory_key = 'edit:' || v_draft.id::text;
    v_memory_updated := found;
  end if;

  if p_event_type = 'edited' or p_edited_text is not null then
    select
      count(*)::integer,
      coalesce(avg(char_length(state.current_text) - char_length(draft.text)), 0)
    into v_edit_observations, v_average_length_delta
    from public.draft_feedback_state state
    join public.drafts draft on draft.id = state.draft_id and draft.user_id = state.user_id
    where state.user_id = v_user_id
      and state.voice_profile_id = v_run.voice_profile_id
      and state.current_text is distinct from draft.text;

    insert into public.preference_memories (
      user_id, voice_profile_id, kind, content_json, source_feedback_event_id, weight,
      active, memory_key, objective, tone_intensity, evidence_count
    ) values (
      v_user_id, v_run.voice_profile_id, 'aggregate_summary',
      jsonb_build_object(
        'observations', v_edit_observations,
        'preferredLength', case
          when v_average_length_delta < -10 then 'shorter'
          when v_average_length_delta > 10 then 'longer'
          else 'similar'
        end
      ),
      v_feedback_id, 1.0000, v_edit_observations > 0,
      'summary:' || v_run.voice_profile_id::text, v_objective, v_tone,
      greatest(v_edit_observations, 1)
    )
    on conflict (user_id, voice_profile_id, memory_key) do update set
      content_json = excluded.content_json,
      source_feedback_event_id = excluded.source_feedback_event_id,
      active = excluded.active,
      objective = excluded.objective,
      tone_intensity = excluded.tone_intensity,
      evidence_count = excluded.evidence_count,
      updated_at = now();
  end if;

  v_state_json := jsonb_build_object(
    'selected', v_state.is_selected,
    'saved', v_state.is_saved,
    'liked', coalesce(v_state.rating = 'positive', false),
    'rejected', coalesce(v_state.rating = 'negative', false),
    'currentText', v_state.current_text,
    'revision', v_state.revision,
    'reasonCode', v_state.rejection_reason,
    'reasonNote', v_state.rejection_note
  );

  update public.feedback_events
  set metadata_json = metadata_json || jsonb_build_object('newState', v_state_json)
  where id = v_feedback_id and user_id = v_user_id;

  return jsonb_build_object(
    'replayed', false,
    'state', v_state_json,
    'feedbackId', v_feedback_id,
    'memoryUpdated', v_memory_updated
  );
end;
$$;

revoke all on function public.apply_feedback_v2(
  uuid, public.feedback_event_type, uuid, boolean, text,
  public.feedback_reason_code, text
) from public, anon, authenticated;
grant execute on function public.apply_feedback_v2(
  uuid, public.feedback_event_type, uuid, boolean, text,
  public.feedback_reason_code, text
) to authenticated;

comment on table public.draft_feedback_state is
  'Authoritative, deduplicated current feedback state. Writes occur through apply_feedback_v2.';
comment on table public.generation_memory_links is
  'Audit ledger of the bounded memories selected for each generation prompt.';
comment on function public.apply_feedback_v2(
  uuid, public.feedback_event_type, uuid, boolean, text,
  public.feedback_reason_code, text
) is 'Atomically records idempotent feedback, current state, and stable-key learning memory.';
