begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select has_table('public', 'draft_feedback_state', 'feedback state table exists');
select has_table('public', 'generation_memory_links', 'generation-memory audit table exists');
select has_function('public', 'apply_feedback_v2', 'atomic feedback RPC exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.draft_feedback_state'::regclass),
  'feedback state has enabled and forced RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.draft_feedback_state', 'INSERT'),
  'authenticated clients cannot bypass the feedback RPC with direct state inserts'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_feedback_v2(uuid,public.feedback_event_type,uuid,boolean,text,public.feedback_reason_code,text)',
    'EXECUTE'
  ),
  'authenticated clients can execute the feedback RPC'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '31111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'feedback-one@example.test', 'test', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '32222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'feedback-two@example.test', 'test', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.voice_profiles (
  id, user_id, display_name, source_type, style_profile_json, status
)
values
  (
    '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '31111111-1111-4111-8111-111111111111',
    'Feedback voice', 'pasted', '{}'::jsonb, 'ready'
  ),
  (
    '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '32222222-2222-4222-8222-222222222222',
    'Other voice', 'pasted', '{}'::jsonb, 'ready'
  );

insert into public.generation_runs (
  id, user_id, voice_profile_id, brief, constraints_json, model, prompt_version, status
)
values
  (
    '3ccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '31111111-1111-4111-8111-111111111111',
    '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Teach a clear product feedback lesson.',
    '{"objective":"educate","toneIntensity":4}'::jsonb,
    'test-model', 'test-v2', 'completed'
  ),
  (
    '3ddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '32222222-2222-4222-8222-222222222222',
    '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Another user generation.',
    '{"objective":"engage","toneIntensity":3}'::jsonb,
    'test-model', 'test-v2', 'completed'
  );

insert into public.drafts (
  id, user_id, generation_run_id, text, angle, position, style_note
)
values
  (
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    '31111111-1111-4111-8111-111111111111',
    '3ccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'First generated draft.', 'educational', 0, 'Clear teaching angle.'
  ),
  (
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
    '31111111-1111-4111-8111-111111111111',
    '3ccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Second generated draft.', 'observation', 1, 'Observational angle.'
  ),
  (
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
    '32222222-2222-4222-8222-222222222222',
    '3ddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Other user draft.', 'opinion', 0, 'Other user angle.'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '31111111-1111-4111-8111-111111111111', true);

select is(
  (public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'selected',
    '30000000-0000-4000-8000-000000000001', true, null, null, null
  ) ->> 'replayed')::boolean,
  false,
  'the first selection is not a replay'
);
select is(
  (select is_selected from public.draft_feedback_state where draft_id = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  true,
  'selection updates authoritative state'
);
select is(
  (select count(*)::integer from public.feedback_events where client_event_id = '30000000-0000-4000-8000-000000000001'),
  1,
  'the first mutation writes one audit event'
);
select is(
  (select count(*)::integer from public.preference_memories where memory_key = 'positive:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  1,
  'the first selection writes one stable positive memory'
);

select is(
  (public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'selected',
    '30000000-0000-4000-8000-000000000001', true, null, null, null
  ) ->> 'replayed')::boolean,
  true,
  'the same client event id replays safely'
);
select is(
  (select count(*)::integer from public.feedback_events where client_event_id = '30000000-0000-4000-8000-000000000001'),
  1,
  'an idempotent replay does not append another event'
);

select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'selected',
    '30000000-0000-4000-8000-000000000002', true, null, null, null
  ) $$,
  'a deliberate repeated click remains auditable'
);
select is(
  (select count(*)::integer from public.preference_memories where memory_key = 'positive:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  1,
  'a repeated click still has only one learning memory'
);
select is(
  (select evidence_count from public.preference_memories where memory_key = 'positive:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  1,
  'a repeated click does not multiply learning evidence'
);

select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'selected',
    '30000000-0000-4000-8000-000000000003', true, null, null, null
  ) $$,
  'selecting another draft succeeds'
);
select is(
  (select count(*)::integer from public.draft_feedback_state where generation_run_id = '3ccccccc-cccc-4ccc-8ccc-cccccccccccc' and is_selected),
  1,
  'only one draft can be selected per generation'
);
select is(
  (select is_selected from public.draft_feedback_state where draft_id = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  false,
  'selecting another draft clears the previous selection'
);

select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'saved',
    '30000000-0000-4000-8000-000000000009', true, null, null, null
  ) $$,
  'a draft can be saved independently of selection'
);
select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'disliked',
    '30000000-0000-4000-8000-000000000004', true, null, 'too_promotional', 'Remove the sales language.'
  ) $$,
  'explicit rejection with a reason succeeds'
);
select is(
  (select count(*)::integer from public.preference_memories where memory_key = 'negative:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1' and active),
  1,
  'rejection creates one active negative rule'
);
select is(
  (select active from public.preference_memories where memory_key = 'positive:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  false,
  'an explicit rejection overrides an older saved positive signal'
);
select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'disliked',
    '30000000-0000-4000-8000-000000000005', false, null, null, null
  ) $$,
  'rejection can be undone without repeating its reason'
);
select is(
  (select active from public.preference_memories where memory_key = 'negative:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  false,
  'undo deactivates the negative rule'
);
select is(
  (select active from public.preference_memories where memory_key = 'positive:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  true,
  'undo restores the remaining saved positive signal'
);

select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'edited',
    '30000000-0000-4000-8000-000000000006', true, 'A tighter final draft.', null, null
  ) $$,
  'an edit is persisted atomically'
);
select is(
  (select revision from public.draft_feedback_state where draft_id = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  1,
  'the first distinct edit increments the revision once'
);
select lives_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'edited',
    '30000000-0000-4000-8000-000000000007', true, 'A tighter final draft.', null, null
  ) $$,
  'the same text can be submitted under a new audit event'
);
select is(
  (select revision from public.draft_feedback_state where draft_id = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  1,
  'identical edited text does not inflate revision'
);
select is(
  (select count(*)::integer from public.preference_memories where memory_key = 'edit:3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  1,
  'repeated edit submissions retain one edit memory'
);

select throws_ok(
  $$ select public.apply_feedback_v2(
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'selected',
    '30000000-0000-4000-8000-000000000008', true, null, null, null
  ) $$,
  'P0002',
  'Draft was not found.',
  'cross-user feedback is rejected without revealing ownership'
);

select * from finish();
rollback;
