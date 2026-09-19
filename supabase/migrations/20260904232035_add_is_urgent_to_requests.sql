alter table public.requests add column if not exists is_urgent boolean not null default false;
