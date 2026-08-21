-- ============================================================
-- 1. LINK PROPRIO (slug)
-- ============================================================

alter table public.profiles drop constraint if exists profiles_slug_format;
alter table public.profiles add constraint profiles_slug_format
  check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$');

create table if not exists public.reserved_slugs(slug text primary key);
insert into public.reserved_slugs(slug) values
 ('admin'),('api'),('auth'),('blog'),('dashboard'),('messages'),('pedidos'),
 ('pricing'),('profile'),('profissionais'),('sobre'),('sitemap'),('cookies'),
 ('index'),('categoria'),('como-funciona'),('porque-escolher'),('p'),
 ('eletricistas'),('canalizadores'),('pintores'),('jardineiros'),('limpeza'),
 ('mudancas'),('pedreiros'),('carpinteiros'),('serralheiros'),('decoradores'),
 ('designers'),('programadores'),('reparacoes-tech'),('cabeleireiros'),
 ('esteticistas'),('personal-trainers'),('torna-te-profissional')
on conflict do nothing;

alter table public.reserved_slugs enable row level security;
drop policy if exists reserved_slugs_select on public.reserved_slugs;
create policy reserved_slugs_select on public.reserved_slugs for select using (true);

create or replace function public.check_slug_allowed()
returns trigger language plpgsql security definer set search_path=public as $$
declare permitido boolean;
begin
  if new.slug is null then return new; end if;
  if tg_op='UPDATE' and new.slug is not distinct from old.slug then return new; end if;

  if exists(select 1 from reserved_slugs where slug=new.slug) then
    raise exception 'Esse endereco esta reservado. Escolhe outro.';
  end if;

  select coalesce(pl.custom_link,false) into permitido
  from plan_limits pl where pl.plan = coalesce(new.plan,'free');

  if not coalesce(permitido,false) then
    raise exception 'O link proprio faz parte do plano Pro.';
  end if;

  return new;
end $$;

drop trigger if exists trg_check_slug on public.profiles;
create trigger trg_check_slug before insert or update of slug, plan on public.profiles
  for each row execute function public.check_slug_allowed();

-- ============================================================
-- 2. AVANCO NOS PEDIDOS (tem de ser em RLS)
-- ============================================================

create or replace function public.my_request_delay_minutes()
returns integer language sql stable security definer set search_path=public as $$
  select greatest(
    coalesce((select max(request_head_start_minutes) from plan_limits),0)
    - coalesce((select pl.request_head_start_minutes
                from profiles p
                join plan_limits pl on pl.plan = coalesce(p.plan,'free')
                where p.id = auth.uid()),0)
  ,0)
$$;

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select using (
  auth.uid() = client_id
  or is_admin()
  or created_at <= now() - make_interval(mins => public.my_request_delay_minutes())
);

-- ============================================================
-- 3. DESTAQUE NA HOMEPAGE (rotacao diaria justa)
-- ============================================================

create or replace function public.spotlight_pros(limite integer default 3)
returns setof public.profiles language sql stable security definer set search_path=public as $$
  select p.* from profiles p
  join plan_limits pl on pl.plan = coalesce(p.plan,'free')
  where pl.listing_boost is true
    and coalesce(p.suspended,false) is false
    and coalesce(p.is_demo,false) is false
    and p.category is not null and p.category <> ''
  order by md5(p.id::text || to_char(current_date,'YYYY-MM-DD'))
  limit greatest(limite,0)
$$;

grant execute on function public.spotlight_pros(integer) to anon, authenticated;
grant execute on function public.my_request_delay_minutes() to anon, authenticated;
