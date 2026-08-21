-- Limites por plano, editaveis sem publicar codigo novo
create table if not exists public.plan_limits (
  plan text primary key,
  portfolio_max integer not null,
  quotes_per_month integer,          -- null = ilimitado
  finances boolean not null default false,
  own_branding boolean not null default false,
  custom_link boolean not null default false,
  request_head_start_minutes integer not null default 0,
  listing_boost boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.plan_limits (plan, portfolio_max, quotes_per_month, finances, own_branding, custom_link, request_head_start_minutes, listing_boost)
values
  ('free',    3,    3, false, false, false,   0, false),
  ('pro',  9999, null,  true,  true,  true, 120,  true),
  ('premium', 9999, null, true, true, true, 120, true)
on conflict (plan) do update set
  portfolio_max=excluded.portfolio_max,
  quotes_per_month=excluded.quotes_per_month,
  finances=excluded.finances,
  own_branding=excluded.own_branding,
  custom_link=excluded.custom_link,
  request_head_start_minutes=excluded.request_head_start_minutes,
  listing_boost=excluded.listing_boost,
  updated_at=now();

alter table public.plan_limits enable row level security;
create policy plan_limits_public_read on public.plan_limits for select using (true);

-- link personalizado do profissional (para o Pro)
alter table public.profiles add column if not exists slug text unique;
create index if not exists profiles_slug_idx on public.profiles (slug) where slug is not null;
