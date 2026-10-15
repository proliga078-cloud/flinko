// Testes E2E do fix de acessibilidade por teclado (assets/a11y-clickable.js).
//
// Achado da auditoria: muitos elementos "clicáveis" do site eram <div>s com
// onclick, sem tabindex nem role — quem navega só com o teclado (Tab) nunca
// conseguia focar nem ativar esses elementos. O fix dá tabindex="0" e
// role="button" a esses elementos e liga Enter/Espaço à mesma ação do
// clique, sem alterar o visual nem o comportamento de rato.
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

test.describe('assets/a11y-clickable.js — divs "onclick" tornam-se acessíveis por teclado', () => {
  test('pricing.html — pergunta de FAQ (div.faq-q) recebe foco pelo Tab e abre com Enter', async ({ page }) => {
    await page.goto('/pricing.html');
    const question = page.locator('.faq-q').first();
    const item = page.locator('.faq-item').first();

    await expect(question).toHaveAttribute('tabindex', '0');
    await expect(question).toHaveAttribute('role', 'button');
    await expect(item).not.toHaveClass(/open/);

    await question.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveClass(/open/);

    // Espaço também deve funcionar, e voltar a fechar (toggle).
    await page.keyboard.press(' ');
    await expect(item).not.toHaveClass(/open/);
  });

  test('categoria.html — o fundo do overlay da sidebar não é transformado num "botão" de teclado', async ({ page }) => {
    // O script exclui explicitamente fundos de modal/menu (fecham ao clicar
    // fora) porque não fazem sentido como paragem de Tab.
    await page.goto('/categoria.html');
    const overlay = page.locator('#sidebar-overlay');
    await expect(overlay).not.toHaveAttribute('tabindex', '0');
  });

  test('auth.html — os campos de email/password do login estão associados às respetivas labels', async ({ page }) => {
    await withFakeSupabase(page, {});
    await page.goto('/auth.html');
    // getByLabel só encontra o input se a label estiver corretamente
    // associada (for=/wrapping) — é exatamente isso que estamos a validar.
    // O formulário de registo tem campos "Email"/"Password" com o mesmo
    // texto, por isso restringimos a pesquisa ao formulário de login.
    const loginForm = page.locator('#form-login');
    await expect(loginForm.getByLabel('Email', { exact: true })).toHaveAttribute('id', 'login-email');
    await expect(loginForm.getByLabel('Password', { exact: true })).toHaveAttribute('id', 'login-password');
  });

  test('auth.html — o grupo "O que procuras?" é navegável e ativável pelo teclado', async ({ page }) => {
    await withFakeSupabase(page, {});
    await page.goto('/auth.html');
    await page.click('#tab-register');
    const clientCard = page.locator('#intent-client');
    await expect(clientCard).toHaveAttribute('role', 'button');
    await expect(clientCard).toHaveAttribute('tabindex', '0');

    await clientCard.focus();
    await page.keyboard.press('Enter');
    await expect(clientCard).toHaveClass(/on/);
    await expect(clientCard).toHaveAttribute('aria-pressed', 'true');
  });
});
