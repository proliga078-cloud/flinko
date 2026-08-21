-- 1) is_demo nao e sensivel e e usado para filtrar as listagens publicas de
--    profissionais (paginas de categoria, homepage). Ficou de fora do
--    conjunto de colunas publicas na primeira ronda por lapso, e isso
--    partiu essas paginas para visitantes anonimos ("permission denied for
--    table profiles"). Corrigido aqui.
grant select (is_demo) on public.profiles to anon, authenticated;

-- 2) approved/suspended nao sao secretas (sao flags de moderacao) e sao
--    precisas para a funcionalidade de referrals no dashboard (procurar
--    outros profissionais ativos a quem recomendar). Ficam visiveis para
--    quem tem sessao, mas continuam fora do conjunto publico anonimo.
grant select (approved, suspended) on public.profiles to authenticated;

-- 3) O verdadeiro problema reportado: authenticated (qualquer conta com
--    sessao, nao so anon) ainda conseguia ler as colunas sensiveis de
--    OUTROS utilizadores (stripe_customer_id, credits, is_admin, etc.).
--    Aplica-se a mesma restricao que ja tinha sido aplicada a anon na
--    primeira ronda. O proprio utilizador continua a conseguir ler estes
--    campos sobre si mesmo atraves de get_my_profile() (SECURITY DEFINER,
--    ja existente, bypassa estas grants).
revoke select (
  account_type,
  credits,
  is_admin,
  notify_digest,
  notify_email,
  payment_methods,
  plan_expires_at,
  referral_code,
  stripe_customer_id,
  stripe_subscription_id,
  updated_at,
  user_id
) on public.profiles from authenticated;

-- 4) O painel de administracao precisa de ler TODAS as colunas de TODOS os
--    perfis (para gerir planos, creditos, aprovacoes, etc.). Como isso deixa
--    de ser possivel por leitura direta da tabela, criamos uma funcao
--    SECURITY DEFINER dedicada que verifica is_admin() antes de devolver
--    os dados — o mesmo padrao ja usado por get_my_profile() e is_admin().
create or replace function public.admin_list_profiles()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  return query select * from public.profiles;
end;
$$;

revoke all on function public.admin_list_profiles() from public;
grant execute on function public.admin_list_profiles() to authenticated;

-- 5) O signup com codigo de referral (auth.html) precisa de descobrir a
--    quem pertence um referral_code para atribuir o bonus — sem dar acesso
--    de leitura a essa coluna a toda a gente. Funcao dedicada, devolve so
--    o id de quem convidou (nunca mais nenhum dado).
create or replace function public.resolve_referral_code(code text)
returns uuid
language sql
stable
security definer
set search_path = 'public'
as $$
  select id from public.profiles where referral_code = code limit 1
$$;

revoke all on function public.resolve_referral_code(text) from public;
grant execute on function public.resolve_referral_code(text) to anon, authenticated;
