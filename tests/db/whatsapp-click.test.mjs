// Valida a migração whatsapp_click num Postgres em memória (PGlite): as
// colunas da Twilio passam a consentimento (sem perder dados) e o telemóvel
// só chega ao dono do pedido, e só de quem aceitou mostrar o WhatsApp.
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const ANTES = new URL('../../supabase/migrations/20260927180442_alertas_whatsapp.sql', import.meta.url)
const MIGRATION = new URL('../../supabase/migrations/20260927181610_whatsapp_click.sql', import.meta.url)

test('migração whatsapp_click: consentimento e telemóvel só para o dono do pedido', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles(id uuid primary key);
  create table public.profile_private(profile_id uuid primary key references public.profiles(id), phone text);
  create table public.requests(id uuid primary key, client_id uuid);
  create table public.request_offers(id uuid primary key default gen_random_uuid(), request_id uuid, professional_id uuid);
  alter table public.profile_private enable row level security;
  create policy pp_own on public.profile_private for select using (auth.uid() = profile_id);
  grant usage on schema public, auth to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  `)
  const CLI = '11111111-1111-1111-1111-111111111111', P1 = '22222222-2222-2222-2222-222222222222', P2 = '33333333-3333-3333-3333-333333333333', P3 = '44444444-4444-4444-4444-444444444444', OUTRO = '55555555-5555-5555-5555-555555555555'
  const REQ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  // estado de produção antes desta migração (colunas da Twilio, com um dado)
  await db.exec(fs.readFileSync(ANTES, 'utf8'))
  await db.exec(`insert into public.profiles values ('${CLI}'),('${P1}'),('${P2}'),('${P3}'),('${OUTRO}');
    insert into public.profile_private(profile_id, phone, whatsapp_alerts) values ('${P1}', '912345678', true), ('${P2}', '913000000', false), ('${P3}', '', true);
    insert into public.requests values ('${REQ}', '${CLI}');
    insert into public.request_offers(request_id, professional_id) values ('${REQ}', '${P1}'), ('${REQ}', '${P2}'), ('${REQ}', '${P3}');`)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  const cols = (await q(`select column_name from information_schema.columns where table_name = 'profile_private' order by 1`)).map((r) => r.column_name)
  assert.ok(cols.includes('whatsapp_visivel') && cols.includes('whatsapp_visivel_at'))
  assert.ok(!cols.includes('whatsapp_alerts') && !cols.includes('whatsapp_opt_in_at'))
  assert.equal((await q(`select whatsapp_visivel from public.profile_private where profile_id = $1`, [P1]))[0].whatsapp_visivel, true) // dado mantido

  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`)
      const r = await q(sql, params); await db.exec('commit'); return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  const nums = (uid) => as(uid, 'select * from public.whatsapp_das_propostas($1)', [REQ])
  // dono do pedido: só P1 (P2 não aceitou mostrar, P3 não tem número)
  assert.deepEqual(await nums(CLI), [{ professional_id: P1, phone: '912345678' }])
  // outra pessoa (ou um dos profissionais) não vê números de ninguém
  assert.deepEqual(await nums(OUTRO), [])
  assert.deepEqual(await nums(P2), [])
  // anónimo não pode chamar a função
  await db.exec('begin; set local role anon;')
  await assert.rejects(() => q('select * from public.whatsapp_das_propostas($1)', [REQ]), /permission denied/)
  await db.exec('rollback')
})
