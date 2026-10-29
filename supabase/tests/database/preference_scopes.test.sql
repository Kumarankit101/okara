begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select has_column(
  'public', 'preference_memories', 'copied_from_memory_id',
  'preference memories expose copy provenance'
);
select ok(
  (select is_nullable = 'YES'
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'preference_memories'
     and column_name = 'voice_profile_id'),
  'voice profile is nullable for Global preference scope'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '81111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
  'preference-scopes@example.test', 'test', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.voice_profiles (
  id, user_id, display_name, source_type, style_profile_json, status
)
values (
  '81111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '81111111-1111-4111-8111-111111111111',
  'Scoped voice', 'pasted', '{}'::jsonb, 'ready'
);

insert into public.generation_runs (
  id, user_id, voice_profile_id, brief, constraints_json, model, prompt_version, status
)
values (
  '81111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '81111111-1111-4111-8111-111111111111',
  '81111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Preference scope fixture.', '{}'::jsonb, 'test-model', 'test-scope', 'completed'
);

insert into public.drafts (
  id, user_id, generation_run_id, text, angle, position, style_note
)
values (
  '81111111-cccc-4ccc-8ccc-cccccccccccc',
  '81111111-1111-4111-8111-111111111111',
  '81111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Preference scope draft.', 'observation', 0, 'Scope fixture.'
);

insert into public.preference_memories (
  id, user_id, voice_profile_id, kind, content_json, memory_key, source_draft_id
)
values (
  '81111111-dddd-4ddd-8ddd-dddddddddddd',
  '81111111-1111-4111-8111-111111111111',
  '81111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'positive_example', '{"text":"Voice preference"}'::jsonb, 'shared-key',
  '81111111-cccc-4ccc-8ccc-cccccccccccc'
);

select lives_ok(
  $$ insert into public.preference_memories (
       user_id, voice_profile_id, kind, content_json, memory_key,
       source_draft_id, copied_from_memory_id
     ) values (
       '81111111-1111-4111-8111-111111111111', null,
       'positive_example', '{"text":"Global preference"}'::jsonb, 'shared-key',
       '81111111-cccc-4ccc-8ccc-cccccccccccc',
       '81111111-dddd-4ddd-8ddd-dddddddddddd'
     ) $$,
  'a Global memory may use the same stable key as a voice-specific memory'
);
select is(
  (select count(*)::integer from public.preference_memories where voice_profile_id is null),
  1,
  'a NULL voice profile stores a Global memory'
);
select is(
  (select copied_from_memory_id from public.preference_memories where voice_profile_id is null),
  '81111111-dddd-4ddd-8ddd-dddddddddddd'::uuid,
  'Global memory records same-user source provenance'
);
select throws_ok(
  $$ insert into public.preference_memories (
       user_id, voice_profile_id, kind, content_json, memory_key
     ) values (
       '81111111-1111-4111-8111-111111111111', null,
       'positive_example', '{}'::jsonb, 'shared-key'
     ) $$,
  '23505', null,
  'only one Global memory exists per user and stable key'
);
select throws_ok(
  $$ insert into public.preference_memories (
       user_id, voice_profile_id, kind, content_json, memory_key
     ) values (
       '81111111-1111-4111-8111-111111111111',
       '81111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'positive_example', '{}'::jsonb, 'shared-key'
     ) $$,
  '23505', null,
  'only one voice-specific memory exists per user, voice, and stable key'
);
select lives_ok(
  $$ insert into public.preference_memories (
       user_id, voice_profile_id, kind, content_json, memory_key
     ) values (
       '81111111-1111-4111-8111-111111111111', null,
       'positive_example', '{}'::jsonb, 'rpc-conflict-key'
     )
     on conflict (user_id, voice_profile_id, memory_key) do update
       set content_json = excluded.content_json $$,
  'column-inferred ON CONFLICT remains compatible with the scope index'
);
select throws_ok(
  $$ insert into public.preference_memories (
       user_id, voice_profile_id, kind, content_json, memory_key, copied_from_memory_id
     ) values (
       '81111111-1111-4111-8111-111111111111', null,
       'positive_example', '{}'::jsonb, 'missing-provenance',
       '81111111-eeee-4eee-8eee-eeeeeeeeeeee'
     ) $$,
  '23503', null,
  'copy provenance must reference an existing same-user memory'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$ select public.apply_feedback_v2(
       '81111111-cccc-4ccc-8ccc-cccccccccccc', 'selected',
       '81111111-ffff-4fff-8fff-ffffffffffff', true, null, null, null
     ) $$,
  'the existing feedback RPC remains compatible with the replacement unique index'
);
reset role;

delete from public.voice_profiles
where id = '81111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is(
  (select count(*)::integer from public.preference_memories where voice_profile_id is null),
  2,
  'Global memories survive deletion of their source voice'
);
select is(
  (select source_draft_id from public.preference_memories where memory_key = 'shared-key'),
  null::uuid,
  'source draft deletion clears provenance without deleting the Global memory'
);
select is(
  (select copied_from_memory_id from public.preference_memories where memory_key = 'shared-key'),
  null::uuid,
  'source memory deletion clears copy provenance without deleting the Global memory'
);
select is(
  (select count(*)::integer from public.preference_memories where voice_profile_id is not null),
  0,
  'voice-specific memories retain voice deletion cascade behavior'
);

select * from finish();
rollback;
