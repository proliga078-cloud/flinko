-- Corrige acesso demasiado aberto: as views por si só não respeitam RLS
-- (podem correr com privilégios do dono). Passa a exigir is_admin explicitamente
-- através de funções RPC, e remove o grant direto às views.

revoke all on public.signups_daily from anon, authenticated;
revoke all on public.site_visits_daily from anon, authenticated;

create or replace function public.admin_get_signups_daily()
returns table (dia timestamptz, total_registos bigint, profissionais bigint, clientes bigint, sem_perfil bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'not authorized';
  end if;
  return query select * from public.signups_daily;
end;
$$;

create or replace function public.admin_get_site_visits_daily()
returns table (dia timestamptz, visitas bigint, visitantes_unicos bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'not authorized';
  end if;
  return query select * from public.site_visits_daily;
end;
$$;

revoke all on function public.admin_get_signups_daily() from public;
revoke all on function public.admin_get_site_visits_daily() from public;
grant execute on function public.admin_get_signups_daily() to authenticated;
grant execute on function public.admin_get_site_visits_daily() to authenticated;
