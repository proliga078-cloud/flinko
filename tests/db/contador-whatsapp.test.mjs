// Valida a migração contador_whatsapp num Postgres em memória (PGlite).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIG = (n) => fs.readFileSync(new URL('../../supabase/migrations/' + n, import.meta.url), 'utf8')

test('migração contador_whatsapp: só conta cliques legítimos, sem repetições, e só o próprio vê', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles(id uuid primary key, is_admin boolean default false);
  create function public.is_admin() returns boolean language sql stable security definer as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
  create table public.profile_private(profile_id uuid primary key references public.profiles(id), phone text);
  create table public.requests(id uuid primary key, client_id uuid);
  create table public.request_offers(id uuid primary key default gen_random_uuid(), request_id uuid, professional_id uuid);
  grant usage on schema public, auth to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  `)
  await db.exec(MIG('20260927180442_alertas_whatsapp.sql'))
  await db.exec(MIG('20260927181610_whatsapp_click.sql'))
  await db.exec(MIG('20260927184447_contador_whatsapp.sql'))
  await db.exec(MIG('20260927184447_contador_whatsapp.sql')) // idempotente

  const CLI = '11111111-1111-1111-1111-111111111111', P1 = '22222222-2222-2222-2222-222222222222', P2 = '33333333-3333-3333-3333-333333333333', ADM = '44444444-4444-4444-4444-444444444444', OUTRO = '55555555-5555-5555-5555-555555555555'
  const REQ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await db.exec(`insert into public.profiles(id, is_admin) values ('${CLI}', false), ('${P1}', false), ('${P2}', false), ('${ADM}', true), ('${OUTRO}', false);
    insert into public.profile_private(profile_id, phone, whatsapp_visivel) values ('${P1}', '912345678', true), ('${P2}', '913000000', false);
    insert into public.requests values ('${REQ}', '${CLI}');
    insert into public.request_offers(request_id, professional_id) values ('${REQ}', '${P1}'), ('${REQ}', '${P2}');`)
  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`)
      const r = await q(sql, params); await db.exec('commit'); return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  const clique = async (uid, pro) => (await as(uid, 'select public.registar_contacto_whatsapp($1, $2) as ok', [pro, REQ]))[0].ok

  assert.equal(await clique(CLI, P1), true)     // cliente dono do pedido, profissional com WhatsApp visível
  assert.equal(await clique(CLI, P1), false)    // repetido nas 24 h: não conta outra vez
  assert.equal(await clique(CLI, P2), false)    // P2 não mostra o WhatsApp
  assert.equal(await clique(OUTRO, P1), false)  // quem não é dono do pedido não conta
  assert.equal(await clique(ADM, P2), true)     // a Flinko (admin) pode contactar qualquer um
  // ninguém insere à mão
  await assert.rejects(() => as(OUTRO, `insert into public.whatsapp_contactos(professional_id, source) values ($1, 'proposta')`, [P1]), /row-level security|permission denied/)

  assert.deepEqual((await as(P1, 'select source from public.whatsapp_contactos')).map((r) => r.source), ['proposta'])
  assert.equal((await as(P2, 'select * from public.whatsapp_contactos')).length, 1)
  assert.equal((await as(OUTRO, 'select * from public.whatsapp_contactos')).length, 0)
  assert.equal((await as(ADM, 'select * from public.whatsapp_contactos')).length, 2)
  // anónimo não regista nada
  await db.exec('begin; set local role anon;')
  await assert.rejects(() => q('select public.registar_contacto_whatsapp($1, $2)', [P1, REQ]), /permission denied/)
  await db.exec('rollback')
})
