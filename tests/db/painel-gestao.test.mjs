// Valida a migração painel_gestao_completo num Postgres em memória (PGlite),
// com um esqueleto mínimo do Supabase (auth.uid, papéis anon/authenticated/
// service_role e só as colunas que a migração usa).
//
// Garante o que não se vê no browser: que um admin de apoio não consegue mexer
// em dinheiro nem promover-se, que ninguém altera ou apaga o registo de ações,
// que as funções recusam quem não é admin, e que o formulário de contacto
// público só consegue criar pedidos (sem ler os dos outros).
//
// Uso: npm run test:db
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const MIGRATION = new URL('../../supabase/migrations/20260924150000_painel_gestao_completo.sql', import.meta.url)
const log = (...a) => { if (process.env.DEBUG) console.log(...a) } // DEBUG=1 npm run test:db mostra cada passo

test('migração painel_gestao_completo: permissões, registo de ações e funções', async () => {

  const db = new PGlite()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  const ex = sql => db.exec(sql)

  await ex(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, user_id uuid, name text, account_type text default 'professional',
    verified boolean default false, suspended boolean default false, approved boolean default true, is_admin boolean default false, is_demo boolean default false,
    plan text default 'free', plan_expires_at timestamptz, credits numeric default 0, stripe_customer_id text, stripe_subscription_id text, created_at timestamptz default now());
  create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false) $$;
  create function public.protect_privileged_profile_columns() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger protect_privileged_profile_columns_trg before insert or update on public.profiles for each row execute function public.protect_privileged_profile_columns();
  create table public.reviews(id uuid primary key default gen_random_uuid(), professional_id uuid references public.profiles(id) on delete cascade, client_id uuid, reviewer_name text, reviewer_email text, rating int, comment text, created_at timestamptz default now());
  create table public.requests(id uuid primary key default gen_random_uuid(), client_id uuid references public.profiles(id) on delete cascade, title text, description text, category text, location text, status text default 'open', created_at timestamptz default now());
  create table public.gdpr_requests(id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id) on delete cascade, request_type text, status text default 'pending', notes text, admin_notes text, created_at timestamptz default now(), resolved_at timestamptz);
  create table public.verification_requests(id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id) on delete cascade, status text default 'pending', documents jsonb, notes text, admin_notes text, resolved_by uuid references public.profiles(id), resolved_at timestamptz, created_at timestamptz default now());
  create table public.site_visits(id uuid primary key default gen_random_uuid(), visitor_id text, user_id uuid, path text, referrer text, created_at timestamptz default now());
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant select on auth.users to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `)

  await ex(fs.readFileSync(MIGRATION, 'utf8'))
  log('✔ migração aplicada')
  // idempotente (pode ser aplicada duas vezes sem erro)
  await ex(fs.readFileSync(MIGRATION, 'utf8'))
  log('✔ migração é idempotente')

  // fora de as(), as escritas de preparação correm como service_role (tal como as funções de servidor)
  await ex("select set_config('request.jwt.claim.role','service_role',false)")
  const OWNER = '11111111-1111-1111-1111-111111111111', SUPPORT = '22222222-2222-2222-2222-222222222222', PRO = '33333333-3333-3333-3333-333333333333', CLI = '44444444-4444-4444-4444-444444444444'
  await ex(`insert into auth.users values ('${OWNER}','dono@x.pt'),('${SUPPORT}','apoio@x.pt'),('${PRO}','pro@x.pt'),('${CLI}','cli@x.pt');
  insert into public.profiles(id,user_id,name,is_admin,admin_role) values ('${OWNER}','${OWNER}','Dono',true,null),('${SUPPORT}','${SUPPORT}','Apoio',true,'support');
  insert into public.profiles(id,user_id,name,account_type) values ('${PRO}','${PRO}','Rui Pro','professional'),('${CLI}','${CLI}','Ana Cliente','client');`)
  // o update da migração só corre na altura; reaplicar marca o dono antigo
  await ex(`update public.profiles set admin_role='owner' where id='${OWNER}'`)

  async function as(uid, fn) {
    await ex('begin')
    try {
      await ex(`set local role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', true); select set_config('request.jwt.claim.role', '${uid ? 'authenticated' : 'anon'}', true);`)
      const r = await fn()
      await ex('commit')
      return r
    } catch (e) { await ex('rollback'); throw e }
  }

  // 1. dono verifica um profissional -> fica no registo
  await as(OWNER, () => ex(`update public.profiles set verified=true where id='${PRO}'`))
  let a = await q(`select action, summary, actor_email, details from public.admin_audit order by id desc limit 1`)
  assert.equal(a[0].action, 'perfil_alterado'); assert.equal(a[0].actor_email, 'dono@x.pt'); assert.match(a[0].summary, /Rui Pro: verified/)
  log('✔ alteração de admin fica no registo:', a[0].summary)

  // 2. apoio não consegue mexer no plano, mas consegue suspender
  await as(SUPPORT, () => ex(`update public.profiles set plan='premium', credits=99, suspended=true where id='${PRO}'`))
  let p = (await q(`select plan, credits, suspended from public.profiles where id='${PRO}'`))[0]
  assert.equal(p.plan, 'free'); assert.equal(Number(p.credits), 0); assert.equal(p.suspended, true)
  log('✔ apoio: plano e créditos bloqueados, suspensão permitida')

  // 3. apoio não se promove a dono
  await as(SUPPORT, () => ex(`update public.profiles set admin_role='owner' where id='${SUPPORT}'`))
  assert.equal((await q(`select admin_role from public.profiles where id='${SUPPORT}'`))[0].admin_role, 'support')
  await assert.rejects(as(SUPPORT, () => q(`select public.admin_set_role('apoio@x.pt','owner')`)), /Só um dono/)
  log('✔ apoio não se promove (nem pela coluna nem pela função)')

  // 4. utilizador normal não se faz admin
  await as(PRO, () => ex(`update public.profiles set is_admin=true, admin_role='owner', name='Rui P.' where id='${PRO}'`))
  p = (await q(`select is_admin, admin_role, name from public.profiles where id='${PRO}'`))[0]
  assert.equal(p.is_admin, false); assert.equal(p.admin_role, null); assert.equal(p.name, 'Rui P.')
  log('✔ utilizador normal não se torna admin (mas edita o nome)')

  // 5. registo não pode ser alterado nem apagado pela API
  await assert.rejects(as(OWNER, () => ex(`delete from public.admin_audit`)), /permission denied/)
  await assert.rejects(as(OWNER, () => ex(`insert into public.admin_audit(action) values ('falso')`)), /permission denied/)
  await assert.rejects(as(OWNER, () => ex(`update public.admin_audit set summary='x'`)), /permission denied/)
  assert.ok((await as(OWNER, () => q(`select count(*)::int n from public.admin_audit`)))[0].n >= 2)
  assert.equal((await as(PRO, () => q(`select count(*)::int n from public.admin_audit`)))[0].n, 0)
  log('✔ registo: só leitura para admins, invisível para os outros')

  // 6. aprovar verificação marca o perfil e fecha o pedido
  await ex(`update public.profiles set verified=false where id='${PRO}'`)
  const vr = (await q(`insert into public.verification_requests(profile_id) values ('${PRO}') returning id`))[0].id
  await as(SUPPORT, () => q(`select public.admin_resolve_verification('${vr}', true, 'ok')`))
  assert.equal((await q(`select verified from public.profiles where id='${PRO}'`))[0].verified, true)
  const v = (await q(`select status, resolved_by, admin_notes from public.verification_requests where id='${vr}'`))[0]
  assert.equal(v.status, 'approved'); assert.equal(v.resolved_by, SUPPORT)
  await assert.rejects(as(SUPPORT, () => q(`select public.admin_resolve_verification('${vr}', true, null)`)), /já tratado/)
  await assert.rejects(as(PRO, () => q(`select public.admin_resolve_verification('${vr}', true, null)`)), /Sem permissões/)
  log('✔ admin_resolve_verification')

  // 7. verificar na ficha fecha pedidos pendentes
  await ex(`update public.profiles set verified=false where id='${PRO}'`)
  const vr2 = (await q(`insert into public.verification_requests(profile_id) values ('${PRO}') returning id`))[0].id
  await as(OWNER, () => q(`select public.admin_set_verified('${PRO}', true)`))
  assert.equal((await q(`select status from public.verification_requests where id='${vr2}'`))[0].status, 'approved')
  log('✔ admin_set_verified fecha os pedidos pendentes')

  // 8. moderação: apagar avaliação e pedido fica registado com cópia
  const rv = (await q(`insert into public.reviews(professional_id, reviewer_name, reviewer_email, rating, comment) values ('${PRO}','Troll','t@x.pt',1,'burla!') returning id`))[0].id
  await as(OWNER, () => ex(`delete from public.reviews where id='${rv}'`))
  a = (await q(`select action, details from public.admin_audit order by id desc limit 1`))[0]
  assert.equal(a.action, 'avaliacao_apagada'); assert.equal(a.details.review.comment, 'burla!'); assert.equal(a.details.review.reviewer_email, undefined)
  const rq = (await q(`insert into public.requests(client_id,title) values ('${CLI}','Pintar casa') returning id`))[0].id
  await as(OWNER, () => ex(`update public.requests set status='resolved' where id='${rq}'`))
  assert.equal((await q(`select action from public.admin_audit order by id desc limit 1`))[0].action, 'pedido_estado')
  // o próprio cliente a fechar o pedido não entra no registo
  const n0 = (await q(`select count(*)::int n from public.admin_audit`))[0].n
  await as(CLI, () => ex(`update public.requests set status='open' where id='${rq}'`))
  assert.equal((await q(`select count(*)::int n from public.admin_audit`))[0].n, n0)
  log('✔ moderação registada (e ações do próprio utilizador não)')

  // 9. RGPD: mudar estado fica registado
  const gr = (await q(`insert into public.gdpr_requests(profile_id, request_type) values ('${CLI}','export') returning id`))[0].id
  await as(OWNER, () => ex(`update public.gdpr_requests set status='completed' where id='${gr}'`))
  assert.equal((await q(`select action from public.admin_audit order by id desc limit 1`))[0].action, 'rgpd_estado')
  log('✔ estados RGPD registados')

  // 10. equipa: dar/tirar acesso e nunca ficar sem dono
  await as(OWNER, () => q(`select public.admin_set_role('cli@x.pt','support')`))
  assert.deepEqual((await q(`select is_admin, admin_role from public.profiles where id='${CLI}'`))[0], { is_admin: true, admin_role: 'support' })
  await as(OWNER, () => q(`select public.admin_set_role('cli@x.pt','none')`))
  assert.deepEqual((await q(`select is_admin, admin_role from public.profiles where id='${CLI}'`))[0], { is_admin: false, admin_role: null })
  await assert.rejects(as(OWNER, () => q(`select public.admin_set_role('dono@x.pt','support')`)), /pelo menos um dono/)
  await assert.rejects(as(OWNER, () => q(`select public.admin_set_role('ninguem@x.pt','support')`)), /Não há nenhuma conta/)
  const team = await as(SUPPORT, () => q(`select * from public.admin_team()`))
  assert.equal(team.length, 2)
  log('✔ equipa:', team.map(t => t.email + '=' + t.admin_role).join(', '))

  // 11. visitas agregadas, sem admins
  await ex(`insert into public.site_visits(visitor_id,user_id,path,referrer) values ('v1',null,'/','https://www.google.com/search?q=x'),('v1',null,'/','https://www.google.com/'),('v2','${PRO}','/p',null),('v3','${OWNER}','/admin',null)`)
  const vis = await as(SUPPORT, () => q(`select * from public.admin_visit_rows(30) order by path`))
  assert.equal(vis.length, 2); assert.equal(vis[0].n, 2); assert.equal(vis[0].ref_host, 'google.com'); assert.equal(vis[1].ref_host, 'Direto')
  await assert.rejects(as(PRO, () => q(`select * from public.admin_visit_rows(30)`)), /Sem permissões/)
  log('✔ admin_visit_rows agrega e exclui admins')

  // 12. formulário de contacto: anónimo cria, não lê, não força estado; limite por hora
  await as(null, () => ex(`insert into public.support_tickets(name,email,subject,message) values ('Zé','ZE@X.pt','Dúvida','Olá, tenho uma dúvida')`))
  assert.equal((await q(`select email, status, reporter_id from public.support_tickets`))[0].email, 'ze@x.pt')
  assert.equal((await as(null, () => q(`select count(*)::int n from public.support_tickets`)))[0].n, 0)
  await assert.rejects(as(null, () => ex(`insert into public.support_tickets(name,email,subject,message,status) values ('Zé','ze@x.pt','x','resolvido já','resolvido')`)), /row-level security/)
  await assert.rejects(as(null, () => ex(`insert into public.support_tickets(name,email,subject,message) values ('Zé','nao-email','x','mensagem ok')`)), /check constraint/)
  for (let i = 0; i < 4; i++) await as(null, () => ex(`insert into public.support_tickets(name,email,subject,message) values ('Zé','ze@x.pt','x','mensagem ${i}')`))
  await assert.rejects(as(null, () => ex(`insert into public.support_tickets(name,email,subject,message) values ('Zé','ze@x.pt','x','sexta')`)), /Demasiados pedidos/)
  await as(PRO, () => ex(`insert into public.support_tickets(kind,name,email,subject,message,target_profile_id) values ('denuncia','Rui','r@x.pt','Perfil falso','este perfil é falso','${CLI}')`))
  assert.equal((await q(`select reporter_id from public.support_tickets where kind='denuncia'`))[0].reporter_id, PRO)
  assert.equal((await as(SUPPORT, () => q(`select count(*)::int n from public.support_tickets`)))[0].n, 6)
  await as(SUPPORT, () => ex(`update public.support_tickets set status='resolvido' where kind='denuncia'`))
  log('✔ support_tickets: RLS, validações e limite por hora')

  // 13. apagar a conta (como a função admin-gdpr faz, via auth.users) apaga tudo em cascata e o registo fica
  const before = (await q(`select count(*)::int n from public.admin_audit`))[0].n
  await ex(`delete from auth.users where id='${CLI}'`)
  assert.equal((await q(`select count(*)::int n from public.profiles where id='${CLI}'`))[0].n, 0)
  assert.equal((await q(`select count(*)::int n from public.gdpr_requests`))[0].n, 0)
  assert.equal((await q(`select count(*)::int n from public.admin_audit`))[0].n, before)
  assert.equal((await q(`select target_profile_id from public.support_tickets where kind='denuncia'`))[0].target_profile_id, null)
  log('✔ apagar conta: cascata funciona e o registo mantém-se')

  await db.close()
})
