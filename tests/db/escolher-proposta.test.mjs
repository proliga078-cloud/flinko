// Valida a migração escolher_proposta num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927160000_escolher_proposta.sql', import.meta.url)

test('migração escolher_proposta: só o cliente escolhe, tudo numa transação, estados protegidos', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table public.profiles(id uuid primary key, name text);
  create table public.requests(id uuid primary key default gen_random_uuid(), client_id uuid, title text, status text default 'open', created_at timestamptz default now());
  create table public.request_offers(id uuid primary key default gen_random_uuid(), request_id uuid references public.requests(id) on delete cascade, professional_id uuid, message text, price_from numeric, price_to numeric, created_at timestamptz default now(), unique(request_id, professional_id));
  create table public.conversations(id uuid primary key default gen_random_uuid(), professional_id uuid, client_id uuid, created_at timestamptz default now());
  create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, content text, created_at timestamptz default now());
  create table public.jobs(id uuid primary key default gen_random_uuid(), professional_id uuid, client_id uuid, conversation_id uuid, title text, client_name text, status text, quote_amount numeric, quote_accepted_at timestamptz);
  alter table public.request_offers enable row level security;
  create policy o_sel on public.request_offers for select using (true);
  create policy o_ins on public.request_offers for insert with check (auth.uid() = professional_id);
  create policy o_upd on public.request_offers for update using (auth.uid() = professional_id);
  grant usage on schema public, auth to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  const CLI = '11111111-1111-1111-1111-111111111111', P1 = '22222222-2222-2222-2222-222222222222', P2 = '33333333-3333-3333-3333-333333333333'
  const REQ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await db.exec(`insert into public.profiles values ('${CLI}', 'Ana Silva'), ('${P1}', 'Rui'), ('${P2}', 'Marta');
    insert into public.requests(id, client_id, title) values ('${REQ}', '${CLI}', 'Trocar quadro elétrico');`)
  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true); select set_config('request.jwt.claim.role', 'authenticated', true);`)
      const r = await q(sql, params)
      await db.exec('commit')
      return r
    } catch (e) { await db.exec('rollback'); throw e }
  }

  // o profissional não consegue marcar a própria proposta como escolhida
  const [o1] = await as(P1, `insert into public.request_offers(request_id, professional_id, price_from, status) values ($1, $2, 120, 'accepted') returning *`, [REQ, P1])
  assert.equal(o1.status, 'pending')
  const [o2] = await as(P2, `insert into public.request_offers(request_id, professional_id, price_from) values ($1, $2, 150) returning *`, [REQ, P2])
  await as(P2, `update public.request_offers set status = 'accepted' where id = $1`, [o2.id])
  assert.equal((await q(`select status from public.request_offers where id = '${o2.id}'`))[0].status, 'pending')

  // só quem publicou o pedido escolhe
  await assert.rejects(() => as(P1, 'select public.escolher_proposta($1)', [o1.id]), /Só quem publicou o pedido/)

  // o cliente escolhe: tudo acontece numa só vez
  const [{ escolher_proposta: conv }] = await as(CLI, 'select public.escolher_proposta($1)', [o1.id])
  assert.ok(conv)
  const estados = Object.fromEntries((await q('select id, status from public.request_offers')).map((r) => [r.id, r.status]))
  assert.equal(estados[o1.id], 'accepted'); assert.equal(estados[o2.id], 'declined')
  assert.equal((await q(`select status from public.requests where id = '${REQ}'`))[0].status, 'resolved')
  const c = (await q(`select professional_id, client_id from public.conversations where id = '${conv}'`))[0]
  assert.deepEqual([c.professional_id, c.client_id], [P1, CLI])
  assert.match((await q(`select content from public.messages where conversation_id = '${conv}'`))[0].content, /Escolhi a tua proposta para «Trocar quadro elétrico»/)
  const job = (await q('select * from public.jobs'))[0]
  assert.equal(job.professional_id, P1); assert.equal(job.status, 'aceite'); assert.equal(Number(job.quote_amount), 120); assert.equal(job.client_name, 'Ana Silva')

  // repetir não duplica; o pedido fechado não aceita novas propostas nem mudanças de preço
  const [{ escolher_proposta: conv2 }] = await as(CLI, 'select public.escolher_proposta($1)', [o1.id])
  assert.equal(conv2, conv)
  assert.equal((await q('select count(*)::int n from public.jobs'))[0].n, 1)
  await assert.rejects(() => as(CLI, 'select public.escolher_proposta($1)', [o2.id]), /já está fechado/)
  await assert.rejects(() => as(P1, `update public.request_offers set price_from = 999 where id = $1`, [o1.id]), /já foi decidida/)
  const P3 = '44444444-4444-4444-4444-444444444444'
  await assert.rejects(() => as(P3, `insert into public.request_offers(request_id, professional_id, price_from) values ($1, $2, 90)`, [REQ, P3]), /já não aceita propostas/)
})
