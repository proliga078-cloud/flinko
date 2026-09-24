-- Painel de gestão (admin.html): o que faltava para ser uma ferramenta de
-- gestão a sério.
--
--  1. Tabelas privadas do painel (admin_tasks, admin_crm, admin_settings,
--     admin_items). Já existiam em produção, criadas à mão no SQL Editor; ficam
--     aqui para o repositório reproduzir a base de dados.
--  2. Níveis de acesso: profiles.admin_role ('owner' ou 'support'). Quem é de
--     apoio vê tudo e trata verificações, RGPD, moderação e apoio, mas não mexe
--     em dinheiro (planos, créditos, Stripe) nem em permissões.
--  3. admin_audit: registo de ações que ninguém consegue alterar nem apagar pela
--     API. É escrito por triggers na própria base de dados, por isso apanha as
--     ações feitas em qualquer página (admin.html, admin-classico.html) e não
--     depende de o browser se lembrar de registar.
--  4. Funções para ações compostas (aprovar verificação e marcar o perfil de
--     uma só vez), estatísticas de visitas agregadas no servidor e gestão da
--     equipa.
--  5. support_tickets: pedidos de apoio e denúncias que chegam sozinhos pelo
--     formulário de contacto e pelo botão "Denunciar" dos perfis.

-- 1. TABELAS PRIVADAS DO PAINEL ---------------------------------------------
create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text default 'media',
  due_date date,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_crm (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  stage text not null default 'novo',
  notes text default '',
  next_contact date,
  updated_at timestamptz default now()
);
create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null
);
create table if not exists public.admin_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_items_kind_idx on public.admin_items(kind);
alter table public.admin_tasks enable row level security;
alter table public.admin_crm enable row level security;
alter table public.admin_settings enable row level security;
alter table public.admin_items enable row level security;
drop policy if exists admin_tasks_all on public.admin_tasks;
drop policy if exists admin_crm_all on public.admin_crm;
drop policy if exists admin_settings_all on public.admin_settings;
drop policy if exists admin_items_all on public.admin_items;
create policy admin_tasks_all on public.admin_tasks for all using (public.is_admin()) with check (public.is_admin());
create policy admin_crm_all on public.admin_crm for all using (public.is_admin()) with check (public.is_admin());
create policy admin_settings_all on public.admin_settings for all using (public.is_admin()) with check (public.is_admin());
create policy admin_items_all on public.admin_items for all using (public.is_admin()) with check (public.is_admin());

-- 2. NÍVEIS DE ACESSO --------------------------------------------------------
alter table public.profiles add column if not exists admin_role text;
alter table public.profiles drop constraint if exists profiles_admin_role_check;
alter table public.profiles add constraint profiles_admin_role_check check (admin_role is null or admin_role in ('owner','support'));

-- Os administradores que já existem são donos (têm acesso a tudo, como hoje).
update public.profiles set admin_role = 'owner' where is_admin and admin_role is null;

-- Dono = administrador sem papel definido (compatibilidade) ou com 'owner'.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin and coalesce(admin_role, 'owner') = 'owner' from public.profiles where user_id = auth.uid()), false)
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Mesmo trigger de antes, com duas diferenças: admin_role passa a ser uma
-- coluna protegida, e um administrador de apoio não consegue mexer em
-- dinheiro nem em permissões (mesmo que chame a API diretamente).
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
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
    -- administrador de apoio: pode verificar, suspender e editar o perfil,
    -- mas não planos, créditos, Stripe nem permissões.
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
    new.id := old.id;
    new.user_id := old.user_id;
  end if;

  return new;
end;
$$;

-- 3. REGISTO DE AÇÕES (só de leitura pela API) -------------------------------
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  summary text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on public.admin_audit(at desc);
create index if not exists admin_audit_target_idx on public.admin_audit(target_type, target_id);
alter table public.admin_audit enable row level security;
drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit for select using (public.is_admin());
-- Sem políticas de insert/update/delete: pela API ninguém escreve nem apaga.
-- As linhas entram pelos triggers e funções abaixo (security definer) e pelas
-- funções Netlify (service role).
revoke insert, update, delete, truncate on public.admin_audit from anon, authenticated;

create or replace function public._audit(p_action text, p_target_type text, p_target_id text, p_summary text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.admin_audit(actor_id, actor_email, action, target_type, target_id, summary, details)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_target_type, p_target_id, p_summary, coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke execute on function public._audit(text, text, text, text, jsonb) from public, anon, authenticated;

-- Para ações que só existem no painel (ex.: enviar um email a partir do CRM).
create or replace function public.admin_log(p_action text, p_target_type text default null, p_target_id text default null, p_summary text default null, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Sem permissões de administrador.' using errcode = '42501'; end if;
  perform public._audit(left(p_action, 60), p_target_type, p_target_id, left(p_summary, 500), p_details);
end;
$$;
revoke execute on function public.admin_log(text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_log(text, text, text, text, jsonb) to authenticated;

-- Triggers: só registam quando quem faz a alteração é um administrador com
-- sessão (auth.uid() preenchido). Alterações do próprio utilizador ou das
-- funções de servidor (webhook do Stripe, etc.) não entram aqui; as funções
-- Netlify de admin registam-se a si próprias.
create or replace function public.audit_profiles_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch jsonb := '{}'::jsonb;
  col text;
  o jsonb;
  n jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public._audit('perfil_apagado', 'profile', old.id::text, 'Conta apagada: ' || coalesce(old.name, '—'),
      jsonb_build_object('name', old.name, 'account_type', old.account_type, 'plan', old.plan));
    return old;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  foreach col in array array['verified','suspended','approved','plan','plan_expires_at','is_admin','admin_role','credits'] loop
    if o -> col is distinct from n -> col then
      ch := ch || jsonb_build_object(col, jsonb_build_array(o -> col, n -> col));
    end if;
  end loop;
  if ch <> '{}'::jsonb then
    perform public._audit('perfil_alterado', 'profile', new.id::text, coalesce(new.name, '—') || ': ' || (select string_agg(k, ', ') from jsonb_object_keys(ch) k), jsonb_build_object('name', new.name, 'changes', ch));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_profiles_admin_trg on public.profiles;
create trigger audit_profiles_admin_trg after update or delete on public.profiles
  for each row execute function public.audit_profiles_admin();

create or replace function public.audit_reviews_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() or auth.uid() is not distinct from old.client_id then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public._audit('avaliacao_apagada', 'review', old.id::text,
      'Avaliação de ' || coalesce(old.reviewer_name, '—') || ' (' || old.rating || '★) a ' || coalesce((select name from public.profiles where id = old.professional_id), '—') || ' apagada',
      jsonb_build_object('review', to_jsonb(old) - 'reviewer_email'));
    return old;
  end if;
  perform public._audit('avaliacao_alterada', 'review', new.id::text, 'Avaliação de ' || coalesce(new.reviewer_name, '—') || ' alterada',
    jsonb_build_object('antes', to_jsonb(old) - 'reviewer_email', 'depois', to_jsonb(new) - 'reviewer_email'));
  return new;
end;
$$;
drop trigger if exists audit_reviews_admin_trg on public.reviews;
create trigger audit_reviews_admin_trg after update or delete on public.reviews
  for each row execute function public.audit_reviews_admin();

create or replace function public.audit_requests_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() or auth.uid() is not distinct from old.client_id then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public._audit('pedido_apagado', 'request', old.id::text, 'Pedido apagado: ' || coalesce(old.title, '—'),
      jsonb_build_object('title', old.title, 'category', old.category, 'location', old.location, 'client_id', old.client_id, 'description', left(old.description, 500)));
    return old;
  end if;
  if old.status is distinct from new.status then
    perform public._audit('pedido_estado', 'request', new.id::text, 'Pedido “' || coalesce(new.title, '—') || '”: ' || coalesce(old.status, '—') || ' → ' || coalesce(new.status, '—'),
      jsonb_build_object('de', old.status, 'para', new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_requests_admin_trg on public.requests;
create trigger audit_requests_admin_trg after update or delete on public.requests
  for each row execute function public.audit_requests_admin();

create or replace function public.audit_status_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nm text;
begin
  if auth.uid() is null or not public.is_admin() or auth.uid() is not distinct from new.profile_id then return new; end if;
  if old.status is distinct from new.status then
    select name into nm from public.profiles where id = new.profile_id;
    perform public._audit(case tg_table_name when 'gdpr_requests' then 'rgpd_estado' else 'verificacao_estado' end,
      tg_table_name, new.id::text,
      (case tg_table_name when 'gdpr_requests' then 'Pedido RGPD de ' else 'Verificação de ' end) || coalesce(nm, '—') || ': ' || old.status || ' → ' || new.status,
      jsonb_build_object('profile_id', new.profile_id, 'name', nm, 'de', old.status, 'para', new.status, 'nota', new.admin_notes));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_gdpr_admin_trg on public.gdpr_requests;
create trigger audit_gdpr_admin_trg after update on public.gdpr_requests
  for each row execute function public.audit_status_admin();
drop trigger if exists audit_verification_admin_trg on public.verification_requests;
create trigger audit_verification_admin_trg after update on public.verification_requests
  for each row execute function public.audit_status_admin();

-- 4. AÇÕES COMPOSTAS ---------------------------------------------------------
-- Aprovar/rejeitar um pedido de verificação e, se aprovado, marcar o perfil
-- como verificado, numa só transação.
create or replace function public.admin_resolve_verification(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if not public.is_admin() then raise exception 'Sem permissões de administrador.' using errcode = '42501'; end if;
  update public.verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         resolved_at = now(), resolved_by = auth.uid(), admin_notes = nullif(trim(p_note), '')
   where id = p_request and status = 'pending'
   returning profile_id into pid;
  if pid is null then raise exception 'Pedido não encontrado ou já tratado.'; end if;
  if p_approve then update public.profiles set verified = true where id = pid; end if;
end;
$$;
revoke execute on function public.admin_resolve_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_resolve_verification(uuid, boolean, text) to authenticated;

-- Verificar/remover a verificação a partir da ficha do profissional. Ao
-- verificar, fecha também os pedidos pendentes desse perfil (senão o aviso
-- "pedidos de verificação por tratar" nunca desaparecia).
create or replace function public.admin_set_verified(p_profile uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Sem permissões de administrador.' using errcode = '42501'; end if;
  update public.profiles set verified = p_value where id = p_profile;
  if not found then raise exception 'Perfil não encontrado.'; end if;
  if p_value then
    update public.verification_requests
       set status = 'approved', resolved_at = now(), resolved_by = auth.uid(),
           admin_notes = coalesce(admin_notes, 'Aprovado na ficha do profissional')
     where profile_id = p_profile and status = 'pending';
  end if;
end;
$$;
revoke execute on function public.admin_set_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_verified(uuid, boolean) to authenticated;

-- Visitas agregadas no servidor: em vez de mandar cada visita para o browser
-- (e bater no limite de 1000 linhas da API), agrupa por dia, visitante,
-- utilizador, página e origem. Exclui as visitas de contas admin e demo.
create or replace function public.admin_visit_rows(p_days integer default 120)
returns table(day date, visitor_id text, user_id uuid, path text, ref_host text, n integer, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Sem permissões de administrador.' using errcode = '42501'; end if;
  return query
    select (v.created_at at time zone 'Europe/Lisbon')::date,
           v.visitor_id,
           v.user_id,
           v.path,
           coalesce(nullif(substring(lower(v.referrer) from '^[a-z]+://(?:www\.)?([^/:?#]+)'), ''), 'Direto'),
           count(*)::integer,
           max(v.created_at)
      from public.site_visits v
     where v.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 400))
       and not exists (select 1 from public.profiles p where p.id = v.user_id and (p.is_admin or p.is_demo))
     group by 1, 2, 3, 4, 5;
end;
$$;
revoke execute on function public.admin_visit_rows(integer) from public, anon;
grant execute on function public.admin_visit_rows(integer) to authenticated;

-- Equipa: quem é administrador e com que papel.
create or replace function public.admin_team()
returns table(profile_id uuid, name text, email text, admin_role text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Sem permissões de administrador.' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, coalesce(p.admin_role, 'owner')
      from public.profiles p left join auth.users u on u.id = p.user_id
     where p.is_admin
     order by 4, 2;
end;
$$;
revoke execute on function public.admin_team() from public, anon;
grant execute on function public.admin_team() to authenticated;

-- Dar ou tirar acesso ao painel. Só donos. Nunca deixa a equipa sem dono.
-- p_role: 'owner', 'support' ou 'none' (tira o acesso).
create or replace function public.admin_set_role(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  pid uuid;
  nm text;
begin
  if not public.is_owner() then raise exception 'Só um dono pode mudar permissões.' using errcode = '42501'; end if;
  if p_role not in ('owner','support','none') then raise exception 'Papel inválido.'; end if;
  select p.id, p.name into pid, nm from public.profiles p join auth.users u on u.id = p.user_id where lower(u.email) = lower(trim(p_email));
  if pid is null then raise exception 'Não há nenhuma conta Flinko com esse email.'; end if;
  if p_role <> 'owner' and (select count(*) from public.profiles where is_admin and coalesce(admin_role, 'owner') = 'owner' and id <> pid) = 0 then
    raise exception 'Tem de ficar pelo menos um dono.';
  end if;
  update public.profiles
     set is_admin = (p_role <> 'none'), admin_role = case when p_role = 'none' then null else p_role end
   where id = pid;
end;
$$;
revoke execute on function public.admin_set_role(text, text) from public, anon;
grant execute on function public.admin_set_role(text, text) to authenticated;

-- 5. PEDIDOS DE APOIO E DENÚNCIAS -------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'contacto' check (kind in ('contacto','denuncia')),
  name text not null check (length(trim(name)) between 1 and 120),
  email text not null check (length(email) <= 200 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  subject text not null check (length(trim(subject)) between 1 and 200),
  message text not null check (length(trim(message)) between 5 and 5000),
  target_profile_id uuid references public.profiles(id) on delete set null,
  reporter_id uuid,
  page text check (page is null or length(page) <= 300),
  status text not null default 'aberto' check (status in ('aberto','curso','resolvido')),
  priority text not null default 'media' check (priority in ('alta','media','baixa')),
  admin_notes text,
  resolved_at timestamptz
);
create index if not exists support_tickets_created_idx on public.support_tickets(created_at desc);
alter table public.support_tickets enable row level security;
drop policy if exists support_tickets_insert on public.support_tickets;
drop policy if exists support_tickets_admin on public.support_tickets;
-- Qualquer pessoa pode abrir um pedido, mas só no estado inicial e sem
-- campos de administração.
create policy support_tickets_insert on public.support_tickets for insert to anon, authenticated
  with check (status = 'aberto' and admin_notes is null and resolved_at is null and priority = 'media'
              and (reporter_id is null or reporter_id = auth.uid()));
create policy support_tickets_admin on public.support_tickets for all using (public.is_admin()) with check (public.is_admin());
grant insert on public.support_tickets to anon, authenticated;

-- Travão simples contra spam: no máximo 5 pedidos por email por hora.
create or replace function public.limit_support_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.support_tickets where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiados pedidos seguidos. Tenta de novo daqui a uma hora.';
  end if;
  new.email := lower(trim(new.email));
  new.reporter_id := auth.uid();
  return new;
end;
$$;
drop trigger if exists limit_support_tickets_trg on public.support_tickets;
create trigger limit_support_tickets_trg before insert on public.support_tickets
  for each row execute function public.limit_support_tickets();
