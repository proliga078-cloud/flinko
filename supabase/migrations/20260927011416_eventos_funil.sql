-- Eventos do funil de clientes: pesquisar, contactar um profissional, começar
-- e publicar um pedido, criar conta.
--
-- As visitas (site_visits), as visualizações de perfis (profile_views), as
-- conversas, os pedidos e os trabalhos já estavam na base de dados; faltavam
-- os passos intermédios para ver onde se perdem os clientes. São enviados por
-- assets/tracking.js, que só corre com consentimento de cookies de análise, e
-- não guardam quem é a pessoa (só o id anónimo do visitante).

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  name text not null check (name in ('pesquisa', 'perfil_contactar', 'pedido_iniciado', 'pedido_publicado', 'conta_criada')),
  visitor_id text check (visitor_id is null or length(visitor_id) <= 80),
  user_id uuid references auth.users(id) on delete set null,
  path text check (path is null or length(path) <= 200),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists site_events_created_at_idx on public.site_events (created_at);

alter table public.site_events enable row level security;

-- Qualquer visitante pode registar um evento (como em site_visits), mas não
-- em nome de outra pessoa. Ninguém lê nem altera pela API: os números chegam
-- ao painel já agregados por admin_event_counts().
drop policy if exists site_events_insert on public.site_events;
create policy site_events_insert on public.site_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Contagens por dia e por evento, só para administradores.
create or replace function public.admin_event_counts(p_days integer default 90)
returns table (day date, name text, n bigint)
language sql
stable
security definer
set search_path = 'public'
as $$
  select (e.created_at at time zone 'Europe/Lisbon')::date as day, e.name, count(*) as n
  from public.site_events e
  where public.is_admin()
    and e.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 400))
  group by 1, 2
  order by 1, 2
$$;

revoke all on function public.admin_event_counts(integer) from public, anon;
grant execute on function public.admin_event_counts(integer) to authenticated;
