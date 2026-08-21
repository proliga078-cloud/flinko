alter table public.profiles
  add column if not exists unavailable_until date,
  add column if not exists unavailable_message text,
  add column if not exists notify_digest boolean default true;

alter table public.jobs
  add column if not exists materials_checklist text;
