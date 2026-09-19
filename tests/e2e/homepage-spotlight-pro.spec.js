// Testa a secção "profissionais em destaque" de index.html (#proGrid).
//
// Regras que o código garante e que estes testes protegem:
//  - os profissionais devolvidos por spotlight_pros() (quem tem plano Pro)
//    aparecem SEMPRE primeiro, à frente de perfis grátis;
//  - a lista completa-se com profissionais verificados até 3 cartões, sem
//    repetir quem já está em destaque;
//  - sem ninguém para mostrar, aparece um convite honesto (nunca cartões vazios);
//  - nomes vindos da BD são escapados (não executam HTML).
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

const pro = (extra) => ({
  bio: 'Bio de teste', photo_url: null, verified: true, slug: null,
  experience_years: 5, account_type: 'professional', ...extra,
});

test.describe('index.html — profissionais em destaque', () => {
  test('quem vem de spotlight_pros() aparece primeiro; o resto completa até 3 sem repetir', async ({ page }) => {
    const bruno = pro({ id: 'p1', name: 'Bruno Pro', category: 'Pintores', location: 'Porto', plan: 'pro' });
    const ana = pro({ id: 'f1', name: 'Ana Grátis', category: 'Jardineiros', location: 'Lisboa', plan: 'free' });
    const rui = pro({ id: 'f2', name: 'Rui Grátis', category: 'Limpeza', location: 'Braga', plan: 'free' });
    await withFakeSupabase(page, {
      tableData: { profiles: { data: [ana, bruno, rui] }, ad_slots: { data: [] } },
      rpcResults: { spotlight_pros: [bruno] },
    });
    await page.goto('/index.html');
    await expect(page.locator('#proGrid .pro-card')).toHaveCount(3);

    const nomes = await page.locator('#proGrid .pro-name').allTextContents();
    expect(nomes[0]).toBe('Bruno Pro');
    expect(new Set(nomes).size).toBe(3);
  });

  test('sem nenhum profissional: mostra convite para criar perfil, não cartões vazios', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: { profiles: { data: [] }, ad_slots: { data: [] } },
      rpcResults: { spotlight_pros: [] },
    });
    await page.goto('/index.html');
    await expect(page.locator('#proGrid')).toContainText('Ainda não temos profissionais verificados');
    await expect(page.locator('#proGrid a.btn')).toHaveAttribute('href', '/auth');
  });

  test('profissional com link próprio: "Ver perfil" aponta para /slug; sem slug usa ?id=', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { data: [pro({ id: 'p1', name: 'Com Slug', category: 'Pintores', plan: 'pro', slug: 'com-slug' }), pro({ id: 'p2', name: 'Sem Slug', category: 'Limpeza', plan: 'free' })] },
        ad_slots: { data: [] },
      },
      rpcResults: { spotlight_pros: [] },
    });
    await page.goto('/index.html');
    await expect(page.locator('#proGrid .pro-card')).toHaveCount(2);
    const hrefs = await page.locator('#proGrid .pro-card a.btn').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toContain('/com-slug');
    expect(hrefs).toContain('/profile.html?id=p2');
  });

  test('SEGURANÇA: nome com HTML é mostrado como texto, não executado', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { data: [pro({ id: 'x1', name: '<img src=x onerror="window.__pwn=1">', category: 'Pintores', plan: 'free' })] },
        ad_slots: { data: [] },
      },
      rpcResults: { spotlight_pros: [] },
    });
    await page.goto('/index.html');
    await expect(page.locator('#proGrid .pro-card')).toHaveCount(1);
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
    await expect(page.locator('#proGrid .pro-name')).toContainText('<img src=x');
  });
});
