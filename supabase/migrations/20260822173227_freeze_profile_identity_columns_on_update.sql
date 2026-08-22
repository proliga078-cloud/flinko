-- Auditoria total (ago/2026): as politicas RLS de UPDATE em profiles
-- (profiles_update: auth.uid()=id; owner_update_profiles: auth.uid()=user_id)
-- nao tem with_check, por isso um utilizador dono de uma linha (por
-- qualquer uma das duas colunas) podia alterar id/user_id da propria
-- linha para o uid de OUTRO utilizador. Isto e bloqueado na pratica por
-- profiles_id_fkey (id tem de existir em auth.users) e por profiles_pkey/
-- profiles_user_id_unique (nao pode colidir com uma linha ja existente),
-- mas continua a abrir uma janela real: um utilizador podia "roubar" o
-- id de uma conta auth.users que ainda nao tem perfil criado (signup
-- abandonado a meio), fazendo com que o RPC get_my_profile() dessa
-- vitima encontre depois a linha do atacante.
--
-- Verificado em todo o codigo (dashboard-*.js, admin.html, stripe-webhook.js,
-- get_my_profile RPC) que nenhum fluxo legitimo alguma vez muda id ou
-- user_id depois da criacao da linha -- sao sempre iguais ao auth.uid() de
-- quem criou o perfil. Por isso a correcao mais segura e mais alinhada
-- com o padrao ja existente no codigo (protect_privileged_profile_columns)
-- e: bloquear totalmente id/user_id fora de UPDATEs feitos por
-- service_role/admin, e forcar user_id=id em qualquer INSERT feito por
-- um utilizador normal -- eliminando por completo a superficie de
-- spoofing sem tocar nas politicas RLS em si.
--
-- Verificado em producao (ago/2026) antes desta migracao: nenhuma conta
-- tem is_admin=true fora das 3 esperadas (conta de sistema "Equipa
-- Proliga" + 2 admins reais), e so 1 linha legacy (a de sistema, sem
-- user_id) tem id != user_id -- nao ha sinal de exploracao ja ocorrida.

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if current_setting('app.trusted_profile_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.approved := true;
    new.verified := false;
    new.suspended := false;
    new.credits := 0;
    new.plan := 'free';
    new.plan_expires_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    -- id ja tem de ser auth.uid() (garantido pela politica profiles_insert
    -- OU owner_insert_profiles) -- forcar user_id a seguir sempre id fecha
    -- o caso em que alguem tentava satisfazer so a politica de user_id
    -- com um id arbitrario (ex: o de outra conta auth.users ja existente).
    new.user_id := new.id;
  elsif tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    new.approved := old.approved;
    new.verified := old.verified;
    new.suspended := old.suspended;
    new.credits := old.credits;
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    -- id/user_id nunca devem mudar depois da criacao da linha -- sao a
    -- ancora de identidade do perfil (id tem FK para auth.users e e o
    -- que profiles_update/profiles_select usam; user_id e o que
    -- owner_update_profiles e todas as sub-queries de RLS de outras
    -- tabelas usam). Sem isto, um dono de linha podia reatribuir a sua
    -- propria linha a outro auth.uid().
    new.id := old.id;
    new.user_id := old.user_id;
  end if;

  return new;
end;
$function$;

-- O trigger antigo (protect_plan_columns_trigger) protegia so
-- plan/stripe_customer_id/stripe_subscription_id e esta agora totalmente
-- coberto (e ultrapassado) pelo trigger acima -- manter os dois so
-- duplicava trabalho a cada UPDATE e era um risco de documentacao (nao
-- estava em nenhum ficheiro de migracao do repositorio, achado pela
-- auditoria total de ago/2026).
drop trigger if exists protect_plan_columns_trigger on public.profiles;
drop function if exists public.protect_plan_columns();
