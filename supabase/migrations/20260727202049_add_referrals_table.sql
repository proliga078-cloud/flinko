create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid not null references public.profiles(id),
  job_id uuid references public.jobs(id) on delete set null,
  client_name text,
  note text,
  created_at timestamptz not null default now(),
  constraint referrals_not_self check (referrer_id <> referred_id)
);
alter table public.referrals enable row level security;
create policy referrals_select_involved on public.referrals for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy referrals_insert_own on public.referrals for insert with check (auth.uid() = referrer_id);
create policy referrals_delete_own on public.referrals for delete using (auth.uid() = referrer_id);
