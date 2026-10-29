begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'voice_profiles', 'voice_profiles exists');
select has_table('public', 'source_posts', 'source_posts exists');
select has_table('public', 'generation_runs', 'generation_runs exists');
select has_table('public', 'drafts', 'drafts exists');
select has_table('public', 'feedback_events', 'feedback_events exists');
select has_table('public', 'preference_memories', 'preference_memories exists');
select has_table('public', 'usage_events', 'usage_events exists');

select ok(
  (
    select count(*) = 8
    from pg_class
    where oid in (
      'public.profiles'::regclass,
      'public.voice_profiles'::regclass,
      'public.source_posts'::regclass,
      'public.generation_runs'::regclass,
      'public.drafts'::regclass,
      'public.feedback_events'::regclass,
      'public.preference_memories'::regclass,
      'public.usage_events'::regclass
    )
    and relrowsecurity
    and relforcerowsecurity
  ),
  'RLS is enabled and forced on all user-owned tables'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public'),
  32,
  'each user-owned table has select, insert, update, and delete ownership policies'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'one@example.test', 'test', now(), '{}'::jsonb,
    '{"full_name":"User One"}'::jsonb, now(), now()
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'two@example.test', 'test', now(), '{}'::jsonb,
    '{"full_name":"User Two"}'::jsonb, now(), now()
  );

select is(
  (select display_name from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  'User One',
  'new-auth-user trigger creates the first profile'
);
select is(
  (select display_name from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  'User Two',
  'new-auth-user trigger creates the second profile'
);

insert into public.voice_profiles (
  id, user_id, display_name, source_type, style_profile_json, status
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'Other user voice', 'pasted', '{}'::jsonb, 'ready'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is(
  (select count(*)::bigint from public.profiles),
  1::bigint,
  'an authenticated user can only select their own profile'
);

select lives_ok(
  $$
    insert into public.voice_profiles (
      id, user_id, display_name, source_type, style_profile_json, status
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111',
      'My pasted voice', 'pasted', '{}'::jsonb, 'ready'
    )
  $$,
  'a user can insert their own voice profile'
);

select throws_ok(
  $$
    insert into public.voice_profiles (
      user_id, display_name, source_type, style_profile_json, status
    ) values (
      '22222222-2222-4222-8222-222222222222',
      'Forbidden voice', 'pasted', '{}'::jsonb, 'ready'
    )
  $$,
  '42501',
  null,
  'RLS rejects inserting a row owned by another user'
);

select throws_ok(
  $$
    insert into public.source_posts (
      user_id, voice_profile_id, text, expires_at
    ) values (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Attempted cross-user relationship', now() + interval '1 hour'
    )
  $$,
  '23503',
  null,
  'composite foreign keys reject cross-user relationships'
);

select throws_ok(
  $$
    insert into public.usage_events (
      user_id, provider, operation, units
    ) values (
      '11111111-1111-4111-8111-111111111111',
      'openai', 'spoofed_client_usage', 1
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot write the authoritative usage ledger'
);

select throws_ok(
  $$ select public.delete_expired_source_posts() $$,
  '42501',
  null,
  'authenticated clients cannot invoke source cleanup'
);

reset role;

select ok(
  not has_table_privilege('authenticated', 'public.feedback_events', 'UPDATE'),
  'feedback events are append-only for authenticated clients'
);

select ok(
  has_function_privilege('service_role', 'public.delete_expired_source_posts()', 'EXECUTE'),
  'service role can run expired-source cleanup'
);

select * from finish();
rollback;
