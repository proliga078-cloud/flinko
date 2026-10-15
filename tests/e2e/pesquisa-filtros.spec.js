// Pesquisa de profissionais (categoria.html) no browser.
//
// REGRESSÃO: os filtros de avaliação/plano/preço e a ordenação só eram aplicados
// aos 12 resultados da página atual (a base de dados já tinha paginado), por isso
// "4+ estrelas" ignorava quem estava nas outras páginas e a contagem era errada.
// Aqui há 30 profissionais (3 páginas) e os melhores estão nas últimas posições.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const pros = Array.from({ length: 30 }, (_, i) => ({
  id: 'p' + (i + 1), name: 'Profissional ' + String(i + 1).padStart(2, '0'), slug: null, category: 'Eletricistas',
  location: 'Porto – Porto', plan: 'free', verified: false, bio: '', photo_url: null,
  created_at: '2026-02-' + String(28 - i).padStart(2, '0') + 'T00:00:00Z', // p1 é o mais recente
  avg_response_minutes: null, response_sample_count: 0,
}));
// Os três últimos (que a paginação antiga mandava para a página 3) são os melhores.
pros[27].plan = 'free';
const reviews = [
  ...['p28', 'p29', 'p30'].flatMap((id) => [5, 5].map((rating) => ({ professional_id: id, rating }))),
  { professional_id: 'p1', rating: 3 },
];
pros[29].avg_response_minutes = 12; pros[29].response_sample_count = 6;
pros[15].avg_response_minutes = 40; pros[15].response_sample_count = 4;
pros[4].plan = 'pro'; // Pro: primeiro lugar

async function abrir(page) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: null,
    tableData: {
      profiles: { data: pros, count: pros.length },
      reviews: { data: reviews },
      services: { data: [{ professional_id: 'p30', price_from: 20 }, { professional_id: 'p3', price_from: 60 }] },
    },
  });
  await page.goto('/categoria.html?cat=Eletricistas');
  await expect(page.locator('#results-count')).toContainText('30');
}
const nomes = (page) => page.locator('.pro-card-name').allTextContents();
// Os filtros vivem numa gaveta lateral (botão "Filtros"): abre-se para mexer e fecha-se para ver os resultados.
async function comFiltros(page, fn) {
  await page.click('.mobile-filter-btn');
  await fn();
  await page.evaluate(() => closeSidebar());
}

test('sem filtros: 30 resultados em 3 páginas de 12, Pro à frente', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.pro-card')).toHaveCount(12);
  expect((await nomes(page))[0]).toBe('Profissional 05');
  await expect(page.locator('#pagination .page-btn.active')).toHaveText('1');
  await expect(page.locator('#pagination .page-btn', { hasText: '3' })).toHaveCount(1);
});

test('REGRESSÃO: "4+ estrelas" encontra os profissionais que estavam na página 3', async ({ page }) => {
  await abrir(page);
  await comFiltros(page, () => page.check('input[name="rating"][value="4"]'));
  await expect(page.locator('#results-count')).toContainText('3');
  await expect(page.locator('.pro-card')).toHaveCount(3);
  expect((await nomes(page)).sort()).toEqual(['Profissional 28', 'Profissional 29', 'Profissional 30']);
  await expect(page.locator('#pagination .page-btn')).toHaveCount(0);
});

test('REGRESSÃO: ordenar por melhor avaliação usa todos os profissionais, não só a 1.ª página', async ({ page }) => {
  await abrir(page);
  await page.selectOption('#sort-select', 'rating');
  const n = await nomes(page);
  expect(n[0]).toBe('Profissional 05'); // Pro fica sempre à frente
  expect(n.slice(1, 4).sort()).toEqual(['Profissional 28', 'Profissional 29', 'Profissional 30']);
});

test('mudar um filtro volta à página 1; mudar de página mantém o filtro', async ({ page }) => {
  await abrir(page);
  await page.click('#pagination .page-btn:has-text("3")');
  await expect(page.locator('#pagination .page-btn.active')).toHaveText('3');
  await expect(page.locator('.pro-card')).toHaveCount(6);
  await page.selectOption('#sort-select', 'newest');
  await expect(page.locator('#pagination .page-btn.active')).toHaveText('1');
});

test('filtro "responde em menos de 1h" e ordenação por tempo de resposta', async ({ page }) => {
  await abrir(page);
  await comFiltros(page, () => page.check('#f-fast'));
  await expect(page.locator('#results-count')).toContainText('2');
  expect((await nomes(page)).sort()).toEqual(['Profissional 16', 'Profissional 30']);
  await comFiltros(page, () => page.uncheck('#f-fast'));
  await page.selectOption('#sort-select', 'response');
  const n = await nomes(page);
  expect(n.slice(1, 3)).toEqual(['Profissional 30', 'Profissional 16']); // depois do Pro (05)
});

test('filtro de preço aplica-se a todos e "Limpar filtros" repõe os 30', async ({ page }) => {
  await abrir(page);
  await comFiltros(page, async () => {
    await page.fill('#price-min', '10');
    await page.fill('#price-max', '30');
    await page.click('.btn-apply');
  });
  await expect(page.locator('#results-count')).toContainText('1');
  expect(await nomes(page)).toEqual(['Profissional 30']);
  await comFiltros(page, () => page.click('.btn-clear'));
  await expect(page.locator('#results-count')).toContainText('30');
});

test('sem resultados com os filtros: mostra o estado vazio e a contagem 0', async ({ page }) => {
  await abrir(page);
  await comFiltros(page, async () => {
    await page.check('input[name="rating"][value="4.5"]');
    await page.check('#f-fast');
  });
  await expect(page.locator('.pro-card')).toHaveCount(1); // p30 tem 5★ e responde em 12 min
  await comFiltros(page, async () => {
    await page.uncheck('#f-fast');
    await page.fill('#price-min', '500');
    await page.click('.btn-apply');
  });
  await expect(page.locator('#results-count')).toContainText('0');
  await expect(page.locator('.empty-state')).toBeVisible();
});
