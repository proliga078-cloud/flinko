// Valida a migração nome_nunca_e_email num Postgres em memória (PGlite): o
// nome de um perfil (que é público) nunca fica com um endereço de email.
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927011353_nome_nunca_e_email.sql', import.meta.url)

test('migração nome_nunca_e_email: o nome do perfil nunca é um email', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create table public.profiles(id serial primary key, name text);
  insert into public.profiles(name) values ('gbframe.oficial@gmail.com'), ('Rui Pro');
  `)

  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  // perfis antigos corrigidos, os outros intactos
  assert.deepEqual((await q('select name from public.profiles order by id')).map(r => r.name), ['Gbframe Oficial', 'Rui Pro'])

  // novos perfis e edições passam pela mesma regra
  const casos = [
    ['ana.silva93@gmail.com', 'Ana Silva'],
    ['JOAO_PEDRO+obras@sapo.pt', 'Joao Pedro Obras'],
    ['123@x.pt', 'Profissional'],
    ['Maria Costa', 'Maria Costa'],
    [null, null]
  ]
  for (const [entrada, esperado] of casos) {
    const [r] = await q('insert into public.profiles(name) values ($1) returning name', [entrada])
    assert.equal(r.name, esperado, `insert ${entrada}`)
  }
  const [r] = await q("update public.profiles set name='rui@x.pt' where name='Rui Pro' returning name")
  assert.equal(r.name, 'Rui')
})
