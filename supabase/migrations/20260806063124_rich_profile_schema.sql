alter table public.profiles
  add column if not exists experience_years integer,
  add column if not exists specialties text[] default '{}'::text[],
  add column if not exists certifications jsonb default '[]'::jsonb,
  add column if not exists languages text[] default '{}'::text[],
  add column if not exists payment_methods text[] default '{}'::text[],
  add column if not exists has_insurance boolean default false;

alter table public.portfolio_items
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists before_photo_url text,
  add column if not exists duration_label text;

create table if not exists public.professional_updates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  photo_url text,
  location_label text,
  created_at timestamptz default now()
);
alter table public.professional_updates enable row level security;
create policy "updates_select" on public.professional_updates for select using (true);
create policy "updates_insert" on public.professional_updates for insert with check (auth.uid() = professional_id);
create policy "updates_update" on public.professional_updates for update using (auth.uid() = professional_id);
create policy "updates_delete" on public.professional_updates for delete using (auth.uid() = professional_id);

create table if not exists public.professional_faqs (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  order_index integer default 0,
  created_at timestamptz default now()
);
alter table public.professional_faqs enable row level security;
create policy "faqs_select" on public.professional_faqs for select using (true);
create policy "faqs_insert" on public.professional_faqs for insert with check (auth.uid() = professional_id);
create policy "faqs_update" on public.professional_faqs for update using (auth.uid() = professional_id);
create policy "faqs_delete" on public.professional_faqs for delete using (auth.uid() = professional_id);

create index if not exists idx_professional_updates_pro on public.professional_updates(professional_id, created_at desc);
create index if not exists idx_professional_faqs_pro on public.professional_faqs(professional_id, order_index);
