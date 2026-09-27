// Valida a migração convites_avaliacao num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927170000_convites_avaliacao.sql', import.meta.url)

test('migração convites_avaliacao: links de uso único, sem sessão, limites e origem', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles(id uuid primary key, name text, photo_url text, category text, slug text);
  create table public.jobs(id uuid primary key default gen_random_uuid(), professional_id uuid);
  create table public.reviews(id uuid primary key default gen_random_uuid(), professional_id uuid not null, client_id uuid, reviewer_name text not null, reviewer_email text not null, rating int not null, comment text, created_at timestamptz default now());
  grant usage on schema public, auth to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  const PRO = '11111111-1111-1111-1111-111111111111', CLI = '22222222-2222-2222-2222-222222222222', OUT = '33333333-3333-3333-3333-333333333333'
  await db.exec(`insert into auth.users values ('${CLI}', 'ana@exemplo.pt');
    insert into public.profiles(id, name, category) values ('${PRO}', 'Rui Alves', 'Eletricistas'), ('${CLI}', 'Ana Silva', null), ('${OUT}', 'Outro', null);`)
  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', true);`)
      const r = await q(sql, params)
      await db.exec('commit')
      return r
    } catch (e) { await db.exec('rollback'); throw e }
  }

  // o profissional cria um convite para um cliente antigo
  const [inv] = await as(PRO, `insert into public.review_invites(professional_id, client_name) values ($1, 'Carlos') returning token, source`, [PRO])
  assert.equal(inv.source, 'convite'); assert.equal(inv.token.length, 32)
  // não pode criar convites "de trabalho" nem em nome de outro
  await assert.rejects(() => as(PRO, `insert into public.review_invites(professional_id, source) values ($1, 'trabalho')`, [PRO]), /row-level security/)
  await assert.rejects(() => as(OUT, `insert into public.review_invites(professional_id) values ($1)`, [PRO]), /row-level security/)
  // ninguém mais vê os convites
  assert.equal((await as(OUT, 'select * from public.review_invites')).length, 0)
  assert.equal((await as(null, 'select * from public.review_invites').catch(() => [])).length, 0)

  // sem sessão: a página mostra quem é e publica a avaliação
  const [info] = await as(null, 'select * from public.review_invite_info($1)', [inv.token])
  assert.equal(info.pro_name, 'Rui Alves'); assert.equal(info.client_name, 'Carlos'); assert.equal(info.used, false)
  const [{ submit_review_invite: rid }] = await as(null, 'select public.submit_review_invite($1, 5, $2, null)', [inv.token, 'Excelente trabalho'])
  const rev = (await q(`select * from public.reviews where id = '${rid}'`))[0]
  assert.equal(rev.rating, 5); assert.equal(rev.reviewer_name, 'Carlos'); assert.equal(rev.source, 'convite'); assert.match(rev.reviewer_email, /@flinko\.pt$/)
  // uso único
  await assert.rejects(() => as(null, 'select public.submit_review_invite($1, 4, null, $2)', [inv.token, 'X']), /já foi usado/)

  // link de trabalho (criado pelo servidor) usa o email real do cliente
  const [job] = await q(`insert into public.jobs(professional_id) values ('${PRO}') returning id`)
  const [t] = await q(`insert into public.review_invites(professional_id, client_id, job_id, source) values ('${PRO}', '${CLI}', '${job.id}', 'trabalho') returning token`)
  await assert.rejects(() => as(CLI, 'select public.submit_review_invite($1, 9, null, $2)', [t.token, 'Ana']), /1 a 5 estrelas/)
  await assert.rejects(() => as(PRO, 'select public.submit_review_invite($1, 5, null, $2)', [t.token, 'Eu']), /próprio trabalho/)
  const [{ submit_review_invite: rid2 }] = await as(CLI, 'select public.submit_review_invite($1, 4, null, $2)', [t.token, 'Ana Silva'])
  const rev2 = (await q(`select * from public.reviews where id = '${rid2}'`))[0]
  assert.equal(rev2.source, 'trabalho'); assert.equal(rev2.reviewer_email, 'ana@exemplo.pt'); assert.equal(rev2.job_id, job.id)

  // limite de 30 convites por mês
  for (let k = 0; k < 29; k++) await as(PRO, `insert into public.review_invites(professional_id) values ($1)`, [PRO])
  await assert.rejects(() => as(PRO, `insert into public.review_invites(professional_id) values ($1)`, [PRO]), /limite de 30 convites/)
})
