create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id),
  job_id uuid references public.jobs(id) on delete set null,
  client_name text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  valid_days integer not null default 30,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
create policy quotes_select_own on public.quotes for select using (auth.uid() = professional_id);
create policy quotes_insert_own on public.quotes for insert with check (auth.uid() = professional_id);
create policy quotes_update_own on public.quotes for update using (auth.uid() = professional_id);
create policy quotes_delete_own on public.quotes for delete using (auth.uid() = professional_id);
