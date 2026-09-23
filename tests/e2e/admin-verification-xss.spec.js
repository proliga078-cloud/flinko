// Regressão de SEGURANÇA em admin-classico.html (separador Verificação).
//
// Achado da revisão de código: o caminho de cada documento
// (verification_requests.documents[].path) é escrito pelo profissional e
// era metido sem escape dentro de um onclick="viewVerificationDoc('...')".
// Um profissional podia gravar um path com aspas e fazer executar JavaScript
// na sessão do ADMIN quando este abrisse o separador — escalada de privilégios.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const CAMINHO_MALICIOSO = "x');window.__pwn_admin=1;('";

test('path malicioso de um documento não executa código no admin e é passado intacto à função', async ({ page }) => {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: { access_token: 'admin-tok', user: { id: 'admin-1', email: 'admin@example.com' } },
    rpcResults: { is_admin: true, admin_list_profiles: [] },
    tableData: {
      profiles: { data: [{ id: 'p1', name: 'Profissional' }] },
      profile_private: { data: [] },
      verification_requests: {
        data: [{
          id: 'v1', profile_id: 'p1', status: 'pending', created_at: '2026-01-01T00:00:00Z', notes: null,
          documents: [{ path: CAMINHO_MALICIOSO, name: 'Cartão de cidadão' }],
        }],
      },
    },
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  // substitui a função que abre o documento para vermos com que argumento é chamada
  await page.evaluate(() => { window.__docAberto = null; window.viewVerificationDoc = (p) => { window.__docAberto = p; }; });

  await page.evaluate(() => showAdminPage('verificacao'));
  const botao = page.locator('#verif-tbody button', { hasText: 'Cartão de cidadão' });
  await expect(botao).toBeVisible();
  await botao.click();

  expect(await page.evaluate(() => window.__pwn_admin)).toBeUndefined();
  expect(await page.evaluate(() => window.__docAberto)).toBe(CAMINHO_MALICIOSO);
});
