// Pedido do dono do site: o destaque da homepage é um benefício anunciado
// do plano Pro ("Primeiro lugar nas listagens" / destaque na página
// inicial em pricing.html), mas antes deste fix o código só usava o
// resultado de spotlight_pros() como PREFERÊNCIA — se nenhum profissional
// Pro/Premium fosse elegível nesse dia, a homepage caía sempre para o
// profissional do plano grátis mais bem avaliado, dando de graça o mesmo
// destaque que o Pro vende.
//
// Este fix torna o destaque principal exclusivo de quem tem Pro/Premium:
// sem nenhum elegível, mostra-se um convite a assinar Pro em vez de um
// perfil do plano grátis. A lista "outros profissionais verificados" por
// baixo continua a existir (não é exclusiva de Pro), mas passa a ordenar
// primeiro por quem tem Pro/Premium e só depois por avaliação.
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

test.describe('index.html — destaque exclusivo de quem tem Pro', () => {
  test('sem nenhum profissional Pro/Premium: mostra convite para assinar Pro, nunca um perfil grátis', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          data: [
            { id: 'f1', name: 'Ana Grátis', category: 'Jardineiros', location: 'Lisboa', plan: 'free', verified: true },
          ],
        },
        reviews: { data: [{ professional_id: 'f1', rating: 5 }, { professional_id: 'f1', rating: 5 }] },
      },
      rpcResults: { spotlight_pros: [] },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.querySelector('.spotlight-invite') !== null);

    await expect(page.locator('.spotlight-card')).toHaveCount(0);
    const invite = page.locator('.spotlight-invite');
    await expect(invite).toContainText('Ainda não há profissionais Pro');
    await expect(invite.locator('a.btn')).toHaveAttribute('href', 'pricing.html');
  });

  test('profissional Pro elegível: aparece em destaque mesmo havendo um profissional grátis melhor avaliado', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          data: [
            { id: 'f1', name: 'Ana Grátis', category: 'Jardineiros', location: 'Lisboa', plan: 'free', verified: true },
            { id: 'p1', name: 'Bruno Pro', category: 'Pintores', location: 'Porto', plan: 'pro', verified: true },
          ],
        },
        // Ana (grátis) tem melhor avaliação do que Bruno (Pro).
        reviews: {
          data: [
            { professional_id: 'f1', rating: 5 }, { professional_id: 'f1', rating: 5 },
            { professional_id: 'p1', rating: 3 },
          ],
        },
      },
      rpcResults: { spotlight_pros: [{ id: 'p1' }] },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.querySelector('.spotlight-card') !== null);

    await expect(page.locator('.spotlight-card .name')).toHaveText('Bruno Pro');
    await expect(page.locator('.spotlight-invite')).toHaveCount(0);
  });

  test('lista "outros profissionais": quem tem Pro aparece sempre antes de quem tem o plano grátis, mesmo com avaliação mais baixa', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          data: [
            { id: 'p1', name: 'Bruno Pro (destaque)', category: 'Pintores', location: 'Porto', plan: 'pro', verified: true },
            { id: 'f1', name: 'Ana Grátis', category: 'Jardineiros', location: 'Lisboa', plan: 'free', verified: true },
            { id: 'p2', name: 'Carla Pro', category: 'Eletricistas', location: 'Braga', plan: 'pro', verified: true },
          ],
        },
        reviews: {
          data: [
            // Ana (grátis) tem melhor avaliação do que Carla (Pro) — mesmo
            // assim Carla deve aparecer primeiro na lista de "outros".
            { professional_id: 'f1', rating: 5 }, { professional_id: 'f1', rating: 5 },
            { professional_id: 'p2', rating: 3 },
          ],
        },
      },
      rpcResults: { spotlight_pros: [{ id: 'p1' }] },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.querySelectorAll('.other-pro-row').length === 2);

    const rows = page.locator('.other-pro-row');
    await expect(rows.nth(0)).toContainText('Carla Pro');
    await expect(rows.nth(0).locator('.pro-tag')).toBeVisible();
    await expect(rows.nth(1)).toContainText('Ana Grátis');
    await expect(rows.nth(1).locator('.pro-tag')).toHaveCount(0);
  });
});
