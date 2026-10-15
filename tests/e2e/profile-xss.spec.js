// Regressão de SEGURANÇA em profile.html (página pública de cada profissional).
//
// Achado da revisão de código: specialties, languages e payment_methods
// (text[] editáveis pelo dono do perfil, sem validação na BD) entravam em
// innerHTML SEM escape — quem escrevesse <img onerror=...> num destes campos
// executava JavaScript em todos os visitantes do perfil (incluindo admins).
// Também website/social_links aceitavam "javascript:" no href.
//
// Estes testes fazem o ataque de verdade contra a página e exigem que
// nada execute.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const PAYLOAD = (flag) => `<img src=x onerror="window.${flag}=1">`;

async function abrirPerfil(page, overrides) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: null,
    tableData: {
      profiles: {
        data: [{
          id: 'pro-1', name: 'Vítima', bio: 'Bio', category: 'Jardineiros', location: 'Lisboa – Lisboa',
          slug: null, plan: 'free', verified: true, created_at: '2026-01-01T00:00:00Z', ...overrides,
        }],
      },
    },
  });
  await page.goto('/profile.html?id=pro-1');
  await expect(page.locator('.profile-name')).toContainText('Vítima');
}

test.describe('profile.html — XSS armazenado', () => {
  test('specialties, languages e payment_methods com HTML são mostrados como texto, nunca executados', async ({ page }) => {
    await abrirPerfil(page, {
      specialties: [PAYLOAD('__pwn_spec')],
      languages: [PAYLOAD('__pwn_lang')],
      payment_methods: [PAYLOAD('__pwn_pay')],
    });
    // dá tempo aos handlers onerror (a imagem falha de imediato se existir)
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ s: window.__pwn_spec, l: window.__pwn_lang, p: window.__pwn_pay }));
    expect(r).toEqual({ s: undefined, l: undefined, p: undefined });
    await expect(page.locator('.spec-chip')).toContainText('<img src=x');
  });

  test('certificações, prémios e experiência com HTML não executam', async ({ page }) => {
    await abrirPerfil(page, {
      certifications: [{ name: PAYLOAD('__pwn_cert'), year: PAYLOAD('__pwn_certyear') }],
      awards: [{ title: PAYLOAD('__pwn_award'), issuer: PAYLOAD('__pwn_issuer'), year: PAYLOAD('__pwn_awardyear') }],
      experience_years: PAYLOAD('__pwn_exp'),
    });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwn_')));
    expect(r).toEqual([]);
  });
});

test.describe('profile.html — URLs perigosos', () => {
  test('website e redes sociais com "javascript:" não geram nenhum link javascript:', async ({ page }) => {
    await abrirPerfil(page, {
      website: 'javascript:window.__pwn_web=1',
      social_links: { instagram: 'javascript:alert(1)', facebook: 'data:text/html,<script>alert(1)</script>' },
    });
    const hrefs = await page.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
    expect(hrefs.filter((h) => /^\s*(javascript|data|vbscript):/i.test(h))).toEqual([]);
  });

  test('website https normal continua a aparecer, a abrir em nova aba com rel="noopener noreferrer"', async ({ page }) => {
    await abrirPerfil(page, { website: 'https://exemplo.pt' });
    const link = page.locator('.profile-actions a[href="https://exemplo.pt"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('cover_url com aspas/parênteses não consegue sair do url() do CSS', async ({ page }) => {
    await abrirPerfil(page, { cover_url: "https://exemplo.pt/x.jpg');background:red;('" });
    // O texto malicioso tem de ficar DENTRO do url() (codificado), sem virar uma
    // declaração CSS própria: background-color não pode ter sido definido.
    const bgColor = await page.locator('#cover').evaluate((el) => el.style.backgroundColor);
    expect(bgColor).toBe('');
  });
});
