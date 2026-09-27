// Valida a migração limite_uso_ia num Postgres em memória (PGlite): cada conta
// tem um limite diário por assistente, contado na base de dados.
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927011414_limite_uso_ia.sql', import.meta.url)

test('migração limite_uso_ia: quota diária por conta e por assistente', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', true);`)
      const r = await q(sql, params)
      await db.exec('commit')
      return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  const consume = async (uid, fn, limit) => (await as(uid, 'select public.ai_consume($1, $2) as ok', [fn, limit]))[0].ok

  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
  // 3 por dia: as três primeiras passam, a quarta não
  assert.deepEqual([await consume(A, 'ai-assistant', 3), await consume(A, 'ai-assistant', 3), await consume(A, 'ai-assistant', 3), await consume(A, 'ai-assistant', 3)], [true, true, true, false])
  // outra conta e outro assistente têm quota própria
  assert.equal(await consume(B, 'ai-assistant', 3), true)
  assert.equal(await consume(A, 'ai-profile-builder', 3), true)
  // nomes desconhecidos e anónimos não passam
  assert.equal(await consume(A, 'outra-coisa', 3), false)
  await assert.rejects(() => consume(null, 'ai-assistant', 3), /permission denied/)
  // ninguém lê nem mexe na tabela diretamente
  await assert.rejects(() => as(A, 'select * from public.ai_usage'), /permission denied/)
  // pedir um limite enorme não dá mais do que 500
  await db.exec(`update public.ai_usage set count = 500 where user_id = '${B}'`)
  assert.equal(await consume(B, 'ai-assistant', 100000), false)
})
