// Alertas no WhatsApp (dashboard.html → O meu perfil → Notificações).
// A opção só aparece quando a Flinko tem o WhatsApp ligado (whatsapp-status).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function abrir(page, { enabled, phone }) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/whatsapp-status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled }) }));
  const profile = { id: 'pro-1', slug: 'rui', name: 'Rui Alves', plan: 'free', account_type: 'professional', category: 'Eletricistas', location: 'Braga – Braga' };
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'rui@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: { plan_limits: { data: [] }, profile_private: { data: [{ profile_id: 'pro-1', phone, whatsapp_alerts: false }] } },
  });
  await page.goto('/dashboard.html');
  await page.evaluate(() => showPage('profile'));
}

test('WhatsApp desligado na Flinko: a opção não aparece', async ({ page }) => {
  await abrir(page, { enabled: false, phone: '912345678' });
  await page.waitForTimeout(800);
  await expect(page.locator('#wa-row')).toBeHidden();
});

test('ligar os alertas: mostra o número e grava o consentimento', async ({ page }) => {
  await abrir(page, { enabled: true, phone: '912 345 678' });
  await expect(page.locator('#wa-row')).toBeVisible();
  await expect(page.locator('#wa-phone')).toHaveText('+351912345678');
  await page.locator('label[for="wa-toggle"]').click();
  await expect(page.locator('#notif-success')).toContainText('WhatsApp');
  const up = await page.evaluate(() => window.__updateCalls.find((c) => c.table === 'profile_private').patch);
  expect(up.whatsapp_alerts).toBe(true);
  expect(typeof up.whatsapp_opt_in_at).toBe('string');
});

test('sem telemóvel válido: não liga e explica o que falta', async ({ page }) => {
  await abrir(page, { enabled: true, phone: '223456789' });
  await page.locator('label[for="wa-toggle"]').click();
  await expect(page.locator('#notif-error')).toContainText('adiciona um telemóvel válido');
  await expect(page.locator('#wa-toggle')).not.toBeChecked();
});
