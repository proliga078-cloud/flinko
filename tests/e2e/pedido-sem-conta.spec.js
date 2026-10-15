// pedidos.html: publicar um pedido sem ter conta. O pedido preenche-se primeiro
// e a conta cria-se no fim, na mesma janela (antes "Publicar" mandava logo para
// o login e o cliente perdia o que tinha escrito).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const SESSAO = { access_token: 'tok', user: { id: 'cli-1', email: 'ana@example.com' } };

async function abrir(page, cfg = {}, url = '/pedidos.html?publicar=1') {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/notify-request', (route) => route.fulfill({ status: 200, body: '{"sent":0}' }));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, { tableData: { requests: { data: [] } }, ...cfg });
  await page.goto(url);
}

async function preencher(page) {
  await page.fill('#m-title', 'Trocar quadro elétrico');
  await page.selectOption('#m-cat', 'Eletricistas');
  await page.selectOption('#m-district', 'Braga');
  await page.fill('#m-city', 'Guimarães');
}

test('?publicar=1 abre logo o formulário, sem pedir login primeiro', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
  await expect(page.locator('#m-title')).toBeVisible();
  expect(page.url()).toContain('/pedidos.html');
});

test('sem conta: "Publicar" pede nome/email/password na mesma janela e publica o pedido', async ({ page }) => {
  await abrir(page, { signUpUser: SESSAO.user, signUpSession: SESSAO });
  await preencher(page);
  await page.click('#submit-btn');
  await expect(page.locator('#modal-account')).toBeVisible();
  await expect(page.locator('#modal-body')).toBeHidden();
  await page.fill('#acc-name', 'Ana Silva');
  await page.fill('#acc-email', 'ana@example.com');
  await page.fill('#acc-password', 'segredo123');
  await page.click('#acc-btn');
  await expect(page.locator('#m-success')).toContainText('Pedido publicado');
  const calls = await page.evaluate(() => ({ signUp: window.__signUpCalls, rpc: window.__rpcCalls, insert: window.__insertCalls }));
  expect(calls.signUp).toEqual([{ email: 'ana@example.com', password: 'segredo123', options: { data: { full_name: 'Ana Silva', account_type: 'client' } } }]);
  expect(calls.rpc).toContainEqual({ fnName: 'create_my_profile_if_missing', args: { p_name: 'Ana Silva', p_account_type: 'client' } });
  const pedido = calls.insert.find((c) => c.table === 'requests').row;
  expect(pedido).toMatchObject({ client_id: 'cli-1', title: 'Trocar quadro elétrico', category: 'Eletricistas', location: 'Braga – Guimarães' });
});

test('"Já tenho conta": entra com email e password e publica', async ({ page }) => {
  await abrir(page, { loginUser: SESSAO.user, loginSession: SESSAO });
  await preencher(page);
  await page.click('#submit-btn');
  await page.getByRole('tab', { name: 'Já tenho conta' }).click();
  await expect(page.locator('#acc-name-group')).toBeHidden();
  await page.fill('#acc-email', 'ana@example.com');
  await page.fill('#acc-password', 'segredo123');
  await page.click('#acc-btn');
  await expect(page.locator('#m-success')).toContainText('Pedido publicado');
  expect(await page.evaluate(() => window.__signInCalls.length)).toBe(1);
  // Conta sem perfil (registo a meio) fica com perfil de cliente; se já existir, o servidor não muda nada.
  expect(await page.evaluate(() => window.__rpcCalls)).toContainEqual({ fnName: 'create_my_profile_if_missing', args: { p_name: 'ana', p_account_type: 'client' } });
});

test('conta que precisa de confirmar email: o pedido fica guardado e volta preenchido depois', async ({ page }) => {
  await abrir(page, { signUpUser: { id: 'x' }, signUpSession: null, loginError: 'Email not confirmed' });
  await preencher(page);
  await page.click('#submit-btn');
  await page.fill('#acc-name', 'Ana Silva');
  await page.fill('#acc-email', 'ana@example.com');
  await page.fill('#acc-password', 'segredo123');
  await page.click('#acc-btn');
  // Lê as duas mensagens juntas: este teste falha de vez em quando no GitHub com
  // #m-success vazio, e assim a falha mostra também o erro que a página deu.
  await expect.poll(() => page.evaluate(() => ['m-success', 'm-error'].map((id) => document.getElementById(id).textContent).join(' | erro: ')))
    .toContain('Confirma o email');
  expect(await page.evaluate(() => (window.__insertCalls || []).length)).toBe(0);

  // volta já com sessão (depois de confirmar): o formulário abre sozinho, preenchido
  await page.evaluate((s) => { window.__testAuthConfig.session = s; }, SESSAO);
  await page.addInitScript((s) => { window.__testAuthConfig = { ...(window.__testAuthConfig || {}), session: s }; }, SESSAO);
  await page.goto('/pedidos.html');
  await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
  await expect(page.locator('#m-title')).toHaveValue('Trocar quadro elétrico');
  await expect(page.locator('#m-success')).toContainText('ficou guardado');
});

test('campos em falta: não avança para a conta', async ({ page }) => {
  await abrir(page);
  await page.click('#submit-btn');
  await expect(page.locator('#m-error')).toContainText('Preenche');
  await expect(page.locator('#modal-account')).toBeHidden();
});
