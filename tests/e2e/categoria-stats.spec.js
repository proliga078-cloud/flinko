// Testes E2E das páginas de categoria (ex: eletricistas.html) — cobre a
// substituição do antigo "24h Resposta habitual" fixo (sem dados reais por
// trás, confirmado por query: 0 profissionais com response_sample_count>0)
// por um tempo de resposta real, calculado a partir de
// profiles.avg_response_minutes/response_sample_count, que só aparece
// quando há amostra suficiente (n>=3) — nunca um número inventado.
//
// Nota: .stats-row tem `display:none!important` no CSS partilhado do
// template — a linha de stats está propositadamente escondida na página
// (decisão de layout anterior a este fix, não alterada aqui). Por isso os
// testes verificam o estado real do DOM (style.display definido pelo JS,
// texto presente/ausente) em vez de visibilidade renderizada, que o
// `!important` força sempre a "hidden" independentemente da lógica.
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

test.describe('eletricistas.html — stat de tempo de resposta honesto', () => {
  test('sem amostra suficiente (n<3): o stat de resposta fica escondido e não há "24h" fixo', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          count: 2,
          data: [
            { id: 'p1', name: 'Prof Um', avg_response_minutes: 30, response_sample_count: 1 },
            { id: 'p2', name: 'Prof Dois', avg_response_minutes: null, response_sample_count: 0 },
          ],
        },
        reviews: { data: [] },
      },
    });
    await page.goto('/eletricistas.html');
    await page.waitForFunction(() => document.getElementById('stat-count').textContent !== '–');
    const displayStyle = await page.$eval('#stat-response-item', el => el.style.display);
    expect(displayStyle).toBe('none');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('24h');
  });

  test('com amostra real suficiente (n>=3): calcula o tempo de resposta em vez de mostrar um número fixo', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          count: 2,
          data: [
            { id: 'p1', name: 'Prof Um', avg_response_minutes: 90, response_sample_count: 2 },
            { id: 'p2', name: 'Prof Dois', avg_response_minutes: 30, response_sample_count: 1 },
          ],
        },
        reviews: { data: [] },
      },
    });
    await page.goto('/eletricistas.html');
    await page.waitForFunction(() => document.getElementById('stat-response').textContent !== '–');
    const displayStyle = await page.$eval('#stat-response-item', el => el.style.display);
    expect(displayStyle).not.toBe('none');
    // Média ponderada: (90*2 + 30*1) / 3 = 70 min -> a partir de 60min o
    // formatador arredonda para horas: Math.round(70/60) = "1 h".
    await expect(page.locator('#stat-response')).toHaveText('1 h');
  });
});
