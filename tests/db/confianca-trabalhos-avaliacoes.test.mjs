// Valida a migração confianca_trabalhos_avaliacoes num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20261016090000_confianca_trabalhos_avaliacoes.sql', import.meta.url)

const PRO = '11111111-1111-1111-1111-111111111111'
const CLI = '22222222-2222-2222-2222-222222222222' // falou com o PRO
const VITIMA = '33333333-3333-3333-3333-333333333333' // nunca falou com o PRO
const CLI2 = '44444444-4444-4444-4444-444444444444' // recebeu proposta do PRO num pedido
const CONV = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CONV_VITIMA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const REQ = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

async function preparar() {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table public.profiles(id uuid primary key, user_id uuid, name text, bio text, plan text default 'free', plan_expires_at timestamptz,
    approved boolean default true, suspended boolean default false, is_admin boolean default false, admin_role text,
    stripe_customer_id text, stripe_subscription_id text, referral_code text, credits numeric default 0,
    ai_profile_builder_unlocked boolean default false, ai_profile_builder_paid_at timestamptz, verified boolean default false,
    avg_response_minutes numeric, response_sample_count integer default 0);
  create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
  create function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$ select false $$;
  create function public.protect_privileged_profile_columns() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger protect_privileged_profile_columns_trg before insert or update on public.profiles for each row execute function protect_privileged_profile_columns();
  alter table public.profiles enable row level security;
  create policy profiles_select on public.profiles for select using (true);
  create policy profiles_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  create table public.conversations(id uuid primary key, professional_id uuid, client_id uuid);
  create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, read boolean default false, created_at timestamptz default now());
  create table public.requests(id uuid primary key, client_id uuid);
  create table public.request_offers(id uuid primary key default gen_random_uuid(), request_id uuid, professional_id uuid);
  alter table public.request_offers enable row level security;
  create policy ro_select on public.request_offers for select using (auth.uid() = professional_id or auth.uid() = (select client_id from public.requests where id = request_id));
  create table public.jobs(id uuid primary key default gen_random_uuid(), professional_id uuid, client_id uuid, status text);
  alter table public.jobs enable row level security;
  create policy jobs_select on public.jobs for select using (auth.uid() in (professional_id, client_id));
  create policy jobs_insert_own on public.jobs for insert with check (auth.uid() = professional_id);
  create policy jobs_update on public.jobs for update using (auth.uid() = professional_id) with check (auth.uid() = professional_id);
  create table public.reviews(id uuid primary key default gen_random_uuid(), professional_id uuid, reviewer_name text, reviewer_email text,
    rating int, comment text, created_at timestamptz default now(), client_id uuid, source text not null default 'perfil', job_id uuid);
  alter table public.reviews enable row level security;
  create policy reviews_select on public.reviews for select using (true);
  create policy reviews_insert on public.reviews for insert with check (true);
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente
  await db.exec(`
  insert into public.profiles(id, user_id, name) values ('${PRO}', '${PRO}', 'Rui'), ('${CLI}', '${CLI}', 'Ana'), ('${VITIMA}', '${VITIMA}', 'Vera'), ('${CLI2}', '${CLI2}', 'Rita');
  insert into public.conversations values ('${CONV}', '${PRO}', '${CLI}'), ('${CONV_VITIMA}', '${PRO}', '${VITIMA}');
  insert into public.messages(conversation_id, sender_id, created_at) values ('${CONV}', '${CLI}', now() - interval '30 minutes');
  insert into public.messages(conversation_id, sender_id, read, created_at) values ('${CONV}', '${PRO}', true, now() - interval '20 minutes');
  insert into public.messages(conversation_id, sender_id, created_at) values ('${CONV}', '${CLI}', now() - interval '1 minute');
  insert into public.messages(conversation_id, sender_id) values ('${CONV_VITIMA}', '${PRO}'); -- só o profissional escreveu
  insert into public.requests values ('${REQ}', '${CLI2}');
  insert into public.request_offers(request_id, professional_id) values ('${REQ}', '${PRO}');
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

test('trabalhos: só com clientes que contactaram o profissional', async () => {
  const { as } = await preparar()
  await as(PRO, `insert into public.jobs(professional_id, client_id, status) values ($1, $2, 'pago')`, [PRO, CLI])
  await as(PRO, `insert into public.jobs(professional_id, client_id, status) values ($1, $2, 'orcamento')`, [PRO, CLI2])
  await as(PRO, `insert into public.jobs(professional_id, client_id, status) values ($1, null, 'orcamento')`, [PRO])
  // Uma conversa aberta pelo próprio profissional não chega: a vítima nunca escreveu.
  await assert.rejects(() => as(PRO, `insert into public.jobs(professional_id, client_id, status) values ($1, $2, 'pago')`, [PRO, VITIMA]), /cliente que te contactou/)
  await assert.rejects(() => as(PRO, `update public.jobs set client_id = $1 where client_id is null`, [VITIMA]), /cliente que te contactou/)
  await as(PRO, `update public.jobs set status = 'pago' where client_id = $1`, [CLI2]) // mudar o estado continua a dar
})

test('avaliações no perfil: com sessão, em nome próprio, a quem se contactou, uma só vez', async () => {
  const { as, q } = await preparar()
  const avaliar = (uid, cliente, extra = '') => as(uid,
    `insert into public.reviews(professional_id, client_id, reviewer_name, reviewer_email, rating${extra ? ', source' : ''}) values ($1, $2, 'Ana', 'ana@exemplo.pt', 5${extra ? ", '" + extra + "'" : ''})`, [PRO, cliente])
  await assert.rejects(() => as(null, `insert into public.reviews(professional_id, reviewer_name, reviewer_email, rating) values ($1, 'X', 'x@exemplo.pt', 1)`, [PRO]), /row-level security|com quem falaste/)
  await assert.rejects(() => avaliar(VITIMA, VITIMA), /com quem falaste/)
  await assert.rejects(() => avaliar(CLI, CLI2), /row-level security/) // em nome de outra pessoa
  await assert.rejects(() => avaliar(CLI, CLI, 'trabalho'), /row-level security/) // não se faz passar por "verificada"
  await assert.rejects(() => avaliar(PRO, PRO), /com quem falaste|row-level security/)
  await avaliar(CLI, CLI)
  await avaliar(CLI2, CLI2)
  await assert.rejects(() => avaliar(CLI, CLI), /Já avaliaste/)
  // As do servidor (convites, trabalhos) não passam por estas regras.
  await q(`insert into public.reviews(professional_id, client_id, reviewer_name, reviewer_email, rating, source) values ($1, $2, 'Vera', 'v@exemplo.pt', 4, 'convite')`, [PRO, VITIMA])
  assert.equal((await q('select count(*)::int n from public.reviews'))[0].n, 3)
})

test('selo de resposta: só o servidor o calcula; contagens de propostas e conversas', async () => {
  const { as, q } = await preparar()
  // O dono muda a bio, mas não o selo (o trigger de proteção é o da migração).
  await as(PRO, `update public.profiles set avg_response_minutes = 1, response_sample_count = 50, bio = 'Olá' where id = $1`, [PRO])
  let [r] = await q('select avg_response_minutes a, response_sample_count n, bio from public.profiles where id = $1', [PRO])
  assert.deepEqual(r, { a: null, n: 0, bio: 'Olá' })
  // O cálculo do servidor passa (1.ª resposta 10 minutos depois, 1 conversa).
  await q(`select public.recompute_response_time_internal($1)`, [PRO])
  ;[r] = await q('select avg_response_minutes::text a, response_sample_count n from public.profiles where id = $1', [PRO])
  assert.deepEqual(r, { a: '10.0', n: 1 })
  // E a marca de "escrita do servidor" não fica ligada para o resto da transação.
  await as(PRO, `update public.profiles set avg_response_minutes = 1 where id = $1`, [PRO])
  ;[r] = await q('select avg_response_minutes::text a from public.profiles where id = $1', [PRO])
  assert.equal(r.a, '10.0')

  assert.deepEqual(await as(null, 'select * from public.contagem_propostas($1)', [[REQ]]), [{ request_id: REQ, n: 1 }])
  const conv = await as(CLI, 'select * from public.resumo_conversas()')
  assert.deepEqual(conv, [{ conversation_id: CONV, total: 3, unread: 0, last_sender: CLI, last_read: false }])
  assert.deepEqual(await as(VITIMA, 'select conversation_id, total, unread from public.resumo_conversas()'), [{ conversation_id: CONV_VITIMA, total: 1, unread: 1 }])
  await assert.rejects(() => as(null, 'select * from public.resumo_conversas()'), /permission denied/)
})

