// Testes E2E do SEO em profile.html.
//
// Achado da auditoria: profile.html não tinha canonical nem tags Open
// Graph/Twitter nenhumas — todos os perfis de profissionais partilhavam
// o mesmo título/descrição genéricos, e uma partilha no WhatsApp/redes
// sociais nunca mostrava o nome nem a foto do profissional certo (esses
// crawlers só leem as tags estáticas do <head>, nunca JavaScript). O
// fix preenche essas tags a partir dos dados reais assim que o perfil
// carrega — ver updateSeoTags() em profile.html.
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

function profileConfig(profileOverrides) {
  return {
    session: null,
    tableData: {
      profiles: {
        data: [{
          id: 'pro-1',
          name: 'Ana Jardineira',
          bio: 'Mais de 10 anos a cuidar de jardins em Lisboa. '.repeat(4),
          category: 'Jardineiros',
          location: 'Lisboa',
          slug: null,
          photo_url: 'https://exemplo.test/ana.jpg',
          plan: 'free',
          verified: true,
          created_at: '2026-01-01T00:00:00Z',
          ...profileOverrides,
        }],
      },
    },
  };
}

test.describe('profile.html — SEO (canonical, Open Graph, Twitter)', () => {
  test('perfil sem link próprio: canonical e og:url apontam para ?id=, título/descrição/imagem vêm do profissional', async ({ page }) => {
    await withFakeSupabase(page, profileConfig());
    await page.goto('/profile.html?id=pro-1');
    await expect(page).toHaveTitle('Ana Jardineira – Jardineiros em Lisboa | Flinko');

    const canonical = page.locator('#meta-canonical');
    await expect(canonical).toHaveAttribute('href', 'https://flinko.pt/profile.html?id=pro-1');

    const ogUrl = page.locator('#meta-og-url');
    await expect(ogUrl).toHaveAttribute('content', 'https://flinko.pt/profile.html?id=pro-1');

    await expect(page.locator('#meta-og-title')).toHaveAttribute('content', 'Ana Jardineira – Jardineiros em Lisboa | Flinko');
    await expect(page.locator('#meta-twitter-title')).toHaveAttribute('content', 'Ana Jardineira – Jardineiros em Lisboa | Flinko');

    // A bio real do profissional deve aparecer na descrição, não o texto genérico.
    const desc = await page.locator('#meta-description').getAttribute('content');
    expect(desc).toContain('cuidar de jardins em Lisboa');

    // A foto do profissional é usada como imagem de partilha, não a imagem genérica.
    await expect(page.locator('#meta-og-image')).toHaveAttribute('content', 'https://exemplo.test/ana.jpg');
    await expect(page.locator('#meta-twitter-image')).toHaveAttribute('content', 'https://exemplo.test/ana.jpg');
  });

  test('profissional Pro com link próprio: canonical e og:url usam o slug, não o ?id=', async ({ page }) => {
    await withFakeSupabase(page, profileConfig({ slug: 'ana-jardineira', plan: 'pro' }));
    await page.goto('/profile.html?id=pro-1');

    await expect(page.locator('#meta-canonical')).toHaveAttribute('href', 'https://flinko.pt/ana-jardineira');
    await expect(page.locator('#meta-og-url')).toHaveAttribute('content', 'https://flinko.pt/ana-jardineira');
  });

  test('perfil sem foto: usa a imagem genérica da Flinko, não fica sem imagem', async ({ page }) => {
    await withFakeSupabase(page, profileConfig({ photo_url: null }));
    await page.goto('/profile.html?id=pro-1');

    await expect(page.locator('#meta-og-image')).toHaveAttribute('content', 'https://flinko.pt/assets/og-image.png');
  });

  test('profissional inexistente: página fica marcada como noindex (não é conteúdo real a mostrar ao Google)', async ({ page }) => {
    await withFakeSupabase(page, { session: null, tableData: { profiles: { data: [] } } });
    await page.goto('/profile.html?id=nao-existe');

    await expect(page.locator('#meta-robots')).toHaveAttribute('content', 'noindex, nofollow');
  });
});
