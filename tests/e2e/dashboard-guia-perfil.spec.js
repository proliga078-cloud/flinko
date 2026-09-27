// dashboard.html: guia "Completa o teu perfil" (assets/dashboard-onboarding.js).
// Abre sozinho a profissionais com passos por fazer e pede só o que falta,
// gravando cada passo logo que se carrega em "Guardar e continuar".
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function abrir(page, profile, { servicos = 0, snooze = false, url = '/dashboard.html' } = {}) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript(({ p, n, s }) => {
    if (s) localStorage.setItem('fk_onb_snooze_until', String(Date.now() + 864e5));
    else localStorage.removeItem('fk_onb_snooze_until');
    window.__testAuthConfig = {
      session: { access_token: 'tok', user: { id: 'pro-1', email: 'pro@example.com' } },
      rpcResults: { get_my_profile: [p] },
      tableData: { plan_limits: { data: [] }, services: { count: n, data: n ? [{}] : [] } },
    };
  }, { p: { id: 'pro-1', name: 'Rui Alves', plan: 'free', account_type: 'professional', notify_email: true, ...profile }, n: servicos, s: snooze });
  await page.goto(url);
}

test('perfil vazio: o guia abre sozinho e percorre área → foto → descrição → serviço', async ({ page }) => {
  await abrir(page, { category: null, location: null, photo_url: null, bio: null });
  const guia = page.locator('#onb');
  await expect(guia).toBeVisible();
  await expect(guia).toContainText('Passo 1 de 4');

  // 1. área e zona
  await guia.locator('#onb-next').click();
  await expect(guia.locator('#onb-err')).toContainText('Escolhe a tua área');
  await guia.locator('#onb-cat').selectOption('Eletricistas');
  await guia.locator('#onb-dist').selectOption('Braga');
  await guia.locator('#onb-city').fill('Guimarães');
  await guia.locator('#onb-next').click();
  await expect(guia).toContainText('Passo 2 de 4');
  const upd = await page.evaluate(() => window.__updateCalls.find((c) => c.table === 'profiles').patch);
  expect(upd).toMatchObject({ category: 'Eletricistas', location: 'Braga – Guimarães' });

  // 2. foto: dá para saltar
  await guia.getByRole('button', { name: 'Saltar' }).click();
  await expect(guia).toContainText('Passo 3 de 4');

  // 3. descrição: o texto sugerido já traz a área e a zona
  await guia.getByRole('button', { name: /Escreve um texto por mim/ }).click();
  await expect(guia.locator('#onb-bio')).toHaveValue(/eletricista em Guimarães/);
  await guia.locator('#onb-next').click();
  await expect(guia).toContainText('Passo 4 de 4');

  // 4. serviço: sugestões da área escolhida
  await guia.getByRole('button', { name: 'Quadro elétrico' }).click();
  await guia.locator('#onb-sp').fill('60');
  await guia.locator('#onb-next').click();
  await expect(guia).toContainText('O teu perfil está pronto');
  const ins = await page.evaluate(() => window.__insertCalls.find((c) => c.table === 'services').row);
  expect(ins).toMatchObject({ professional_id: 'pro-1', title: 'Quadro elétrico', price_from: 60, price_unit: 'trabalho' });
  await expect(guia.getByRole('link', { name: 'Partilhar no WhatsApp' })).toHaveAttribute('href', /wa\.me/);
});

test('só pede o que falta: com área e serviço, mostra foto e descrição (2 passos)', async ({ page }) => {
  await abrir(page, { category: 'Pintores', location: 'Porto', photo_url: null, bio: null }, { servicos: 1 });
  await expect(page.locator('#onb')).toContainText('Passo 1 de 2');
  await expect(page.locator('#onb')).toContainText('Põe uma foto tua');
});

test('perfil completo: o guia não abre', async ({ page }) => {
  await abrir(page, { category: 'Pintores', location: 'Porto', photo_url: 'https://x/f.jpg', bio: 'Pintor com 10 anos de experiência.' }, { servicos: 1 });
  await page.waitForFunction(() => window.__statsLoaded === true);
  await expect(page.locator('#onb')).toHaveCount(0);
});

test('"Fazer depois" fecha e não volta a abrir no mesmo dia; ?completar=1 abre na mesma', async ({ page }) => {
  await abrir(page, { category: null, location: null, photo_url: null, bio: null });
  await page.locator('#onb').getByRole('button', { name: 'Fazer depois' }).click();
  await expect(page.locator('#onb')).toHaveCount(0);
  expect(await page.evaluate(() => Number(localStorage.getItem('fk_onb_snooze_until')) > Date.now())).toBe(true);
  // o botão do cartão de passos volta a abri-lo
  await page.getByRole('button', { name: /Completar tudo em 2 minutos/ }).click();
  await expect(page.locator('#onb')).toBeVisible();
});

test('link dos lembretes (?completar=1) abre o guia mesmo depois de "Fazer depois"', async ({ page }) => {
  await abrir(page, { category: null, location: null, photo_url: null, bio: null }, { snooze: true, url: '/dashboard.html?completar=1' });
  await expect(page.locator('#onb')).toBeVisible();
});

test('clientes nunca veem o guia', async ({ page }) => {
  await abrir(page, { account_type: 'client', category: null, location: null });
  await page.waitForTimeout(1500);
  await expect(page.locator('#onb')).toHaveCount(0);
});
