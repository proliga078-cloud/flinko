// Testes E2E do cartão "Faltam passos para apareceres nas pesquisas"
// (dashboard.html, #setup-card). Contexto: a análise de mercado/UX da
// homepage encontrou 6 de 17 profissionais reais sem categoria definida no
// perfil — o que os torna invisíveis em qualquer pesquisa por categoria e
// na grelha de categorias da homepage. Este cartão já existia e já cobria
// isto, mas combinava "categoria e zona" num único passo, o que não deixa
// claro qual dos dois falta quando só um está por preencher. Este ficheiro
// cobre a separação em dois passos distintos, e uma correção de um efeito
// secundário encontrado ao mexer aqui: renderSetup() corre uma vez no
// init(), antes de loadStats() ter tido tempo de calcular servicesCount,
// por isso o passo "Publica o primeiro serviço" podia ficar preso como
// pendente mesmo com serviços já publicados.
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

function baseConfig(profileOverrides, tableOverrides) {
  const profile = {
    id: 'pro-1',
    name: 'Profissional Teste',
    plan: 'free',
    account_type: 'professional',
    photo_url: 'https://example.com/foto.jpg',
    bio: 'Uma bio qualquer',
    notify_email: true,
    notify_digest: true,
    ...profileOverrides,
  };
  return {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'pro@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: {
      plan_limits: { data: [] },
      ...tableOverrides,
    },
  };
}

test.describe('dashboard.html — cartão de passos em falta', () => {
  test('categoria em falta, zona preenchida: mostra "Escolher categoria" como pendente e "Escolher zona" como feito', async ({ page }) => {
    await withFakeSupabase(page, baseConfig({ category: null, location: 'Porto' }, { services: { count: 1, data: [{}] } }));
    await page.goto('/dashboard.html');
    await page.waitForSelector('#setup-card:not([style*="display: none"])');

    const rows = page.locator('#setup-list .setup-row');
    await expect(page.locator('#setup-list')).toContainText('Escolher categoria');
    await expect(page.locator('#setup-list')).toContainText('Escolher zona');

    const catRow = rows.filter({ hasText: 'Escolher categoria' });
    await expect(catRow).not.toHaveClass(/done/);
    const locRow = rows.filter({ hasText: 'Escolher zona' });
    await expect(locRow).toHaveClass(/done/);
  });

  test('categoria e zona preenchidas, com foto/bio/serviço: cartão de passos em falta fica escondido', async ({ page }) => {
    await withFakeSupabase(
      page,
      baseConfig({ category: 'Jardineiros', location: 'Porto' }, { services: { count: 1, data: [{}] } })
    );
    await page.goto('/dashboard.html');
    await page.waitForFunction(() => servicesCount === 1);
    await expect(page.locator('#setup-card')).toBeHidden();
  });

  test('serviço já publicado: depois de loadStats() resolver, o passo "Publica o primeiro serviço" não fica preso como pendente', async ({ page }) => {
    await withFakeSupabase(
      page,
      baseConfig({ category: 'Jardineiros', location: 'Porto' }, { services: { count: 1, data: [{}] } })
    );
    await page.goto('/dashboard.html');
    // O cartão pode aparecer momentaneamente (1º render, antes de loadStats
    // resolver), mas tem de ficar escondido assim que os dados reais chegam.
    await page.waitForFunction(() => servicesCount === 1);
    await expect(page.locator('#setup-card')).toBeHidden();
  });
});
