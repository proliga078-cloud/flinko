// Valida a migraÃ§Ã£o eventos_funil num Postgres em memÃ³ria (PGlite): qualquer
// visitante regista eventos, ninguÃ©m os lÃª pela API e sÃ³ os admins veem as
// contagens agregadas.
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927011416_eventos_funil.sql', import.meta.url)
const MIGRATION_APP = new URL('../../supabase/migrations/20260927012758_eventos_app.sql', import.meta.url)

test('migraÃ§Ã£o eventos_funil: registar, nÃ£o ler, e contagens sÃ³ para admins', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles(id uuid primary key, is_admin boolean default false);
  create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
  insert into public.profiles values ('11111111-1111-1111-1111-111111111111', true), ('22222222-2222-2222-2222-222222222222', false);
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente
  await db.exec(fs.readFileSync(MIGRATION_APP, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION_APP, 'utf8')) // idempotente
  await db.exec('grant insert, select, update, delete on public.site_events to anon, authenticated') // como o Supabase faz por omissÃ£o

  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', true);`)
      const r = await q(sql, params)
      await db.exec('commit')
      return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  const ADMIN = '11111111-1111-1111-1111-111111111111', USER = '22222222-2222-2222-2222-222222222222'
  const ins = (uid, name, userId = null) => as(uid, 'insert into public.site_events(name, visitor_id, user_id, path, props) values ($1, $2, $3, $4, $5)', [name, 'v-1', userId, '/', { q: 'eletricista' }])

  await ins(null, 'pesquisa')
  await ins(null, 'pesquisa')
  await ins(USER, 'pedido_publicado', USER)
  await ins(null, 'app_instalada') // aceite depois da migraÃ§Ã£o eventos_app
  // nomes fora da lista e eventos em nome de outra pessoa sÃ£o recusados
  await assert.rejects(() => ins(null, 'qualquer_coisa'), /check constraint/)
  await assert.rejects(() => ins(USER, 'pesquisa', ADMIN), /row-level security/)
  // ninguÃ©m lÃª pela API
  assert.equal((await as(USER, 'select * from public.site_events')).length, 0)
  assert.equal((await as(null, 'select * from public.site_events')).length, 0)
  // contagens: admin vÃª, os outros nÃ£o
  const rows = await as(ADMIN, 'select name, n::int as n from public.admin_event_counts(30) order by name')
  assert.deepEqual(rows, [{ name: 'app_instalada', n: 1 }, { name: 'pedido_publicado', n: 1 }, { name: 'pesquisa', n: 2 }])
  assert.equal((await as(USER, 'select * from public.admin_event_counts(30)')).length, 0)
  await assert.rejects(() => as(null, 'select * from public.admin_event_counts(30)'), /permission denied/)
})
