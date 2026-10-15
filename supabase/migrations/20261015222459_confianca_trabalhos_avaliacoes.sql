-- Confiança: trabalhos, avaliações e selo de resposta (out/2026).
--
--   1. Um profissional só associa um trabalho a um cliente que o contactou
--      (mandou-lhe mensagem, ou recebeu proposta dele num pedido). Antes podia
--      pôr o id de qualquer pessoa, marcar "pago" e pedir-lhe uma avaliação
--      "verificada" por email, ganhando créditos.
--   2. Avaliações escritas no perfil: só com sessão, em nome próprio, a quem
--      se contactou, uma por profissional e sempre com origem "perfil" (as de
--      trabalho e de convite continuam a vir de submit_review_invite).
--   3. O tempo de resposta (selo "responde em X min") só muda pelo cálculo
--      do servidor; o dono deixava de o poder escrever à mão.
--   4. Funções de leitura para contagens que as páginas não conseguiam fazer
--      sozinhas: propostas por pedido e resumo das conversas.

-- Contacto real entre cliente e profissional ---------------------------------
create or replace function public.houve_contacto(p_cliente uuid, p_profissional uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.conversations c join public.messages m on m.conversation_id = c.id
    where c.client_id = p_cliente and c.professional_id = p_profissional and m.sender_id = p_cliente
  ) or exists (
    select 1 from public.requests r join public.request_offers o on o.request_id = r.id
    where r.client_id = p_cliente and o.professional_id = p_profissional
  );
$$;
revoke all on function public.houve_contacto(uuid, uuid) from public, anon, authenticated;

-- 1. Trabalhos -----------------------------------------------------------------
-- Só pedidos diretos pela API (current_user authenticated/anon); funções do
-- servidor e o painel de admin não passam por aqui.
create or replace function public.trabalho_com_cliente_real()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.client_id is null or public.is_admin() then return new; end if;
  if tg_op = 'UPDATE' and new.client_id is not distinct from old.client_id then return new; end if;
  if not public.houve_contacto(new.client_id, new.professional_id) then
    raise exception 'Só podes associar um trabalho a um cliente que te contactou na Flinko.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trabalho_com_cliente_real_trg on public.jobs;
create trigger trabalho_com_cliente_real_trg before insert or update of client_id on public.jobs
  for each row when (current_user in ('authenticated', 'anon'))
  execute function public.trabalho_com_cliente_real();

-- 2. Avaliações escritas no perfil --------------------------------------------
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert to authenticated with check (
  rating between 1 and 5
  and reviewer_name is not null and length(trim(reviewer_name)) > 0
  and reviewer_email is not null and reviewer_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  and client_id = (select auth.uid())
  and client_id <> professional_id
  and source = 'perfil' and job_id is null
  and exists (select 1 from public.profiles p where p.id = reviews.professional_id)
);

create or replace function public.avaliacao_de_quem_contactou()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.houve_contacto(new.client_id, new.professional_id) then
    raise exception 'Só podes avaliar um profissional com quem falaste na Flinko.' using errcode = '42501';
  end if;
  if exists (select 1 from public.reviews r where r.professional_id = new.professional_id and r.client_id = new.client_id) then
    raise exception 'Já avaliaste este profissional.' using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists avaliacao_de_quem_contactou_trg on public.reviews;
create trigger avaliacao_de_quem_contactou_trg before insert on public.reviews
  for each row when (current_user in ('authenticated', 'anon'))
  execute function public.avaliacao_de_quem_contactou();

-- 3. Selo de tempo de resposta ------------------------------------------------
-- Igual à versão anterior; só marca a escrita como do servidor para o
-- protect_privileged_profile_columns a deixar passar.
create or replace function public.recompute_response_time_internal(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_avg numeric;
  v_count integer;
begin
  with first_client_msg as (
    select c.id as conversation_id,
           c.professional_id,
           min(m.created_at) as client_at
    from conversations c
    join messages m on m.conversation_id = c.id
    where c.professional_id = p_professional_id
      and m.sender_id <> c.professional_id
    group by c.id, c.professional_id
  ),
  first_pro_reply as (
    select f.conversation_id,
           f.client_at,
           min(m.created_at) as pro_at
    from first_client_msg f
    join messages m on m.conversation_id = f.conversation_id
    where m.sender_id = f.professional_id
      and m.created_at > f.client_at
    group by f.conversation_id, f.client_at
  )
  select avg(extract(epoch from (pro_at - client_at)) / 60.0)::numeric,
         count(*)::integer
    into v_avg, v_count
  from first_pro_reply;

  perform set_config('app.trusted_profile_write', 'on', true);
  update profiles
     set avg_response_minutes = case when coalesce(v_count,0) > 0 then round(v_avg, 1) else null end,
         response_sample_count = coalesce(v_count, 0)
   where id = p_professional_id;
  perform set_config('app.trusted_profile_write', '', true);
end;
$$;

-- Igual à versão de 20261015193859, mais o tempo de resposta.
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
    new.avg_response_minutes := null;
    new.response_sample_count := 0;
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
    new.avg_response_minutes := old.avg_response_minutes;
    new.response_sample_count := old.response_sample_count;
    new.id := old.id;
    new.user_id := old.user_id;
  end if;

  return new;
end;
$$;

-- 4. Contagens para as páginas ------------------------------------------------
-- Número de propostas por pedido (a política de request_offers só mostra cada
-- proposta ao seu autor e ao dono do pedido, por isso a lista contava 0 ou 1).
create or replace function public.contagem_propostas(p_ids uuid[])
returns table (request_id uuid, n integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.request_id, count(*)::integer
  from public.request_offers o
  where o.request_id = any(p_ids)
  group by o.request_id;
$$;
revoke all on function public.contagem_propostas(uuid[]) from public;
grant execute on function public.contagem_propostas(uuid[]) to anon, authenticated;

-- Resumo das minhas conversas: total de mensagens, não lidas e a última
-- (a página lia as mensagens todas e a API corta em 1000).
create or replace function public.resumo_conversas()
returns table (conversation_id uuid, total integer, unread integer, last_sender uuid, last_read boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id,
         count(m.id)::integer,
         (count(m.id) filter (where m.sender_id <> auth.uid() and not coalesce(m.read, false)))::integer,
         (array_agg(m.sender_id order by m.created_at desc))[1],
         (array_agg(m.read order by m.created_at desc))[1]
  from public.conversations c
  join public.messages m on m.conversation_id = c.id
  where c.professional_id = auth.uid() or c.client_id = auth.uid()
  group by c.id;
$$;
revoke all on function public.resumo_conversas() from public, anon;
grant execute on function public.resumo_conversas() to authenticated;
