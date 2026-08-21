create or replace view public.signups_daily as
select
  date_trunc('day', u.created_at) as dia,
  count(*) as total_registos,
  count(*) filter (where p.account_type = 'professional') as profissionais,
  count(*) filter (where p.account_type = 'client') as clientes,
  count(*) filter (where p.id is null) as sem_perfil
from auth.users u
left join public.profiles p on p.id = u.id
group by 1
order by 1;

-- Só admins podem ler esta vista (assenta em auth.users, dados sensíveis)
revoke all on public.signups_daily from anon, authenticated;
grant select on public.signups_daily to authenticated;
