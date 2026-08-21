create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  path text not null,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists site_visits_created_at_idx on public.site_visits (created_at);
create index if not exists site_visits_visitor_id_idx on public.site_visits (visitor_id);

alter table public.site_visits enable row level security;

-- Qualquer visitante (anónimo ou autenticado) pode registar uma visita
create policy "allow insert visits" on public.site_visits
  for insert
  to anon, authenticated
  with check (true);

-- Só admins podem ler os dados de visitas
create policy "admin can read visits" on public.site_visits
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Vista agregada: visitas e visitantes únicos por dia (últimos 90 dias)
create or replace view public.site_visits_daily as
select
  date_trunc('day', created_at) as dia,
  count(*) as visitas,
  count(distinct visitor_id) as visitantes_unicos
from public.site_visits
where created_at > now() - interval '90 days'
group by 1
order by 1;
