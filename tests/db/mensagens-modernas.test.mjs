// Valida a migração mensagens_modernas num Postgres em memória (PGlite):
// fotos só na pasta da conversa e só vistas pelos participantes, respostas,
// "visto às" marcado por quem recebe, e reações de cada um.
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260927152441_mensagens_modernas.sql', import.meta.url)

test('migração mensagens_modernas: fotos privadas, respostas, visto e reações', async () => {
  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create table public.profiles(id uuid primary key);
  create table public.conversations(id uuid primary key default gen_random_uuid(), professional_id uuid, client_id uuid, last_message text, last_message_at timestamptz);
  create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_id uuid not null, content text not null, read boolean default false, created_at timestamptz default now());
  create function public.protect_message_fields() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger protect_message_fields_trg before update on public.messages for each row execute function public.protect_message_fields();
  create function public.update_conversation_last_message() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger trg_update_conversation_last_message after insert on public.messages for each row execute function public.update_conversation_last_message();
  alter table public.messages enable row level security;
  create policy m_sel on public.messages for select using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.professional_id, c.client_id)));
  create policy m_ins on public.messages for insert with check (sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.professional_id, c.client_id)));
  create policy m_upd on public.messages for update using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.professional_id, c.client_id)));
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  grant usage on all sequences in schema storage to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  await db.exec(fs.readFileSync(MIGRATION, 'utf8')) // idempotente

  const PRO = '11111111-1111-1111-1111-111111111111', CLI = '22222222-2222-2222-2222-222222222222', OUT = '33333333-3333-3333-3333-333333333333'
  const CONV = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await db.exec(`insert into public.profiles values ('${PRO}'),('${CLI}'),('${OUT}');
    insert into public.conversations(id, professional_id, client_id) values ('${CONV}', '${PRO}', '${CLI}');`)

  const as = async (uid, sql, params) => {
    await db.exec('begin')
    try {
      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true); select set_config('request.jwt.claim.role', 'authenticated', true);`)
      const r = await q(sql, params)
      await db.exec('commit')
      return r
    } catch (e) { await db.exec('rollback'); throw e }
  }
  const send = (uid, content, attachments = [], reply = null) =>
    as(uid, 'insert into public.messages(conversation_id, sender_id, content, attachments, reply_to) values ($1, $2, $3, $4, $5) returning *', [CONV, uid, content, JSON.stringify(attachments), reply])

  // texto normal
  const [m1] = await send(CLI, 'Olá, preciso de um orçamento')
  assert.equal(m1.read, false)
  // foto sem texto: a lista de conversas mostra "📷 Foto"
  const [m2] = await send(CLI, '', [{ path: `${CONV}/abc-1.jpg`, w: 800, h: 600 }])
  assert.equal((await q(`select last_message from public.conversations where id = '${CONV}'`))[0].last_message, '📷 Foto')
  // sem texto nem foto, ou foto fora da pasta desta conversa: recusado
  await assert.rejects(() => send(CLI, '   '), /check constraint/)
  await assert.rejects(() => send(CLI, 'x', [{ path: 'outra-conversa/a.jpg' }]), /anexo inválido/)
  await assert.rejects(() => send(CLI, 'x', [{ path: `${CONV}/../a.jpg` }]), /anexo inválido/)
  // responder a uma mensagem
  const [m3] = await send(PRO, 'Claro! Pode enviar fotos?', [], m1.id)
  assert.equal(m3.reply_to, m1.id)

  // quem enviou não consegue marcar a própria mensagem como lida
  await as(CLI, `update public.messages set read = true where id = $1`, [m1.id])
  assert.equal((await q(`select read from public.messages where id = '${m1.id}'`))[0].read, false)
  // quem recebe marca: fica a hora ("visto às")
  await as(PRO, `update public.messages set read = true where id = $1`, [m1.id])
  const lida = (await q(`select read, read_at from public.messages where id = '${m1.id}'`))[0]
  assert.equal(lida.read, true); assert.ok(lida.read_at)
  // depois de enviada, o conteúdo e as fotos não mudam
  await as(PRO, `update public.messages set content = 'alterado', attachments = '[]' where id = $1`, [m2.id])
  const m2b = (await q(`select content, attachments from public.messages where id = '${m2.id}'`))[0]
  assert.equal(m2b.content, ''); assert.equal(m2b.attachments.length, 1)

  // reações: cada um a sua; quem não está na conversa não reage
  await as(PRO, `insert into public.message_reactions(message_id, user_id, emoji) values ($1, $2, '❤️')`, [m1.id, PRO])
  await assert.rejects(() => as(OUT, `insert into public.message_reactions(message_id, user_id, emoji) values ($1, $2, '👍')`, [m1.id, OUT]), /row-level security/)
  await assert.rejects(() => as(CLI, `insert into public.message_reactions(message_id, user_id, emoji) values ($1, $2, '👍')`, [m1.id, PRO]), /row-level security/)
  await assert.rejects(() => as(PRO, `insert into public.message_reactions(message_id, user_id, emoji) values ($1, $2, '💩')`, [m2.id, PRO]), /check constraint/)
  assert.equal((await as(CLI, 'select * from public.message_reactions')).length, 1)
  assert.equal((await as(OUT, 'select * from public.message_reactions')).length, 0)

  // fotos: bucket privado; só os participantes enviam e veem ficheiros da conversa
  assert.equal((await q(`select public from storage.buckets where id = 'chat-media'`))[0].public, false)
  await as(CLI, `insert into storage.objects(bucket_id, name) values ('chat-media', $1)`, [`${CONV}/abc-1.jpg`])
  await assert.rejects(() => as(OUT, `insert into storage.objects(bucket_id, name) values ('chat-media', $1)`, [`${CONV}/intruso.jpg`]), /row-level security/)
  assert.equal((await as(PRO, `select name from storage.objects where bucket_id = 'chat-media'`)).length, 1)
  assert.equal((await as(OUT, `select name from storage.objects where bucket_id = 'chat-media'`)).length, 0)
})
