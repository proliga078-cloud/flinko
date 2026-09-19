// Teste E2E do separador "RGPD" em admin.html — o lado administrativo do
// fluxo criado em dashboard.html (ver dashboard-gdpr.spec.js). Sem isto, um
// pedido de eliminação/exportação criado por um utilizador ficaria na tabela
// gdpr_requests sem ninguém o ver nem tratar, o que é exatamente o risco de
// conformidade que motivou esta funcionalidade.
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

// Usa o relógio real da máquina (não um valor fixo) para não haver deriva
// entre o "agora" calculado aqui e o Date.now() que corre dentro da página.
const daysAgoIso = (days) => new Date(Date.now() - days * 86400000).toISOString();

test('separador RGPD mostra pedidos pendentes/urgentes e permite mudar de estado', async ({ page }) => {
  await withFakeSupabase(page, {
    session: { access_token: 'tok', user: { id: 'admin-1', email: 'admin@example.com' } },
    rpcResults: { is_admin: true },
    tableData: {
      profiles: { data: [{ id: 'pro-1', name: 'Profissional Teste' }, { id: 'pro-2', name: 'Cliente Teste' }] },
      gdpr_requests: {
        data: [
          { id: 'req-1', profile_id: 'pro-1', request_type: 'delete', status: 'pending', created_at: daysAgoIso(27) },
          { id: 'req-2', profile_id: 'pro-2', request_type: 'export', status: 'completed', created_at: daysAgoIso(2) },
        ],
      },
    },
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=🔒 RGPD');

  // Filtro por omissão é "Pendentes + em tratamento" — só o pedido pendente aparece.
  await expect(page.locator('#gdpr-tbody tr')).toHaveCount(1);
  await expect(page.locator('#gdpr-tbody')).toContainText('Profissional Teste');
  await expect(page.locator('#gdpr-tbody')).toContainText('Eliminação da conta');
  await expect(page.locator('#gdpr-tbody')).toContainText('27 dias');
  await expect(page.locator('#gdpr-urgent-count')).toHaveText('1'); // >=25 dias em aberto

  // Ver todos os estados mostra as duas linhas.
  await page.selectOption('#gdpr-filter', '');
  await expect(page.locator('#gdpr-tbody tr')).toHaveCount(2);

  // Mudar o estado do pedido pendente para "completed" chama update() com resolved_at preenchido
  // (a base de dados fake não muta os dados devolvidos, por isso confirmamos
  // o pedido de update em si, não o re-render — a mutação real é a que foi
  // verificada diretamente na base de dados de produção via RLS, ver migração).
  await page.selectOption('#gdpr-tbody tr:has-text("Profissional Teste") select', 'completed');
  const updateCalls = await page.evaluate(() => window.__updateCalls || []);
  const gdprUpdate = updateCalls.find((c) => c.table === 'gdpr_requests');
  expect(gdprUpdate).toBeTruthy();
  expect(gdprUpdate.patch.status).toBe('completed');
  expect(typeof gdprUpdate.patch.resolved_at).toBe('string');
});
