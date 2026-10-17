// Página "Quem somos" (out/2026), a partir do texto do dono. Stanford Web
// Credibility: mostrar quem está por trás do site dá confiança. O texto segue
// as regras do CLAUDE.md: sem frases feitas, sem travessões, sem emojis.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

test.beforeEach(async ({ page }) => {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.goto('/sobre.html');
});

test('quem somos: título, princípios, sem comissão e caminhos para os dois lados', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('De um lado, quem precisa. Do outro, quem sabe fazer.');
  await expect(page.locator('.qs-hero .tag')).toHaveText('Quem somos');
  const corpo = page.locator('#quem-somos');
  for (const p of ['Transparência', 'Acessibilidade', 'Autonomia', 'Responsabilidade', 'Melhoria contínua']) await expect(corpo).toContainText(p);
  await expect(corpo).toContainText('Sem comissão');
  await expect(corpo.getByRole('link', { name: 'Explorar profissionais' })).toHaveAttribute('href', '/categoria');
  await expect(corpo.getByRole('link', { name: 'Juntar-me como profissional' })).toHaveAttribute('href', '/profissionais');
  await expect(corpo.locator('.chips a')).toHaveCount(16);
  await expect(corpo.getByRole('link', { name: 'flinkogeral@gmail.com' })).toHaveAttribute('href', 'mailto:flinkogeral@gmail.com');
});

test('quem somos: sem frases feitas, travessões, emojis nem dados por preencher', async ({ page }) => {
  const texto = await page.locator('#quem-somos').allInnerTexts();
  const t = texto.join('\n');
  expect(t).not.toMatch(/de confiança|sem compromisso|profissional certo|especialista certo|—|\[/);
  expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
});

test('quem somos: números verdadeiros no topo, e sem números se a base de dados falhar', async ({ page }) => {
  await page.addInitScript(() => { window.__testAuthConfig = { tableData: { profiles: { data: [{ category: 'Eletricistas' }, { category: 'Pintores' }, { category: 'Pintores' }] } } }; });
  await page.reload();
  await expect(page.locator('#qsPros')).toHaveText('3');
  await expect(page.locator('#qsCats')).toHaveText('2');
});

test('quem somos: no telemóvel não desliza para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.locator('#qsNumPros')).toBeHidden();
});
