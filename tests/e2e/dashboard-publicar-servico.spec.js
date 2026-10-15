// Publicar serviços fica fácil: item "Serviços" no menu e cartão de publicação rápida no Resumo.
// Motivo: 16 de 26 profissionais nunca publicaram serviços; o separador estava escondido dentro de "O Meu Perfil".
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function abrir(page, perfilExtra, servicos) {
  const p = { id: 'u1', name: 'Ana', plan: 'free', account_type: 'professional', category: 'Eletricistas', location: 'Porto', bio: 'x', photo_url: 'https://example.com/f.jpg', notify_email: true, notify_digest: true, ...perfilExtra };
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(/^https?:\/\/(?!localhost)/, (route) => (route.request().url() === SUPABASE_CDN_URL ? route.fallback() : route.abort()));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: { access_token: 'tok', user: { id: 'u1', email: 'a@example.com' } },
    rpcResults: { get_my_profile: [p] },
    tableData: { plan_limits: { data: [] }, services: { data: Array.from({ length: servicos }, (_, i) => ({ id: 's' + i, title: 'S' + i })), count: servicos } },
  });
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => typeof showPage === 'function');
}

test('o menu lateral tem "Serviços" e abre o formulário', async ({ page }) => {
  await abrir(page, {}, 0);
  const item = page.locator('.nav-item[data-page="services"]');
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.locator('#srv-title')).toBeVisible();
  await expect(item).toHaveClass(/active/);
  await expect(page.locator('.nav-item[data-page="profile"]')).not.toHaveClass(/active/);
});

test('sem serviços e com categoria: o Resumo mostra o cartão de publicação rápida e publica', async ({ page }) => {
  await abrir(page, {}, 0);
  const card = page.locator('#quick-service');
  await expect(card).toBeVisible();
  await page.fill('#qs-title', 'Instalação elétrica');
  await page.fill('#qs-price', '40');
  await page.click('#qs-btn');
  await expect(card).toBeHidden();
  await expect(page.locator('[role="status"]')).toContainText('Serviço publicado');
});

test('o cartão exige o nome do serviço', async ({ page }) => {
  await abrir(page, {}, 0);
  await page.click('#qs-btn');
  await expect(page.locator('#qs-error')).toContainText('nome do serviço');
  await expect(page.locator('#quick-service')).toBeVisible();
});

test('com serviços já publicados, o cartão não aparece', async ({ page }) => {
  await abrir(page, {}, 3);
  await expect(page.locator('#quick-service')).toBeHidden();
});

test('sem categoria, o cartão não aparece (primeiro é preciso escolher a categoria)', async ({ page }) => {
  await abrir(page, { category: null }, 0);
  await expect(page.locator('#quick-service')).toBeHidden();
});

test('clientes não veem o cartão nem o item Serviços', async ({ page }) => {
  await abrir(page, { account_type: 'client', category: null }, 0);
  await expect(page.locator('#quick-service')).toBeHidden();
  await expect(page.locator('.nav-item[data-page="services"]')).toBeHidden();
});
