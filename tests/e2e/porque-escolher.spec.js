// Testes E2E de porque-escolher.html — cobre o comportamento honesto de
// prova social introduzido para substituir os testemunhos/estatísticas
// fabricados: sem avaliações reais mostra o estado vazio explícito, e
// com avaliações reais mostra-as (sem inventar nada). O SDK do Supabase
// é substituído pelo duplo controlável em fixtures/fake-supabase-sdk.js.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

test.describe('porque-escolher.html — prova social honesta', () => {
  test('sem avaliações reais: mostra o estado vazio, nunca os cartões', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          count: 11,
          data: [
            { location: 'Porto – Penafiel' },
            { location: 'Braga – Braga' },
            { location: 'Braga – Guimarães' },
            { location: 'Aveiro – Aveiro' },
          ],
        },
        reviews: { data: [] },
      },
    });
    await page.goto('/porque-escolher.html');
    await expect(page.locator('#sem-testemunhos-pw')).toBeVisible();
    await expect(page.locator('#sem-testemunhos-pw')).toContainText('preferimos não inventar');
    await expect(page.locator('#testimonials-grid')).toBeHidden();
    await expect(page.locator('#verify-pros')).toHaveText('11');
    // 4 perfis mas só 3 distritos distintos (Porto, Braga, Aveiro) — a contagem não pode ser "por perfil".
    await expect(page.locator('#verify-districts')).toHaveText('3');
  });

  test('com avaliações reais: mostra os cartões e esconde o estado vazio', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          count: 11,
          data: [
            { id: 'client-1', name: 'Ana Ferreira', category: null, location: 'Porto' },
            { id: 'pro-1', name: 'João Silva', category: 'Eletricista', location: 'Maia' },
          ],
        },
        reviews: {
          data: [
            { rating: 5, comment: 'Trabalho impecável, recomendo.', client_id: 'client-1', professional_id: 'pro-1' },
          ],
        },
      },
    });
    await page.goto('/porque-escolher.html');
    await expect(page.locator('#testimonials-grid')).toBeVisible();
    await expect(page.locator('#testimonials-grid .t-card')).toHaveCount(1);
    await expect(page.locator('#testimonials-grid')).toContainText('Trabalho impecável, recomendo.');
    await expect(page.locator('#testimonials-grid')).toContainText('Ana Ferreira');
    await expect(page.locator('#testimonials-grid')).toContainText('avaliou João Silva');
    await expect(page.locator('#sem-testemunhos-pw')).toBeHidden();
  });

  test('não afirma estatísticas de avaliação inventadas nem cobertura geográfica total', async ({ page }) => {
    await withFakeSupabase(page, { tableData: { profiles: { count: 11, data: [] }, reviews: { data: [] } } });
    await page.goto('/porque-escolher.html');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('4.8');
    expect(bodyText).not.toContain('Avaliação média');
    // A linha "Cobertura geográfica" da tabela comparativa tem de mostrar o
    // símbolo parcial (~) para a Flinko, nunca o "✓" cheio (a densidade
    // fora do Porto/Braga ainda é baixa — ver rodapé da tabela).
    const row = page.locator('table tr', { hasText: 'Cobertura geográfica' });
    await expect(row.locator('td.hl')).toHaveText('~');
  });
});
