// Testes E2E de auth.html: a página real, tal como o browser a executa,
// com o SDK do Supabase substituído por um "duplo" controlável (ver
// fixtures/fake-supabase-sdk.js) para não depender de rede real nem de
// contas verdadeiras. Cobre validação de formulário e, sobretudo, dois
// comportamentos de segurança já existentes no código:
//  - proteção contra open-redirect (safeRedirect só aceita caminhos do
//    próprio site, nunca um domínio externo passado em ?redirect=)
//  - o email de admin ser sempre encaminhado para admin.html
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

test.describe('auth.html — login', () => {
  test('campos vazios mostram erro e não chamam o Supabase', async ({ page }) => {
    await withFakeSupabase(page, {});
    await page.goto('/auth.html');
    await page.click('#login-btn');
    await expect(page.locator('#login-msg')).toContainText('Preenche o email e a password');
    const calls = await page.evaluate(() => window.__signInCalls || []);
    expect(calls).toHaveLength(0);
  });

  test('credenciais erradas mostram mensagem genérica e não redireciona', async ({ page }) => {
    await withFakeSupabase(page, { loginError: 'Invalid login credentials' });
    await page.goto('/auth.html');
    await page.fill('#login-email', 'user@example.com');
    await page.fill('#login-password', 'wrongpass');
    await page.click('#login-btn');
    await expect(page.locator('#login-msg')).toContainText('Email ou password incorretos');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('auth.html');
  });

  test('login bem-sucedido redireciona para dashboard.html', async ({ page }) => {
    await withFakeSupabase(page, {
      loginUser: { id: 'user-1', email: 'user@example.com' },
      loginSession: { access_token: 'tok-1', user: { id: 'user-1', email: 'user@example.com' } }, rpcResults: { get_my_profile: [{ id: 'user-1' }] },
    });
    await page.goto('/auth.html');
    await page.fill('#login-email', 'user@example.com');
    await page.fill('#login-password', 'correctpass');
    await page.click('#login-btn');
    await page.waitForURL('**/dashboard.html');
  });

  test('login de conta admin (is_admin() = true no servidor) redireciona para admin.html', async ({ page }) => {
    await withFakeSupabase(page, {
      loginUser: { id: 'admin-1', email: 'admin@example.com' },
      loginSession: { access_token: 'tok-admin', user: { id: 'admin-1', email: 'admin@example.com' } },
      rpcResults: { is_admin: true },
    });
    await page.goto('/auth.html');
    await page.fill('#login-email', 'admin@example.com');
    await page.fill('#login-password', 'adminpass');
    await page.click('#login-btn');
    await page.waitForURL('**/admin.html');
  });

  test('?redirect= para um caminho do próprio site é respeitado', async ({ page }) => {
    await withFakeSupabase(page, {
      loginUser: { id: 'user-1', email: 'user@example.com' },
      loginSession: { access_token: 'tok-1', user: { id: 'user-1', email: 'user@example.com' } }, rpcResults: { get_my_profile: [{ id: 'user-1' }] },
    });
    await page.goto('/auth.html?redirect=%2Fpedidos.html');
    await page.fill('#login-email', 'user@example.com');
    await page.fill('#login-password', 'correctpass');
    await page.click('#login-btn');
    await page.waitForURL('**/pedidos.html');
  });

  test('SEGURANÇA: ?redirect= para um domínio externo é ignorado (proteção anti open-redirect)', async ({ page }) => {
    await withFakeSupabase(page, {
      loginUser: { id: 'user-1', email: 'user@example.com' },
      loginSession: { access_token: 'tok-1', user: { id: 'user-1', email: 'user@example.com' } }, rpcResults: { get_my_profile: [{ id: 'user-1' }] },
    });
    await page.goto('/auth.html?redirect=https%3A%2F%2Fsite-malicioso-qualquer.com%2Fphishing');
    await page.fill('#login-email', 'user@example.com');
    await page.fill('#login-password', 'correctpass');
    await page.click('#login-btn');
    // Nunca deve sair do site: tem de cair no destino por omissão (dashboard.html).
    await page.waitForURL('**/dashboard.html');
    expect(page.url()).not.toContain('site-malicioso-qualquer.com');
  });
});

test.describe('auth.html — registo', () => {
  test('sem escolher "contratar" ou "oferecer serviços" mostra erro', async ({ page }) => {
    await withFakeSupabase(page, {});
    await page.goto('/auth.html?tab=register');
    await page.fill('#reg-name', 'Maria Silva');
    await page.fill('#reg-email', 'maria@example.com');
    await page.fill('#reg-password', 'password123');
    await page.click('#reg-btn');
    await expect(page.locator('#reg-msg')).toContainText('Escolhe se queres contratar ou oferecer');
    const calls = await page.evaluate(() => window.__signUpCalls || []);
    expect(calls).toHaveLength(0);
  });

  test('password com menos de 6 caracteres é rejeitada antes de chamar o Supabase', async ({ page }) => {
    await withFakeSupabase(page, {});
    await page.goto('/auth.html?tab=register&intent=client');
    await page.fill('#reg-name', 'Maria Silva');
    await page.fill('#reg-email', 'maria@example.com');
    await page.fill('#reg-password', '123');
    await page.click('#reg-btn');
    await expect(page.locator('#reg-msg')).toContainText('pelo menos 6 caracteres');
    const calls = await page.evaluate(() => window.__signUpCalls || []);
    expect(calls).toHaveLength(0);
  });

  test('email já registado mostra mensagem específica', async ({ page }) => {
    await withFakeSupabase(page, { signUpError: 'User already registered' });
    await page.goto('/auth.html?tab=register&intent=professional');
    await page.fill('#reg-name', 'João Prof');
    await page.fill('#reg-email', 'ja-existe@example.com');
    await page.fill('#reg-password', 'password123');
    await page.click('#reg-btn');
    await expect(page.locator('#reg-msg')).toContainText('já está registado');
  });

  test('registo sem sessão imediata (confirmação por email) mostra o aviso certo, sem redirecionar', async ({ page }) => {
    // signUp devolve um user mas sem sessão (confirmação de email exigida),
    // e o login automático a seguir também não devolve sessão.
    await withFakeSupabase(page, {
      signUpUser: { id: 'new-user-1' },
      signUpSession: null,
      loginSession: null,
    });
    await page.goto('/auth.html?tab=register&intent=client');
    await page.fill('#reg-name', 'Nova Pessoa');
    await page.fill('#reg-email', 'nova@example.com');
    await page.fill('#reg-password', 'password123');
    await page.click('#reg-btn');
    await expect(page.locator('#reg-msg')).toContainText('Verifica o email');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('auth.html');
  });

  test('registo com sessão imediata cria o perfil (RPC) e redireciona conforme o tipo de conta', async ({ page }) => {
    await withFakeSupabase(page, {
      signUpUser: { id: 'new-user-2' },
      signUpSession: { access_token: 'tok-new', user: { id: 'new-user-2' } },
    });
    await page.goto('/auth.html?tab=register&intent=client');
    await page.fill('#reg-name', 'Cliente Novo');
    await page.fill('#reg-email', 'cliente@example.com');
    await page.fill('#reg-password', 'password123');
    await page.click('#reg-btn');
    // O RPC de criação de perfil é chamado antes do redirect (que só
    // acontece 800ms depois) — verificamos aqui, antes de navegar, porque
    // window.__rpcCalls deixa de existir assim que a página muda.
    await page.waitForFunction(() => (window.__rpcCalls || []).length > 0);
    const rpcCalls = await page.evaluate(() => window.__rpcCalls || []);
    expect(rpcCalls.some((c) => c.fnName === 'create_my_profile_if_missing')).toBe(true);
    await page.waitForURL('**/pedidos.html');
  });
});

// Registo que ficou a meio (conta sem perfil): antes de criar o perfil,
// pergunta se a pessoa quer contratar ou oferecer serviços.
test.describe('auth.html — conta sem perfil', () => {
  // As chamadas ao servidor ficam também em sessionStorage, para as ler depois de a página mudar.
  const guardaRpc = (page) => page.addInitScript(() => { const a = []; a.push = function (x) { Array.prototype.push.call(this, x); try { const s = JSON.parse(sessionStorage.getItem('rpc') || '[]'); s.push(x); sessionStorage.setItem('rpc', JSON.stringify(s)); } catch (e) {} return this.length; }; window.__rpcCalls = a; });
  const rpcs = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('rpc') || '[]'));
  const SESS = { access_token: 'tok-9', user: { id: 'user-9', email: 'ana.silva@example.com', user_metadata: { name: 'Ana Silva' } } };

  test('login com conta sem perfil pergunta o tipo; "Contratar" cria perfil de cliente', async ({ page }) => {
    await guardaRpc(page);
    await withFakeSupabase(page, { loginUser: SESS.user, loginSession: SESS, rpcResults: { get_my_profile: [] } });
    await page.goto('/auth.html');
    await page.fill('#login-email', 'ana.silva@example.com');
    await page.fill('#login-password', 'segredo123');
    await page.click('#login-btn');
    await expect(page.locator('#form-choose')).toBeVisible();
    await expect(page.locator('#form-choose')).toContainText('Falta só um passo');
    await expect(page.locator('#tabs-wrap')).toBeHidden();
    await page.getByRole('button', { name: /Contratar/ }).click();
    await page.waitForURL('**/pedidos.html');
    const rpc = (await rpcs(page)).filter((c) => c.fnName === 'create_my_profile_if_missing');
    expect(rpc).toEqual([{ fnName: 'create_my_profile_if_missing', args: { p_name: 'Ana Silva', p_account_type: 'client' } }]);
  });

  test('"Oferecer serviços" cria perfil de profissional e vai para o painel', async ({ page }) => {
    await guardaRpc(page);
    await withFakeSupabase(page, { loginUser: SESS.user, loginSession: SESS, rpcResults: { get_my_profile: [] } });
    await page.goto('/auth.html');
    await page.fill('#login-email', 'ana.silva@example.com');
    await page.fill('#login-password', 'segredo123');
    await page.click('#login-btn');
    await page.getByRole('button', { name: /Oferecer serviços/ }).click();
    await page.waitForURL('**/dashboard.html');
    const rpc = (await rpcs(page)).find((c) => c.fnName === 'create_my_profile_if_missing');
    expect(rpc.args).toEqual({ p_name: 'Ana Silva', p_account_type: 'professional' });
  });

  test('conta com perfil: entra direto, sem perguntar', async ({ page }) => {
    await withFakeSupabase(page, { loginUser: SESS.user, loginSession: SESS, rpcResults: { get_my_profile: [{ id: 'user-9' }] } });
    await page.goto('/auth.html');
    await page.fill('#login-email', 'ana.silva@example.com');
    await page.fill('#login-password', 'segredo123');
    await page.click('#login-btn');
    await page.waitForURL('**/dashboard.html');
    expect(await page.evaluate(() => (window.__rpcCalls || []).some((c) => c.fnName === 'create_my_profile_if_missing'))).toBe(false);
  });

});
