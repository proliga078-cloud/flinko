// Achado da crítica de design: quando uma categoria tinha só 1 ou 2
// profissionais, a lista renderizava normalmente (.pros-list em coluna,
// gap:14px) e deixava uma área em branco enorme ao lado da coluna de
// filtros, que é bem mais alta. Não é o mesmo bug do empty-state (0
// resultados, já coberto por homepage-empty-categories.spec.js) — aqui HÁ
// resultados reais a mostrar, só que poucos. O fix acrescenta um cartão
// ".sparse-nudge" a convidar a publicar um pedido, como mais um item da
// própria .pros-list, só quando 1<=total<=2.
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

function proRow(id, name) {
  return { id, name, category: 'Jardineiros', location: 'Lisboa', plan: 'free', verified: false };
}

test.describe('jardineiros.html — cartão de sugestão quando há poucos profissionais', () => {
  test('1 resultado: mostra o cartão de sugestão, no singular, a apontar para a categoria certa', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 1, data: [proRow('p1', 'Ana Jardineira')] },
        reviews: { data: [] },
      },
    });
    await page.goto('/jardineiros.html');
    await page.waitForFunction(() => document.querySelector('.pro-card') !== null);

    // O resultado real continua a aparecer normalmente.
    await expect(page.locator('.pro-card')).toHaveCount(1);

    const nudge = page.locator('.sparse-nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge.locator('h3')).toHaveText('Só há 1 profissional nesta categoria por agora');
    await expect(nudge.locator('a.btn-solid')).toHaveAttribute('href', 'pedidos.html?publicar=1&cat=Jardineiros');
  });

  test('2 resultados: mostra o cartão de sugestão no plural', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 2, data: [proRow('p1', 'Ana Jardineira'), proRow('p2', 'Bruno Jardineiro')] },
        reviews: { data: [] },
      },
    });
    await page.goto('/jardineiros.html');
    await page.waitForFunction(() => document.querySelectorAll('.pro-card').length === 2);

    const nudge = page.locator('.sparse-nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge.locator('h3')).toHaveText('Só há 2 profissionais nesta categoria por agora');
  });

  test('3 ou mais resultados: não mostra o cartão de sugestão (a lista já preenche o espaço)', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          count: 3,
          data: [proRow('p1', 'Ana Jardineira'), proRow('p2', 'Bruno Jardineiro'), proRow('p3', 'Carlos Jardineiro')],
        },
        reviews: { data: [] },
      },
    });
    await page.goto('/jardineiros.html');
    await page.waitForFunction(() => document.querySelectorAll('.pro-card').length === 3);

    await expect(page.locator('.sparse-nudge')).toHaveCount(0);
  });

  test('0 resultados: continua a mostrar só o empty-state, nunca o cartão de sugestão', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 0, data: [] },
        reviews: { data: [] },
      },
    });
    await page.goto('/jardineiros.html');
    await page.waitForFunction(() => document.querySelector('.empty-state h3') !== null);

    await expect(page.locator('.sparse-nudge')).toHaveCount(0);
  });
});
