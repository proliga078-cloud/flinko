// Melhorias do perfil público (profile.html):
//  1. barra fixa "Enviar mensagem" no telemóvel — a caixa de contacto normal fica
//     no fim da página nesses ecrãs, por isso o botão principal estava escondido;
//  2. resumo das avaliações por número de estrelas (5★ ... 1★).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const PRO = {
  id: 'pro-1', name: 'Ana Jardineira', bio: 'Bio', category: 'Jardineiros', location: 'Lisboa – Lisboa',
  slug: null, plan: 'free', verified: true, created_at: '2026-01-01T00:00:00Z',
};

async function abrir(page, { session = null, reviews = [] } = {}) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session,
    tableData: { profiles: { data: [PRO] }, reviews: { data: reviews } },
  });
  await page.goto('/profile.html?id=pro-1');
  await expect(page.locator('.profile-name')).toContainText('Ana Jardineira');
}

test.describe('profile.html — barra fixa de contacto (telemóvel)', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('aparece no telemóvel, mostra o nome e leva ao login quando não há sessão', async ({ page }) => {
    await abrir(page);
    const barra = page.locator('#sticky-cta');
    await expect(barra).toBeVisible();
    await expect(page.locator('#sticky-name')).toHaveText('Ana Jardineira');
    await page.click('#sticky-btn');
    await page.waitForURL(/auth\.html.*redirect=/);
  });

  test('o próprio dono do perfil não vê a barra', async ({ page }) => {
    await abrir(page, { session: { access_token: 't', user: { id: 'pro-1', email: 'ana@example.com' } } });
    await page.waitForTimeout(400);
    await expect(page.locator('#sticky-cta')).toBeHidden();
  });

  test('esconde-se quando o botão da caixa de contacto já está visível no ecrã', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#sticky-cta')).toBeVisible();
    await page.locator('#msg-btn').scrollIntoViewIfNeeded();
    await expect(page.locator('#sticky-cta')).toBeHidden();
  });
});

test.describe('profile.html — barra fixa não aparece no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('em ecrã largo a barra fica escondida', async ({ page }) => {
    await abrir(page);
    await page.waitForTimeout(400);
    await expect(page.locator('#sticky-cta')).toBeHidden();
  });
});

test.describe('profile.html — resumo de avaliações por estrelas', () => {
  test('mostra a distribuição correta com 2 ou mais avaliações', async ({ page }) => {
    const mk = (id, rating) => ({ id, professional_id: 'pro-1', rating, comment: 'ok', reviewer_name: 'Cliente ' + id, created_at: '2026-02-01T00:00:00Z' });
    await abrir(page, { reviews: [mk('a', 5), mk('b', 5), mk('c', 5), mk('d', 4)] });
    const linhas = page.locator('#rating-breakdown .rb-row');
    await expect(linhas).toHaveCount(5);
    await expect(linhas.nth(0)).toContainText('5 ★');
    await expect(linhas.nth(0).locator('.rb-count')).toHaveText('3');
    await expect(linhas.nth(1).locator('.rb-count')).toHaveText('1');
    await expect(linhas.nth(0).locator('.rb-fill')).toHaveAttribute('style', /width:\s*75%/);
    await expect(linhas.nth(4).locator('.rb-count')).toHaveText('0');
  });

  test('com 0 ou 1 avaliação não mostra o resumo (seria ruído)', async ({ page }) => {
    await abrir(page, { reviews: [{ id: 'a', professional_id: 'pro-1', rating: 5, comment: 'ok', reviewer_name: 'X', created_at: '2026-02-01T00:00:00Z' }] });
    await expect(page.locator('.review-item')).toHaveCount(1);
    await expect(page.locator('#rating-breakdown')).toHaveCount(0);
  });
});
