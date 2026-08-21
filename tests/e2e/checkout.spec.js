// Testes E2E do início do checkout em pricing.html (assets/billing.js).
//
// Nota sobre uma fragilidade real encontrada ao escrever estes testes:
// pricing.html define a sua PRÓPRIA função `requestUpgrade(plan)` (um modal
// com link de email, claramente uma versão anterior a existir Stripe), mas
// depois carrega <script src="assets/billing.js"> que faz
// `window.requestUpgrade = async function(plan, evt){...}` — isto
// SOBRESCREVE a função local, porque billing.js corre depois. Ou seja: o
// botão "Mudar para Pro" (onclick="requestUpgrade('pro')") não abre o modal
// de email — dispara sempre o checkout real do Stripe. Isto funciona hoje,
// mas é frágil: se alguém reordenar os <script> ou remover a tag do
// billing.js (que está, de resto, colocada depois de </html>, fora do
// documento), o site volta a mostrar silenciosamente o modal de email morto,
// sem erro nenhum a avisar. Os testes abaixo fixam o comportamento atual
// (o Stripe é que dispara) precisamente para apanhar essa regressão se
// alguém alguma vez "arrumar" os scripts.
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

test('sem sessão: clicar em "Mudar para Pro" manda para o login, nunca chega a chamar o Stripe', async ({ page }) => {
  await withFakeSupabase(page, { session: null });
  let checkoutCalled = false;
  await page.route('**/.netlify/functions/create-checkout-session', (route) => {
    checkoutCalled = true;
    route.fulfill({ status: 200, body: JSON.stringify({ url: 'https://checkout.stripe.com/should-not-happen' }) });
  });

  await page.goto('/pricing.html');
  await page.click('a.plan-cta.btn-solid:has-text("Mudar para Pro")');
  await page.waitForURL('**/auth.html?tab=login&redirect=pricing.html');
  expect(checkoutCalled).toBe(false);
});

test('com sessão: clicar em "Mudar para Pro" chama create-checkout-session com o Authorization certo e redireciona para o Stripe', async ({ page }) => {
  const accessToken = 'access-token-do-utilizador-real';
  await withFakeSupabase(page, {
    session: { access_token: accessToken, user: { id: 'user-1', email: 'user@example.com' } },
  });

  let capturedAuthHeader = null;
  let capturedBody = null;
  await page.route('**/.netlify/functions/create-checkout-session', (route) => {
    capturedAuthHeader = route.request().headers()['authorization'];
    capturedBody = JSON.parse(route.request().postData());
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/fake-stripe-checkout.html' }) });
  });
  // Página de destino falsa só para o redirect final ter algo para carregar.
  await page.route('**/fake-stripe-checkout.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>fake stripe checkout</body></html>' })
  );

  await page.goto('/pricing.html');
  await page.click('a.plan-cta.btn-solid:has-text("Mudar para Pro")');

  await page.waitForURL('**/fake-stripe-checkout.html');
  expect(capturedAuthHeader).toBe(`Bearer ${accessToken}`);
  expect(capturedBody).toEqual({ plan: 'pro', billing: 'monthly' });
});

test('billing.js sobrepõe-se sempre à função local antiga de pricing.html (regressão a vigiar)', async ({ page }) => {
  // Este teste documenta explicitamente qual das duas implementações de
  // requestUpgrade("pro") está ativa. Se um dia passar a false, o site
  // voltou a mostrar o modal de email morto em vez do checkout Stripe.
  await withFakeSupabase(page, { session: null });
  await page.goto('/pricing.html');
  const isBillingJsVersion = await page.evaluate(() => window.requestUpgrade.toString().includes('create-checkout-session'));
  expect(isBillingJsVersion).toBe(true);
});

test('sem sessão: "Gerir subscrição" manda para o login em vez de chamar o portal', async ({ page }) => {
  await withFakeSupabase(page, { session: null });
  let portalCalled = false;
  await page.route('**/.netlify/functions/create-portal-session', (route) => {
    portalCalled = true;
    route.fulfill({ status: 200, body: JSON.stringify({ url: 'https://billing.stripe.com/should-not-happen' }) });
  });
  await page.goto('/pricing.html');
  await page.evaluate(() => window.manageBilling());
  await page.waitForURL('**/auth.html?tab=login&redirect=dashboard.html');
  expect(portalCalled).toBe(false);
});
