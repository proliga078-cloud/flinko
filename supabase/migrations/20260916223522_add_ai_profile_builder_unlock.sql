alter table public.profiles
  add column if not exists ai_profile_builder_unlocked boolean not null default false;

comment on column public.profiles.ai_profile_builder_unlocked is
  'True once the professional has paid the one-time fee (2.99€) to unlock unlimited use of the AI profile builder feature.';
