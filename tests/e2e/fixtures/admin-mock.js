// Simulador da API REST do Supabase e das funções Netlify para os testes do
// painel de gestão (admin.html). Ver tests/e2e/admin-gestao.spec.js.
const { expect } = require('@playwright/test');

const SB = 'https://cdwinidhtfxfxowflize.supabase.co';
const DAY = 864e5;
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();

const PRO = { id: 'pro-1', name: 'Rui Alves', account_type: 'professional', category: 'Eletricistas', location: 'Porto – Porto', plan: 'free', verified: false, suspended: false, is_admin: false, is_demo: false, created_at: iso(20), bio: 'Olá', photo_url: 'x' };
const CLI = { id: 'cli-1', name: 'Ana Cliente', account_type: 'client', plan: 'free', verified: false, suspended: false, is_admin: false, is_demo: false, created_at: iso(5) };
const ME = { id: 'admin-1', name: 'Admin', account_type: 'professional', is_admin: true, is_demo: false, plan: 'free', created_at: iso(100) };

function baseTables() {
  return {
    profiles: [ME, PRO, CLI],
    profile_private: [{ profile_id: 'pro-1', phone: '912345678' }],
    reviews: [
      { id: 'rev-ok', professional_id: 'pro-1', client_id: 'cli-1', reviewer_name: 'Ana', rating: 5, comment: 'Muito bom', created_at: iso(3) },
      { id: 'rev-bad', professional_id: 'pro-1', client_id: null, reviewer_name: 'Troll', rating: 1, comment: 'isto é uma burla, merda', created_at: iso(2) },
    ],
    requests: [{ id: 'req-1', client_id: 'cli-1', title: 'Instalar tomadas', description: 'Três tomadas na sala', category: 'Eletricistas', location: 'Porto', status: 'open', created_at: iso(3) }],
    verification_requests: [{ id: 'ver-1', profile_id: 'pro-1', status: 'pending', documents: [{ path: 'pro-1/cc.pdf', name: 'Cartão de cidadão' }], notes: 'Envio o CC', created_at: iso(4) }],
    gdpr_requests: [{ id: 'gd-1', profile_id: 'cli-1', request_type: 'delete', status: 'pending', created_at: iso(10) }],
    support_tickets: [
      { id: 't-1', kind: 'contacto', name: 'Zé', email: 'ze@exemplo.pt', subject: 'Dúvida sobre planos', message: 'Quanto custa o Pro?', status: 'aberto', priority: 'media', created_at: iso(1) },
      { id: 't-2', kind: 'denuncia', name: 'Maria', email: 'maria@exemplo.pt', subject: 'Perfil falso · Rui Alves', message: 'Não é eletricista', target_profile_id: 'pro-1', status: 'aberto', priority: 'media', created_at: iso(1) },
    ],
    admin_audit: [{ id: 1, at: iso(0.1), actor_email: 'outro@flinko.pt', action: 'perfil_alterado', target_type: 'profile', target_id: 'pro-1', summary: 'Rui Alves: suspended', details: {} }],
    admin_tasks: [], admin_crm: [], admin_settings: [], admin_items: [],
  };
}

// Simula o Supabase e as funções Netlify. Devolve o registo de pedidos feitos.
async function openAdmin(page, { role = 'owner', tables = {}, fail = {}, fns = {}, view, me = {}, path = '/admin.html' } = {}) {
  const T = Object.assign(baseTables(), tables), calls = [];
  await page.addInitScript(() => localStorage.setItem('fk_session', JSON.stringify({ access_token: 'tok', refresh_token: 'r', user: { id: 'admin-1', email: 'dono@flinko.pt' } })));
  await page.route(SB + '/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ method, path: url.pathname, search: url.search, body });
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return route.fulfill({ json: { signedURL: '/object/sign/verification-docs/pro-1/cc.pdf?token=x' } });
    const m = url.pathname.match(/^\/rest\/v1\/(.+)$/); if (!m) return route.fulfill({ status: 404, json: {} });
    const name = m[1], q = url.searchParams;
    if (fail[name]) return route.fulfill({ status: fail[name].status, json: { message: fail[name].message } });
    if (name.startsWith('rpc/')) {
      if (name === 'rpc/get_my_profile') return route.fulfill({ json: [{ ...ME, admin_role: role, ...me }] });
      if (name === 'rpc/admin_profiles_private') {
        const priv = T.profiles.map(({ id, is_admin, admin_role, plan_expires_at, stripe_subscription_id, ai_profile_builder_paid_at, credits }) => ({ id, is_admin, admin_role, plan_expires_at, stripe_subscription_id, ai_profile_builder_paid_at, credits }));
        const off = Number(q.get('offset') || 0), lim = q.has('limit') ? Number(q.get('limit')) : priv.length;
        return route.fulfill({ json: priv.slice(off, off + lim) });
      }
      if (name === 'rpc/admin_visit_rows') return route.fulfill({ json: Number(q.get('offset')) ? [] : T.visits || [{ day: new Date().toISOString().slice(0, 10), visitor_id: 'v1', user_id: null, path: '/', ref_host: 'google.com', n: 3, last_at: iso(0.1) }] });
      if (name === 'rpc/admin_event_counts') return route.fulfill({ json: T.events || [] });
      if (name === 'rpc/admin_team') return route.fulfill({ json: [{ profile_id: 'admin-1', name: 'Admin', email: 'dono@flinko.pt', admin_role: role }] });
      if (name === 'rpc/admin_pro_emails') return route.fulfill({ json: [{ profile_id: 'pro-1', email: 'rui@exemplo.pt' }, { profile_id: 'cli-1', email: 'ana@exemplo.pt' }] });
      return route.fulfill({ status: 200, json: null });
    }
    if (method !== 'GET') return route.fulfill({ status: 204, body: '' });
    const rows = T[name] || [];
    const off = Number(q.get('offset') || 0), lim = q.has('limit') ? Number(q.get('limit')) : rows.length;
    return route.fulfill({ json: rows.slice(off, off + lim) });
  });
  await page.route('**/.netlify/functions/*', async (route) => {
    const req = route.request(), fname = new URL(req.url()).pathname.split('/').pop(), body = JSON.parse(req.postData() || '{}');
    calls.push({ fn: fname, body });
    const h = fns[fname];
    const res = typeof h === 'function' ? h(body) : h;
    return route.fulfill(res && res.status ? res : { json: res || {} });
  });
  page.on('dialog', (d) => d.accept());
  // Painel novo (gestao.html): mesmo simulador, outra página.
  if (path !== '/admin.html') { await page.goto(path); return calls; }
  await page.goto('/admin.html');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#main h1')).toHaveText('Painel');
  if (view) await page.evaluate((v) => go(v), view);
  return calls;
}
const modalOk = (page) => page.locator('#modal #myes').click();

module.exports = { openAdmin, modalOk, baseTables, PRO, CLI, ME, iso, DAY };
