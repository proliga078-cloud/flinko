-- Avaliações fáceis: links de avaliação de uso único.
--
-- Um link (review_invites.token) abre avaliar.html com as estrelas prontas:
-- o cliente só confirma. Há dois tipos:
--   trabalho: criado pelo servidor quando um trabalho fica pago (função
--             review-request), ligado ao trabalho e ao cliente;
--   convite:  criado pelo profissional para clientes antigos (fora da
--             Flinko). Limitado a 30 por mês e marcado como tal no perfil.
-- Cada avaliação guarda a origem (perfil / trabalho / convite).

alter table public.reviews add column if not exists source text not null default 'perfil';
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews add constraint reviews_source_check check (source in ('perfil', 'trabalho', 'convite'));
alter table public.reviews add column if not exists job_id uuid references public.jobs(id) on delete set null;

create table if not exists public.review_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text check (client_name is null or length(client_name) <= 80),
  job_id uuid references public.jobs(id) on delete set null,
  source text not null default 'convite' check (source in ('trabalho', 'convite')),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  review_id uuid references public.reviews(id) on delete set null
);
create index if not exists review_invites_pro_idx on public.review_invites (professional_id, created_at desc);
alter table public.review_invites enable row level security;

-- O profissional vê e cria os seus convites (só do tipo "convite"; os de
-- trabalho vêm do servidor).
drop policy if exists review_invites_select on public.review_invites;
create policy review_invites_select on public.review_invites
  for select to authenticated using (professional_id = auth.uid());
drop policy if exists review_invites_insert on public.review_invites;
create policy review_invites_insert on public.review_invites
  for insert to authenticated with check (professional_id = auth.uid() and source = 'convite' and client_id is null and job_id is null);

create or replace function public.limit_review_invites()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.source = 'convite' and (
    select count(*) from public.review_invites
    where professional_id = new.professional_id and source = 'convite' and created_at > now() - interval '30 days'
  ) >= 30 then
    raise exception 'Chegaste ao limite de 30 convites por mês.';
  end if;
  new.used_at := null;
  new.review_id := null;
  return new;
end;
$$;
revoke all on function public.limit_review_invites() from public, anon, authenticated;
drop trigger if exists limit_review_invites_trg on public.review_invites;
create trigger limit_review_invites_trg before insert on public.review_invites
  for each row execute function public.limit_review_invites();

-- O que a página avaliar.html mostra (sem sessão): quem é o profissional.
create or replace function public.review_invite_info(p_token text)
returns table (professional_id uuid, pro_name text, pro_photo text, pro_category text, pro_slug text, client_name text, used boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.name, p.photo_url, p.category, p.slug, i.client_name, i.used_at is not null
  from public.review_invites i join public.profiles p on p.id = i.professional_id
  where i.token = p_token
$$;
revoke all on function public.review_invite_info(text) from public;
grant execute on function public.review_invite_info(text) to anon, authenticated;

-- Publica a avaliação de um link (uma só vez).
create or replace function public.submit_review_invite(p_token text, p_rating integer, p_comment text, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  i public.review_invites;
  v_email text;
  v_name text;
  v_id uuid;
begin
  select * into i from public.review_invites where token = p_token for update;
  if not found then raise exception 'Este link de avaliação não existe.'; end if;
  if i.used_at is not null then raise exception 'Este link já foi usado. Obrigado pela avaliação!'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Escolhe de 1 a 5 estrelas.'; end if;
  if auth.uid() is not null and auth.uid() = i.professional_id then raise exception 'Não podes avaliar o teu próprio trabalho.'; end if;
  v_name := left(btrim(coalesce(nullif(btrim(p_name), ''), i.client_name, '')), 80);
  if v_name = '' then raise exception 'Escreve o teu nome.'; end if;
  if i.client_id is not null then
    select u.email into v_email from auth.users u where u.id = i.client_id;
  end if;
  v_email := coalesce(v_email, 'convite+' || left(i.token, 12) || '@flinko.pt');
  insert into public.reviews (professional_id, client_id, reviewer_name, reviewer_email, rating, comment, source, job_id)
  values (i.professional_id, i.client_id, v_name, v_email, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 2000), ''), i.source, i.job_id)
  returning id into v_id;
  update public.review_invites set used_at = now(), review_id = v_id where token = i.token;
  return v_id;
end;
$$;
revoke all on function public.submit_review_invite(text, integer, text, text) from public;
grant execute on function public.submit_review_invite(text, integer, text, text) to anon, authenticated;
