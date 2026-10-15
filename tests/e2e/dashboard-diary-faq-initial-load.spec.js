// Teste E2E de regressão: as tabs "Diário de trabalhos" e "FAQ" do
// dashboard do profissional têm de ficar preenchidas logo no primeiro
// carregamento da página, sem precisar que o profissional publique ou
// apague algo primeiro nessa tab.
//
// Contexto: auditoria total ao site (ago/2026) encontrou duas definições
// globais de checkUpgrade() — uma em assets/dashboard-stats.js (chamava
// loadPortfolio()+loadDiaryDash()+loadFaqsDash(), mas não tratava o plano
// "premium") e outra em assets/billing.js (tratava free/pro/premium, mas
// só chamava loadPortfolio()). Como billing.js é carregado depois de
// dashboard-stats.js em dashboard.html, a sua definição de checkUpgrade
// prevalece sempre em runtime — e é a chamada a checkUpgrade() dentro de
// init() (assets/dashboard-core.js) que dispara o carregamento inicial de
// #diary-dash-list e #faq-dash-list. Resultado: essas duas listas
// ficavam vazias no primeiro carregamento mesmo havendo dados, só
// aparecendo depois de o profissional publicar/apagar algo nessa mesma
// tab (o que chama loadDiaryDash()/loadFaqsDash() diretamente). A
// correção consolidou numa única definição (em billing.js, que é a que
// vence) e removeu o duplicado morto em dashboard-stats.js.
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

test.describe('dashboard.html — Diário e FAQ carregam logo no primeiro acesso', () => {
  test('publicação de diário e pergunta de FAQ já existentes aparecem sem nenhuma ação do utilizador', async ({ page }) => {
    const profile = {
      id: 'pro-1', name: 'Profissional Teste', plan: 'free',
      account_type: 'professional', category: 'Jardineiros', location: 'Porto',
    };
    await withFakeSupabase(page, {
      session: { access_token: 'tok', user: { id: 'pro-1', email: 'pro@example.com' } },
      rpcResults: { get_my_profile: [profile] },
      tableData: {
        plan_limits: { data: [] },
        professional_updates: { data: [{ id: 'u1', content: 'Terminei um jardim em Matosinhos', created_at: new Date().toISOString() }] },
        professional_faqs: { data: [{ id: 'f1', question: 'Trabalham fins de semana?', answer: 'Sim, mediante marcação.' }] },
      },
    });
    await page.goto('/dashboard.html');

    await expect(page.locator('#diary-dash-list')).toContainText('Terminei um jardim em Matosinhos', { timeout: 10000 });
    await expect(page.locator('#faq-dash-list')).toContainText('Trabalham fins de semana?', { timeout: 10000 });
  });
});
