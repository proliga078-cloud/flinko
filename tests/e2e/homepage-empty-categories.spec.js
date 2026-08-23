// Testes E2E da correção "becos sem saída" identificada na análise de
// mercado/UX da homepage, mais tarde reforçada por uma crítica de design:
// mostrar as 16 categorias lado a lado quando a maioria não tem nenhum
// profissional promete mais amplitude do que a que existe e faz a
// plataforma parecer mais vazia, não mais impressionante.
//
// Cobre os pontos que se corrigiram juntos:
//  1. index.html esconde da grelha da homepage as categorias sem
//     profissionais (ver markEmptyCategories()) — mostra só as que têm
//     oferta real, e cresce sozinha à medida que mais categorias ganham o
//     primeiro profissional. Exceção: se NENHUMA categoria tiver ainda
//     profissionais, mostra as 16 marcadas como convite a publicar pedido
//     em vez de esconder a grelha toda.
//  2. categoria.html e as páginas de categoria geradas (ex: jardineiros.html)
//     oferecem, no próprio empty-state, um botão direto "Publicar pedido
//     grátis" — diretriz nº3 do NN/g para empty-states (caminho direto
//     para a próxima tarefa) — para quem chega lá via "Ver todas as
//     categorias" a uma categoria que ainda não tem ninguém.
//  3. pedidos.html lê o parâmetro ?cat= e pré-preenche a categoria no
//     formulário de publicar pedido.
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

test.describe('index.html — grelha de categorias mostra só quem tem oferta real', () => {
  test('categoria com profissionais mantém o link normal e fica visível; categoria vazia é escondida da grelha', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: {
          count: 2,
          data: [
            { id: 'p1', name: 'Ana Eletricista', category: 'Eletricistas', location: 'Porto', plan: 'free', verified: true },
            { id: 'p2', name: 'Bruno Pintor', category: 'Pintores', location: 'Lisboa', plan: 'free', verified: true },
          ],
        },
        reviews: { data: [] },
        requests: { data: [] },
        ad_slots: { data: [] },
      },
    });
    await page.goto('/index.html');

    // Categoria COM profissional (Eletricistas): continua visível, link normal.
    const eletricistas = page.locator('.cat-card[data-cat="Eletricistas"]');
    await expect(eletricistas).toBeVisible();
    await expect(eletricistas).not.toHaveClass(/cat-empty/);
    await expect(eletricistas).toHaveAttribute('href', 'eletricistas.html');

    // Categoria SEM profissional (Jardineiros): escondida da grelha da homepage.
    const jardineiros = page.locator('.cat-card[data-cat="Jardineiros"]');
    await expect(jardineiros).toBeHidden();
  });

  test('nenhuma categoria tem ainda profissionais: mostra as 16 marcadas como convite a publicar pedido, em vez de esconder a grelha toda', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 0, data: [] },
        reviews: { data: [] },
        requests: { data: [] },
        ad_slots: { data: [] },
      },
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.querySelector('.cat-card.cat-empty') !== null);

    const jardineiros = page.locator('.cat-card[data-cat="Jardineiros"]');
    await expect(jardineiros).toBeVisible();
    await expect(jardineiros).toHaveClass(/cat-empty/);
    await expect(jardineiros).toHaveAttribute('href', 'pedidos.html?cat=Jardineiros');
    await expect(jardineiros.locator('.cat-sub')).toContainText('Publica um pedido');
  });
});

test.describe('jardineiros.html — empty-state oferece caminho direto para publicar pedido', () => {
  test('sem profissionais nesta categoria: botão "Publicar pedido grátis" visível e a apontar para a categoria certa', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 0, data: [] },
        reviews: { data: [] },
      },
    });
    await page.goto('/jardineiros.html');
    await page.waitForFunction(() => document.querySelector('.empty-state h3') !== null);

    const cta = page.locator('.empty-state a.btn-solid');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText('Publicar pedido grátis');
    await expect(cta).toHaveAttribute('href', 'pedidos.html?cat=Jardineiros');
  });
});

test.describe('categoria.html — empty-state e sidebar-cta seguem o filtro de categoria ativo', () => {
  test('filtrado por categoria sem resultados: CTA do empty-state e da sidebar apontam para essa categoria', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 0, data: [] },
      },
    });
    await page.goto('/categoria.html?cat=Jardineiros');
    await page.waitForFunction(() => document.querySelector('.empty-state h3') !== null);

    const cta = page.locator('.empty-state a.btn-solid');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', 'pedidos.html?cat=Jardineiros');

    const sidebarLink = page.locator('#sidebar-cta-link');
    await expect(sidebarLink).toHaveAttribute('href', 'pedidos.html?cat=Jardineiros');
    await expect(page.locator('#sidebar-cta-text')).toContainText('Jardineiros');
  });

  test('sem filtro de categoria: CTA do empty-state aponta para pedidos.html genérico', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { count: 0, data: [] },
      },
    });
    await page.goto('/categoria.html?loc=Bragança');
    await page.waitForFunction(() => document.querySelector('.empty-state h3') !== null);

    const cta = page.locator('.empty-state a.btn-solid');
    await expect(cta).toHaveAttribute('href', 'pedidos.html');
  });
});

test.describe('pedidos.html — pré-preenchimento por ?cat=', () => {
  test('mostra aviso contextual e pré-seleciona a categoria no filtro', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: { requests: { data: [] }, request_offers: { data: [] } },
    });
    await page.goto('/pedidos.html?cat=Jardineiros');
    await page.waitForFunction(() => document.getElementById('f-cat').value === 'Jardineiros');

    const note = page.locator('#cat-context-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Jardineiros');
  });

  test('sem sessão: clicar em publicar pedido preserva ?cat= no redireciono para o login', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: { requests: { data: [] }, request_offers: { data: [] } },
    });
    await page.goto('/pedidos.html?cat=Jardineiros');
    await page.waitForFunction(() => document.getElementById('f-cat').value === 'Jardineiros');
    await page.click('#cat-context-note a');
    await page.waitForURL('**/auth.html**');
    const url = new URL(page.url());
    expect(url.searchParams.get('redirect')).toBe('pedidos.html?cat=Jardineiros');
  });
});
