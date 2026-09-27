// Valida a migração bloquear_utilizadores num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927180000_bloquear_utilizadores.sql', import.meta.url)

test('migração bloquear_utilizadores: bloqueio impede mensagens nos dois sentidos', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table public.profiles(id uuid primary key, is_admin boolean default false);
  create function public.is_admin() returns boolean language sql stable as $$ select false $$;
  create table public.conversations(id uuid primary key default gen_random_uuid(), professional_id uuid, client_id uuid);
  create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, content text);
  grant usage on schema public, auth to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333'
  const CONV = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await db.exec(`insert into public.profiles(id) values ('${A}'),('${B}'),('${C}'); insert into public.conversations values ('${CONV}', '${A}', '${B}');`)
  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true); select set_config('request.jwt.claim.role', 'authenticated', true);`)
      const r = await q(sql, params); await db.exec('commit'); return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  const send = (uid) => as(uid, `insert into public.messages(conversation_id, sender_id, content) values ($1, $2, 'olá')`, [CONV, uid])

  await send(A); await send(B)
  await as(B, `insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)`, [B, A])
  await assert.rejects(() => send(A), /Não é possível enviar/)
  await assert.rejects(() => send(B), /Não é possível enviar/)
  // só quem bloqueou vê e desfaz o bloqueio; ninguém bloqueia em nome de outro
  assert.equal((await as(A, 'select * from public.user_blocks')).length, 0)
  assert.equal((await as(B, 'select * from public.user_blocks')).length, 1)
  await assert.rejects(() => as(C, `insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)`, [A, C]), /row-level security/)
  await assert.rejects(() => as(A, `insert into public.user_blocks(blocker_id, blocked_id) values ($1, $1)`, [A]), /check constraint/)
  await as(A, `delete from public.user_blocks where blocked_id = $1`, [A]) // A não consegue apagar o bloqueio de B
  await assert.rejects(() => send(A), /Não é possível enviar/)
  await as(B, `delete from public.user_blocks where blocked_id = $1`, [A])
  await send(A)
})
