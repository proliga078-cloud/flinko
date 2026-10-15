// Valida a migração privacidade_perfis_avaliacoes num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20261015120000_privacidade_perfis_avaliacoes.sql', import.meta.url)

const A = '11111111-1111-1111-1111-111111111111' // profissional com convite
const B = '22222222-2222-2222-2222-222222222222' // conta nova
const VELHA = '33333333-3333-3333-3333-333333333333' // conta com 2 dias
const ADM = '44444444-4444-4444-4444-444444444444'

async function preparar() {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  // Estado da produção antes da migração: GRANT ALL nas tabelas, políticas que
  // leem profiles.is_admin e generate_referral_code() sem SECURITY DEFINER.
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table auth.users(id uuid primary key, created_at timestamptz default now());
  create table public.profiles(
    id uuid primary key, user_id uuid, name text, bio text, plan text default 'free', plan_expires_at timestamptz,
    approved boolean default true, suspended boolean default false, is_admin boolean default false, admin_role text,
    stripe_customer_id text, stripe_subscription_id text, notify_email boolean default true, notify_digest boolean default true,
    referral_code text, credits numeric default 0, ai_profile_builder_unlocked boolean default false,
    ai_profile_builder_paid_at timestamptz, verified boolean default false);
  create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
  create function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_admin and coalesce(admin_role, 'owner') = 'owner' from public.profiles where id = auth.uid()), false) $$;
  create function public.generate_referral_code() returns trigger language plpgsql set search_path = public, pg_temp as $$
  declare candidate text;
  begin
    if new.referral_code is not null then return new; end if;
    loop
      candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      perform 1 from profiles where referral_code = candidate;
      if not found then new.referral_code := candidate; return new; end if;
    end loop;
  end $$;
  create function public.protect_privileged_profile_columns() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger protect_privileged_profile_columns_trg before insert or update on public.profiles for each row execute function protect_privileged_profile_columns();
  create trigger trg_generate_referral_code before insert on public.profiles for each row execute function generate_referral_code();
  alter table public.profiles enable row level security;
  create policy profiles_select on public.profiles for select using ((approved is not false and coalesce(suspended, false) = false) or auth.uid() = user_id or is_admin());
  create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);
  create policy profiles_update on public.profiles for update using (is_admin() or auth.uid() = id) with check (is_admin() or auth.uid() = id);

  create table public.reviews(id uuid primary key default gen_random_uuid(), professional_id uuid references public.profiles(id),
    reviewer_name text, reviewer_email text, rating int, comment text, created_at timestamptz default now(),
    client_id uuid, source text, job_id uuid);
  alter table public.reviews enable row level security;
  create policy reviews_select on public.reviews for select using (true);
  create policy reviews_insert on public.reviews for insert with check (rating between 1 and 5 and reviewer_email is not null
    and exists (select 1 from public.profiles p where p.id = reviews.professional_id));

  create table public.signup_referrals(id uuid primary key default gen_random_uuid(), referrer_id uuid references public.profiles(id),
    referred_id uuid unique references public.profiles(id), created_at timestamptz default now(), check (referrer_id <> referred_id));
  alter table public.signup_referrals enable row level security;
  create policy signup_referrals_select on public.signup_referrals for select using (is_admin() or auth.uid() in (referred_id, referrer_id));

  create table public.profile_private(profile_id uuid primary key, phone text);
  alter table public.profile_private enable row level security;
  create policy profile_private_select_own_or_admin on public.profile_private for select
    using (auth.uid() = profile_id or exists (select 1 from profiles ap where ap.id = auth.uid() and ap.is_admin = true));
  create policy profile_private_update_own_or_admin on public.profile_private for update
    using (auth.uid() = profile_id or exists (select 1 from profiles ap where ap.id = auth.uid() and ap.is_admin = true));
  create table public.site_visits(id uuid primary key default gen_random_uuid(), path text);
  alter table public.site_visits enable row level security;
  create policy "admin can read visits" on public.site_visits for select to authenticated
    using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  await db.exec(`
  insert into auth.users(id, created_at) values ('${A}', now() - interval '30 days'), ('${B}', now()), ('${VELHA}', now() - interval '2 days'), ('${ADM}', now() - interval '60 days');
  select set_config('app.trusted_profile_write', 'on', false);
  insert into public.profiles(id, user_id, name, stripe_customer_id, credits, referral_code) values ('${A}', '${A}', 'Ana', 'cus_A', 5, 'ANA123');
  insert into public.profiles(id, user_id, name, is_admin, admin_role) values ('${ADM}', '${ADM}', 'Admin', true, 'owner');
  insert into public.profiles(id, user_id, name) values ('${VELHA}', '${VELHA}', 'Velha');
  select set_config('app.trusted_profile_write', '', false);
  insert into public.profile_private values ('${A}', '910000000');
  insert into public.site_visits(path) values ('/');
  insert into public.reviews(professional_id, reviewer_name, reviewer_email, rating) values ('${A}', 'Rui', 'rui@exemplo.pt', 5);
  `)

  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      const role = uid ? 'authenticated' : 'anon'
      await db.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', true); select set_config('request.jwt.claim.role', '${role}', true);`)
      const r = await q(sql, params); await db.exec('commit'); return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  return { q, as }
}

test('privacidade: colunas privadas de profiles e email de quem avalia deixam de ser legíveis', async () => {
  const { as } = await preparar()
  for (const quem of [null, B]) {
    for (const col of ['stripe_customer_id', 'credits', 'referral_code', 'is_admin', 'notify_email', 'plan_expires_at', 'ai_profile_builder_paid_at']) {
      await assert.rejects(() => as(quem, `select ${col} from public.profiles`), /permission denied/, col)
    }
    await assert.rejects(() => as(quem, 'select * from public.profiles'), /permission denied/)
    assert.deepEqual(await as(quem, `select name, plan, approved, suspended, ai_profile_builder_unlocked from public.profiles where id = $1`, [A]),
      [{ name: 'Ana', plan: 'free', approved: true, suspended: false, ai_profile_builder_unlocked: false }])

    await assert.rejects(() => as(quem, 'select reviewer_email from public.reviews'), /permission denied/)
    await assert.rejects(() => as(quem, 'select * from public.reviews'), /permission denied/)
    assert.equal((await as(quem, 'select id, reviewer_name, rating, comment, client_id, source from public.reviews')).length, 1)
    await assert.rejects(() => as(quem, 'truncate public.profiles'), /permission denied/)
  }
  // Publicar uma avaliação continua a funcionar sem sessão (o email é escrito, não lido).
  await as(null, `insert into public.reviews(professional_id, reviewer_name, reviewer_email, rating) values ($1, 'Rita', 'rita@exemplo.pt', 4)`, [A])
})

test('privacidade: o dono e o painel continuam a ver o que precisam', async () => {
  const { as } = await preparar()
  // Criar perfil (gera o código de convite) e ler o próprio telefone continua a funcionar.
  await as(B, `insert into public.profiles(id, user_id, name, credits, referral_code, ai_profile_builder_unlocked) values ($1, $1, 'Bruno', 999, 'MEU', true)`, [B])
  assert.equal((await as(A, 'select phone from public.profile_private')).length, 1)
  assert.equal((await as(B, 'select phone from public.profile_private')).length, 0)
  assert.equal((await as(ADM, 'select phone from public.profile_private')).length, 1)
  assert.equal((await as(ADM, 'select path from public.site_visits')).length, 1)
  assert.equal((await as(A, 'select path from public.site_visits')).length, 0)

  // O painel lê as colunas privadas por admin_profiles_private(); mais ninguém.
  const priv = await as(ADM, 'select id, credits, is_admin from public.admin_profiles_private() order by id')
  assert.equal(priv.find(p => p.id === A).credits, '5')
  await assert.rejects(() => as(A, 'select * from public.admin_profiles_private()'), /administrador/)
  await assert.rejects(() => as(null, 'select * from public.admin_profiles_private()'), /permission denied/)

  // O dono não muda o Construtor IA nem o código de convite; o resto sim.
  await as(A, `update public.profiles set bio = 'Olá', ai_profile_builder_unlocked = true, ai_profile_builder_paid_at = now(), referral_code = 'NOVO' where id = $1`, [A])
  const [a] = await as(ADM, 'select p.bio, p.ai_profile_builder_unlocked, x.ai_profile_builder_paid_at from public.profiles p join public.admin_profiles_private() x using (id) where p.id = $1', [A])
  assert.deepEqual(a, { bio: 'Olá', ai_profile_builder_unlocked: false, ai_profile_builder_paid_at: null })
  const [b] = await as(ADM, 'select p.ai_profile_builder_unlocked, x.credits from public.profiles p join public.admin_profiles_private() x using (id) where p.id = $1', [B])
  assert.deepEqual(b, { ai_profile_builder_unlocked: false, credits: '0' })
})

test('convites: só para a própria conta, criada há menos de 24h', async () => {
  const { as } = await preparar()
  await as(B, `insert into public.profiles(id, user_id, name) values ($1, $1, 'Bruno')`, [B])
  // Sem sessão já não se pode chamar.
  await assert.rejects(() => as(null, `select public.apply_signup_referral('ANA123', $1)`, [B]), /permission denied/)
  // Uma conta antiga não ganha convite, mesmo com o código certo.
  await as(VELHA, `select public.apply_signup_referral('ANA123', $1)`, [VELHA])
  // A conta nova tenta registar o convite noutra pessoa: fica registado só para si.
  await as(B, `select public.apply_signup_referral('ana123', $1)`, [VELHA])
  await as(B, `select public.apply_signup_referral('ANA123', $1)`, [B]) // repetir não duplica
  const rows = await as(ADM, 'select referrer_id, referred_id from public.signup_referrals')
  assert.deepEqual(rows, [{ referrer_id: A, referred_id: B }])
})
