// Em ecrã de telemóvel (375px) nenhuma página pode ficar mais larga do que o ecrã:
// senão o utilizador vê o conteúdo cortado e tem de arrastar para o lado.
// REGRESSÃO: nas páginas de categoria, o texto sem quebra de linha alargava os cartões
// dos profissionais até ~2800px e a barra do topo não quebrava linha.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const RAIZ = path.join(__dirname, '..', '..');
const paginas = fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html') && !['admin.html', 'dashboard.html'].includes(f)).sort();

const pro = { id: 'p1', name: 'Carlos Alexandre Moura Pendão de Sousa e Silva', slug: null, category: 'Eletricistas', location: 'Lisboa – Lisboa', plan: 'free', verified: true, bio: 'Técnico com experiência em instalações elétricas, manutenção e diagnóstico de avarias em casas e empresas.', photo_url: null, created_at: '2026-02-01T00:00:00Z', avg_response_minutes: null, response_sample_count: 0 };

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

for (const pagina of paginas) {
  test(`cabe em 375px: ${pagina}`, async ({ page }) => {
    await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
    await page.route(/^https?:\/\/(?!localhost)/, (route) => (route.request().url() === SUPABASE_CDN_URL ? route.fallback() : route.abort()));
    await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
      session: null,
      tableData: { profiles: { data: [pro], count: 1 }, reviews: { data: [] }, services: { data: [] } },
    });
    await page.goto('/' + pagina, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura, `${pagina} tem ${largura}px de largura`).toBeLessThanOrEqual(376);
  });
}
