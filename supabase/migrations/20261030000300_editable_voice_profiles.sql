create or replace function public.replace_voice_profile_samples(
  p_voice_profile_id uuid,
  p_display_name text,
  p_style_profile jsonb,
  p_samples jsonb,
  p_fetched_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.voice_profiles%rowtype;
  v_sample_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if char_length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'Display name must contain between 1 and 80 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_style_profile) <> 'object' then
    raise exception 'Style profile must be an object.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_samples) <> 'array' then
    raise exception 'Samples must be an array.' using errcode = '22023';
  end if;
  v_sample_count := jsonb_array_length(p_samples);
  if v_sample_count not between 3 and 30 then
    raise exception 'Provide between 3 and 30 samples.' using errcode = '22023';
  end if;
  if p_expires_at <= p_fetched_at or p_expires_at > p_fetched_at + interval '24 hours' then
    raise exception 'Sample expiry must be after collection and within 24 hours.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_samples) sample(value)
    where char_length(btrim(sample.value)) not between 10 and 2000
  ) then
    raise exception 'Each sample must contain between 10 and 2000 characters.' using errcode = '22023';
  end if;

  select profile.* into v_profile
  from public.voice_profiles profile
  where profile.id = p_voice_profile_id
    and profile.user_id = v_user_id
    and profile.status <> 'deleted'
  for update;
  if not found then
    return null;
  end if;

  delete from public.source_posts
  where user_id = v_user_id and voice_profile_id = p_voice_profile_id;

  insert into public.source_posts (
    user_id, voice_profile_id, x_post_id, text, source_order,
    posted_at, fetched_at, expires_at, source_metadata_json
  )
  select
    v_user_id,
    p_voice_profile_id,
    null,
    sample.value,
    (sample.ordinality - 1)::smallint,
    null,
    p_fetched_at,
    p_expires_at,
    jsonb_build_object('origin', 'curated')
  from jsonb_array_elements_text(p_samples) with ordinality as sample(value, ordinality);

  update public.voice_profiles
  set
    display_name = btrim(p_display_name),
    style_profile_json = p_style_profile,
    style_profile_version = style_profile_version + 1,
    last_synced_at = p_fetched_at,
    source_expires_at = p_expires_at,
    status = 'ready',
    error_code = null
  where id = p_voice_profile_id and user_id = v_user_id;

  return jsonb_build_object(
    'id', p_voice_profile_id,
    'sampleCount', v_sample_count,
    'styleProfileVersion', v_profile.style_profile_version + 1
  );
end;
$$;

revoke all on function public.replace_voice_profile_samples(
  uuid, text, jsonb, jsonb, timestamptz, timestamptz
) from public, anon;
grant execute on function public.replace_voice_profile_samples(
  uuid, text, jsonb, jsonb, timestamptz, timestamptz
) to authenticated;

comment on function public.replace_voice_profile_samples(
  uuid, text, jsonb, jsonb, timestamptz, timestamptz
) is 'Atomically replaces an owned voice profile curated sample set and its derived style profile.';
