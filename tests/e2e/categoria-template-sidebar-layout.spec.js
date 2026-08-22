// Testes E2E de layout do template partilhado das 16 páginas de categoria
// (templates/categoria.template.html -> eletricistas.html, jardineiros.html, etc.)
//
// Contexto: ao verificar visualmente a correção do CTA da sidebar (P0.1,
// ver tests/e2e/homepage-empty-categories.spec.js), descobri que a sidebar
// inteira (filtros + o próprio CTA "Publicar pedido" que tinha acabado de
// corrigir) estava sempre invisível nestas 16 páginas, em qualquer largura
// de ecrã — incluindo desktop. A causa: uma secção de tema ("=== tema
// navy+laranja ===") no fim do <style>, fora de qualquer @media query,
// repetia com !important as mesmas regras que só deviam existir dentro de
// @media(max-width:900px) (esconder a sidebar, forçar a grelha para 1
// coluna, esconder o botão "Filtros" do mobile). Isto nunca tinha sido
// apanhado por testes porque a única cobertura de sidebar-cta existente era
// para categoria.html (a página "ver todos", escrita à mão) — nunca para
// as páginas geradas pelo template.
//
// Uma segunda falha, só visível depois de corrigir a primeira: a secção
// "Sobre esta categoria" + chips de navegação (.catfoot) ficava, por um
// </div> em falta a fechar .page-body a seguir a </main>, estruturalmente
// DENTRO da grelha de duas colunas — por isso aparecia espremida na largura
// da sidebar (260px) em vez de ocupar a largura toda como uma secção normal
// abaixo da grelha.
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

test.describe('páginas de categoria geradas pelo template — layout desktop', () => {
  test('jardineiros.html em desktop: a sidebar (filtros + CTA "Publicar pedido") está visível e a grelha tem duas colunas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await withFakeSupabase(page, { session: null, tableData: { profiles: { data: [] } } });
    await page.goto('/jardineiros.html');

    const sidebar = page.locator('#sidebar-el');
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box.width).toBeGreaterThan(150); // coluna de sidebar real, não 0/colapsada

    await expect(page.locator('.sidebar-cta a')).toBeVisible();
    await expect(page.locator('.sidebar-cta a')).toHaveText('Publicar pedido');

    const gridCols = await page.locator('.page-body').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(gridCols.trim().split(/\s+/).length).toBe(2); // "260px 868px", não uma coluna só
  });

  test('jardineiros.html em desktop: a secção "Sobre esta categoria" ocupa a largura toda, fora da grelha da sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await withFakeSupabase(page, { session: null, tableData: { profiles: { data: [] } } });
    await page.goto('/jardineiros.html');

    const catfoot = page.locator('.catfoot');
    await expect(catfoot).toBeVisible();
    const [catfootBox, sidebarBox] = await Promise.all([
      catfoot.boundingBox(),
      page.locator('#sidebar-el').boundingBox(),
    ]);
    // Tem de ser claramente mais larga que a sidebar (bug: ficava presa aos ~260px da coluna 1).
    expect(catfootBox.width).toBeGreaterThan(sidebarBox.width * 2);
  });

  test('jardineiros.html em mobile (<900px): a sidebar continua escondida por omissão e o botão "Filtros" continua a abri-la', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 900 });
    await withFakeSupabase(page, { session: null, tableData: { profiles: { data: [] } } });
    await page.goto('/jardineiros.html');

    const sidebar = page.locator('#sidebar-el');
    await expect(sidebar).toBeHidden();
    const filterBtn = page.locator('.mobile-filter-btn');
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();
    await expect(sidebar).toBeVisible();
    await expect(page.locator('.sidebar-cta a')).toBeVisible();
  });
});
