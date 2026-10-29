-- Preference scopes: NULL voice_profile_id is Global; UUID remains voice-specific.
-- Existing memories retain their current voice-specific scope.

alter table public.preference_memories
  alter column voice_profile_id drop not null,
  add column if not exists copied_from_memory_id uuid;

alter table public.preference_memories
  drop constraint if exists preference_memories_copied_from_memory_user_fk,
  add constraint preference_memories_copied_from_memory_user_fk
    foreign key (copied_from_memory_id, user_id)
    references public.preference_memories (id, user_id)
    on delete set null (copied_from_memory_id),
  drop constraint if exists preference_memories_source_draft_user_fk,
  add constraint preference_memories_source_draft_user_fk
    foreign key (source_draft_id, user_id)
    references public.drafts (id, user_id)
    on delete set null (source_draft_id);

drop index if exists public.preference_memories_user_profile_key_unique;
create unique index preference_memories_user_profile_key_unique
  on public.preference_memories (user_id, voice_profile_id, memory_key)
  nulls not distinct;

comment on column public.preference_memories.voice_profile_id is
  'Preference scope: NULL is Global; a UUID is specific to that voice profile.';
comment on column public.preference_memories.copied_from_memory_id is
  'Optional same-user provenance for a preference copied into another scope.';
