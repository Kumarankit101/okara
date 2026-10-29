begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select has_function(
  'public',
  'replace_voice_profile_samples',
  array['uuid', 'text', 'jsonb', 'jsonb', 'timestamp with time zone', 'timestamp with time zone'],
  'voice sample replacement function exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.replace_voice_profile_samples(uuid,text,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users can invoke voice rebuilding'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '82222222-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'voice-owner@example.test', 'test', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '82222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'voice-other@example.test', 'test', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.voice_profiles (
  id, user_id, display_name, source_type, style_profile_json, style_profile_version, status
)
values (
  '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '82222222-1111-4111-8111-111111111111',
  'Original voice', 'pasted', '{}'::jsonb, 1, 'ready'
);

insert into public.source_posts (
  user_id, voice_profile_id, text, source_order, expires_at
)
values
  (
    '82222222-1111-4111-8111-111111111111',
    '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Original source sample that will be replaced.', 0, now() + interval '1 hour'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '82222222-1111-4111-8111-111111111111', true);

select lives_ok(
  $$ select public.replace_voice_profile_samples(
       '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'Curated voice',
       '{"summary":"curated"}'::jsonb,
       '["First curated sample with enough detail.","Second curated sample with enough detail.","Third curated sample with enough detail."]'::jsonb,
       now(),
       now() + interval '23 hours'
     ) $$,
  'the owner can atomically rebuild a voice'
);
select is(
  (select display_name from public.voice_profiles where id = '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'Curated voice',
  'rebuilding updates the voice name'
);
select is(
  (select style_profile_version from public.voice_profiles where id = '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2,
  'rebuilding increments the style profile version'
);
select is(
  (select count(*)::integer from public.source_posts where voice_profile_id = '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  3,
  'the old source set is replaced by the curated samples'
);

select set_config('request.jwt.claim.sub', '82222222-2222-4222-8222-222222222222', true);
select is(
  public.replace_voice_profile_samples(
    '82222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Forbidden update',
    '{}'::jsonb,
    '["First unauthorized sample text.","Second unauthorized sample text.","Third unauthorized sample text."]'::jsonb,
    now(),
    now() + interval '23 hours'
  ),
  null::jsonb,
  'another user cannot rebuild an owned voice'
);

select * from finish();
rollback;
