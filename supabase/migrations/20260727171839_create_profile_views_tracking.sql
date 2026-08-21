create table public.profile_views (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index idx_profile_views_profile_date on public.profile_views(profile_id, viewed_at);

alter table public.profile_views enable row level security;

-- anyone (including anonymous visitors) can log a view for a profile
create policy profile_views_insert_public on public.profile_views
  for insert
  with check (true);

-- only the profile owner can read their own view history
create policy profile_views_select_own on public.profile_views
  for select
  using (auth.uid() = profile_id);

create policy admin_select_profile_views on public.profile_views
  for select
  using (is_admin());

create policy admin_delete_profile_views on public.profile_views
  for delete
  using (is_admin());
