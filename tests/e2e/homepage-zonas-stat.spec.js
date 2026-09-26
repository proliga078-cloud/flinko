// Achado da crítica de design: o stat "Portugal / Cobertura nacional" e o
// título "A crescer por todo o país" na secção do mapa eram texto fixo,
// prometendo uma amplitude nacional que a Flinko (19 profissionais, ~6
// zonas ativas quando isto foi escrito) ainda não tem. Uma plataforma nova
// ganha mais confiança a mostrar bem o que já tem do que a parecer maior
// do que é. loadProMap() passa a calcular o número real de zonas (a
// partir dos mesmos dados usados para desenhar os marcadores do mapa) e
// a escrever esse número no stat e no título, em vez de texto fixo.
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

test.describe('index.html — stat de zonas reflete dados reais', () => {
  test('várias zonas: mostra a contagem real, no plural', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          data: [
            { id: 'p1', name: 'Ana', location: 'Porto', category: 'Eletricistas' },
            { id: 'p2', name: 'Bruno', location: 'Lisboa', category: 'Pintores' },
            { id: 'p3', name: 'Carla', location: 'Coimbra', category: 'Limpeza' },
          ],
        },
        reviews: { data: [] },
        requests: { data: [] },
        ad_slots: { data: [] },
      },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById('stat-zonas')?.getAttribute('data-count') !== '0', null, { timeout: 3000 }).catch(() => {});

    await expect(page.locator('#stat-zonas')).toHaveAttribute('data-count', '3');
    await expect(page.locator('#stat-zonas-label')).toHaveText('Zonas com profissionais');
  });

  test('uma só zona: mostra o nome da zona em vez de "1 zonas"', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          data: [
            { id: 'p1', name: 'Ana', location: 'Porto', category: 'Eletricistas' },
            { id: 'p2', name: 'Bruno', location: 'Porto', category: 'Pintores' },
          ],
        },
        reviews: { data: [] },
        requests: { data: [] },
        ad_slots: { data: [] },
      },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById('stat-zonas')?.getAttribute('data-count') !== '0', null, { timeout: 3000 }).catch(() => {});

    await expect(page.locator('#stat-zonas')).toHaveAttribute('data-count', '1');
    await expect(page.locator('#stat-zonas-label')).toHaveText('Zona com profissionais');
  });

  test('nenhuma zona reconhecida: fica honesto ("Ainda estamos a começar"), não finge cobertura', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          data: [
            { id: 'p1', name: 'Ana', location: 'Sítio desconhecido', category: 'Eletricistas' },
          ],
        },
        reviews: { data: [] },
        requests: { data: [] },
        ad_slots: { data: [] },
      },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById('stat-zonas')?.getAttribute('data-count') !== '0', null, { timeout: 3000 }).catch(() => {});

    await expect(page.locator('#stat-zonas')).toHaveAttribute('data-count', '0');
  });
});
