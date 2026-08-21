-- O email vivia em profiles E em auth.users. Como profiles e legivel por
-- toda a gente, isso expunha os enderecos de todos os profissionais.
-- Passa a existir so no auth.users, e o servidor le-o por esta funcao.

create or replace function public.emails_for(ids uuid[])
returns table(id uuid, email text)
language sql stable security definer set search_path=public, auth as $$
  select u.id, u.email::text from auth.users u where u.id = any(ids)
$$;

revoke all on function public.emails_for(uuid[]) from public, anon, authenticated;
grant execute on function public.emails_for(uuid[]) to service_role;

-- spotlight_pros devolve setof profiles, por isso tem de ser recriada
-- depois de a tabela mudar de forma.
drop function if exists public.spotlight_pros(integer);

alter table public.profiles drop column if exists email;

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

-- my_email deixa de ler de profiles
create or replace function public.my_email()
returns text language sql stable security definer set search_path=public, auth as $$
  select u.email::text from auth.users u where u.id = auth.uid()
$$;

grant execute on function public.my_email() to authenticated;
