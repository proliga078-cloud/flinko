// Valida a migração mensagens_flinko num Postgres em memória (PGlite): só o
// servidor marca uma conversa como oficial da Flinko.
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927185900_mensagens_flinko.sql', import.meta.url)

test('migração mensagens_flinko: ninguém se faz passar pela Flinko', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table public.conversations(id uuid primary key default gen_random_uuid(), professional_id uuid, client_id uuid);
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente
  const PRO = '22222222-2222-2222-2222-222222222222', CLI = '11111111-1111-1111-1111-111111111111'
  const as = async (role, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${CLI}', true); select set_config('request.jwt.claim.role', '${role}', true);`)
      const r = await q(sql, params); await db.exec('commit'); return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  // utilizador normal tenta criar/alterar uma conversa "oficial": fica false
  const [c] = await as('authenticated', `insert into public.conversations(professional_id, client_id, is_flinko) values ($1, $2, true) returning id, is_flinko`, [PRO, CLI])
  assert.equal(c.is_flinko, false)
  await as('authenticated', `update public.conversations set is_flinko = true where id = $1`, [c.id])
  assert.equal((await q('select is_flinko from public.conversations where id = $1', [c.id]))[0].is_flinko, false)
  // o servidor (chave de serviço) pode
  await as('service_role', `update public.conversations set is_flinko = true where id = $1`, [c.id])
  assert.equal((await q('select is_flinko from public.conversations where id = $1', [c.id]))[0].is_flinko, true)
  // e depois ninguém a desliga nem liga por fora
  await as('authenticated', `update public.conversations set is_flinko = false where id = $1`, [c.id])
  assert.equal((await q('select is_flinko from public.conversations where id = $1', [c.id]))[0].is_flinko, true)
})
