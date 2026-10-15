-- Privacidade e créditos (out/2026).
--
-- Na produção, anon e authenticated tinham SELECT na tabela profiles inteira
-- (concessão por omissão do Supabase): qualquer visitante lia o cliente da
-- Stripe, os créditos, os códigos de convite e quem é admin. Na tabela
-- reviews lia o email de quem avaliou. Aqui:
--   1. profiles: só as colunas públicas ficam legíveis. As privadas chegam ao
--      dono por get_my_profile() e ao painel por admin_profiles_private().
--      ATENÇÃO: uma coluna nova em profiles não fica legível sozinha; se for
--      pública, acrescenta-lhe um "grant select (coluna)" na migração dela.
--   2. reviews: o reviewer_email deixa de ser legível (continua a poder ser
--      escrito ao publicar uma avaliação).
--   3. As políticas que liam profiles.is_admin diretamente passam a usar
--      is_admin(), e generate_referral_code() passa a SECURITY DEFINER: sem
--      isso deixavam de conseguir ler as colunas privadas.
--   4. O dono deixa de poder mudar sozinho o Construtor IA (pago) e o código
--      de convite.
--   5. apply_signup_referral só regista o convite da própria conta, nas
--      primeiras 24h; antes aceitava o id de qualquer pessoa, mesmo sem sessão,
--      e cada chamada dava +10 créditos a quem convidou.

-- 1. profiles: SELECT só nas colunas públicas ------------------------------
revoke select on public.profiles from anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('is_admin', 'admin_role', 'stripe_customer_id', 'stripe_subscription_id',
      'plan_expires_at', 'notify_email', 'notify_digest', 'referral_code', 'credits', 'ai_profile_builder_paid_at');
  execute format('grant select (%s) on public.profiles to anon, authenticated', cols);
end $$;

-- 2. reviews: tudo menos o email de quem avaliou -----------------------------
revoke select on public.reviews from anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'reviews' and column_name <> 'reviewer_email';
  execute format('grant select (%s) on public.reviews to anon, authenticated', cols);
end $$;

-- A API nunca precisa destes; o TRUNCATE nem passa pelas políticas.
revoke truncate, trigger, references on public.profiles, public.reviews, public.signup_referrals from anon, authenticated;

-- 3. Quem lia profiles.is_admin diretamente ---------------------------------
alter function public.generate_referral_code() security definer;

drop policy if exists profile_private_select_own_or_admin on public.profile_private;
create policy profile_private_select_own_or_admin on public.profile_private for select
  using ((select auth.uid()) = profile_id or public.is_admin());
drop policy if exists profile_private_update_own_or_admin on public.profile_private;
create policy profile_private_update_own_or_admin on public.profile_private for update
  using ((select auth.uid()) = profile_id or public.is_admin());

drop policy if exists "admin can read visits" on public.site_visits;
create policy "admin can read visits" on public.site_visits for select to authenticated
  using (public.is_admin());

-- Colunas privadas para o painel de gestão (admin.html junta-as aos perfis).
create or replace function public.admin_profiles_private()
returns table (id uuid, is_admin boolean, admin_role text, plan_expires_at timestamptz,
  stripe_subscription_id text, ai_profile_builder_paid_at timestamptz, credits numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Sem permissões de administrador.' using errcode = '42501';
  end if;
  return query
  select p.id, p.is_admin, p.admin_role, p.plan_expires_at, p.stripe_subscription_id,
         p.ai_profile_builder_paid_at, p.credits
  from public.profiles p;
end;
$$;
revoke all on function public.admin_profiles_private() from public, anon;
grant execute on function public.admin_profiles_private() to authenticated;

-- 4. Colunas que o dono não pode mudar sozinho -------------------------------
-- Igual à versão anterior, mais o Construtor IA e o código de convite.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  if public.is_owner() then
    return new;
  end if;

  if current_setting('app.trusted_profile_write', true) = 'on' then
    return new;
  end if;

  if public.is_admin() then
    if tg_op = 'UPDATE' then
      new.is_admin := old.is_admin;
      new.admin_role := old.admin_role;
      new.credits := old.credits;
      new.plan := old.plan;
      new.plan_expires_at := old.plan_expires_at;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.id := old.id;
      new.user_id := old.user_id;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.admin_role := null;
    new.approved := true;
    new.verified := false;
    new.suspended := false;
    new.credits := 0;
    new.plan := 'free';
    new.plan_expires_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.ai_profile_builder_unlocked := false;
    new.ai_profile_builder_paid_at := null;
    new.referral_code := null; -- gerado a seguir por generate_referral_code()
    new.user_id := new.id;
  elsif tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    new.admin_role := old.admin_role;
    new.approved := old.approved;
    new.verified := old.verified;
    new.suspended := old.suspended;
    new.credits := old.credits;
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.ai_profile_builder_unlocked := old.ai_profile_builder_unlocked;
    new.ai_profile_builder_paid_at := old.ai_profile_builder_paid_at;
    new.referral_code := old.referral_code;
    new.id := old.id;
    new.user_id := old.user_id;
  end if;

  return new;
end;
$$;

-- 5. Convites: só para a própria conta acabada de criar ---------------------
-- Mantém a assinatura (o auth.html ainda manda new_user_id), mas ignora-o.
create or replace function public.apply_signup_referral(code text, new_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  ref_id uuid;
  criada timestamptz;
begin
  if me is null or code is null then return; end if;
  select created_at into criada from auth.users where id = me;
  if criada is null or criada < now() - interval '1 day' then return; end if;
  select id into ref_id from public.profiles where referral_code = upper(trim(code)) limit 1;
  if ref_id is null or ref_id = me then return; end if;
  insert into public.signup_referrals (referrer_id, referred_id) values (ref_id, me)
  on conflict (referred_id) do nothing;
end;
$$;
revoke all on function public.apply_signup_referral(text, uuid) from public, anon;
grant execute on function public.apply_signup_referral(text, uuid) to authenticated;
