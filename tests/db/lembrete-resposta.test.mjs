// Valida a migração lembrete_resposta num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIG = (n) => fs.readFileSync(new URL('../../supabase/migrations/' + n, import.meta.url), 'utf8')

test('migração lembrete_resposta: só conversas em que o cliente espera 2–24 h, uma vez', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
  create table public.conversations(id uuid primary key, professional_id uuid, client_id uuid, last_message_at timestamptz);
  create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, content text, created_at timestamptz);
  grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  `)
  await db.exec(MIG('20260927185900_mensagens_flinko.sql'))
  await db.exec(MIG('20260927201616_lembrete_resposta.sql'))
  await db.exec(MIG('20260927201616_lembrete_resposta.sql')) // idempotente
  const PRO = '22222222-2222-2222-2222-222222222222', CLI = '11111111-1111-1111-1111-111111111111'
  const ID = {}; let n = 0
  const who = (w) => (w === 'pro' ? PRO : CLI)
  const conv = async (nome, flinko, msgs) => {
    const id = ID[nome] = 'aaaaaaaa-aaaa-aaaa-aaaa-00000000000' + (++n)
    const last = msgs[msgs.length - 1]
    await q(`insert into public.conversations values ($1, $3, $4, now() - $2::interval)`, [id, last[1], PRO, CLI])
    if (flinko) await q(`update public.conversations set is_flinko = true where id = $1`, [id])
    for (const [w, ago, txt] of msgs) await q(`insert into public.messages(conversation_id, sender_id, content, created_at) values ($1, $2, $3, now() - $4::interval)`, [id, who(w), txt || 'x', ago])
  }
  await conv('espera3h', false, [['pro', '5 hours'], ['cli', '3 hours', 'Pode vir amanhã?']])
  await conv('respondida', false, [['cli', '5 hours'], ['pro', '3 hours']])
  await conv('recente', false, [['cli', '1 hour']])
  await conv('antiga', false, [['cli', '30 hours']])
  await conv('flinko', true, [['cli', '3 hours']])
  const pend = async () => (await q(`select * from public.mensagens_por_responder('2 hours', '24 hours')`))
  const r = await pend()
  assert.deepEqual(r.map((x) => [x.conversation_id, x.professional_id, x.client_id, x.content]), [[ID.espera3h, PRO, CLI, 'Pode vir amanhã?']])
  // depois de lembrada, não volta a aparecer
  await q(`insert into public.lembretes_resposta(message_id) values ($1)`, [r[0].message_id])
  assert.equal((await pend()).length, 0)
  // utilizadores normais não chamam a função
  await db.exec('begin; set local role authenticated;')
  await assert.rejects(() => q(`select * from public.mensagens_por_responder('2 hours', '24 hours')`), /permission denied/)
  await db.exec('rollback')
})
