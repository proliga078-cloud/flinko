// Página "Quem somos" (out/2026), a partir do texto do dono, com as ideias que
// ele escolheu para o site: movimento, mapa de Portugal, conversa e escuro
// cinematográfico. Tudo o que se vê vem da base de dados; com pouco ou com
// erro, o bloco esconde-se. Sem frases feitas, travessões nem emojis.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function abrir(page, dados) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('https://exemplo.pt/**', (r) => r.fulfill({ path: path.join(__dirname, 'fixtures', 'small-photo.jpg'), contentType: 'image/jpeg' }));
  await page.addInitScript((d) => { window.__testAuthConfig = { tableData: { profiles: { data: d.pros || [] }, portfolio_items: { data: d.trab || [] } } }; }, dados || {});
  await page.goto('/sobre.html');
}

const pro = (i, extra) => ({ id: 'p' + i, name: 'Pro ' + i, category: 'Pintores', photo_url: 'https://exemplo.pt/f' + i + '.jpg', slug: null, location: 'Porto – Porto', ...extra });

test('topo, princípios e caminhos para clientes e profissionais', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('h1')).toHaveText('De um lado, quem precisa. Do outro, quem sabe fazer.');
  await expect(page.locator('.c-hero .tag')).toHaveText('Quem somos');
  const corpo = page.locator('#quem-somos');
  for (const p of ['Transparência', 'Acessibilidade', 'Autonomia', 'Responsabilidade', 'Melhoria contínua']) await expect(corpo).toContainText(p);
  await expect(corpo).toContainText('Sem comissão');
  await expect(corpo.getByRole('link', { name: 'Explorar profissionais' })).toHaveAttribute('href', '/categoria');
  await expect(corpo.getByRole('link', { name: 'Juntar-me como profissional' })).toHaveAttribute('href', '/profissionais');
  await expect(corpo.getByRole('link', { name: 'flinkogeral@gmail.com' })).toHaveAttribute('href', 'mailto:flinkogeral@gmail.com');
  // 16 ofícios, cada um com link (a cópia da faixa em movimento fica fora do teclado e dos leitores)
  await expect(corpo.locator('.c-faixa > div:not([aria-hidden]) a')).toHaveCount(16);
});

test('sem frases feitas, travessões, emojis nem dados por preencher', async ({ page }) => {
  await abrir(page);
  const t = (await page.locator('#quem-somos').allInnerTexts()).join('\n');
  expect(t).not.toMatch(/de confiança|sem compromisso|profissional certo|especialista certo|—|\[/);
  expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
});

test('números, mapa e parede de fotos com dados verdadeiros, e HTML escapado', async ({ page }) => {
  const pros = [
    pro(0, { name: '<b>Ana</b> Silva', location: 'Braga – Fafe', category: 'Eletricistas' }),
    pro(1, { location: 'Braga', category: 'Limpeza' }),
    pro(2, { location: 'Lisboa – Sintra' }),
    ...[3, 4, 5, 6, 7].map((i) => pro(i)),
  ];
  const trab = [0, 1, 2].map((i) => ({ professional_id: 'p' + i, photo_url: 'https://exemplo.pt/t' + i + '.jpg', title: 'Sala pintada ' + i }));
  await abrir(page, { pros, trab });
  await expect(page.locator('#nPros strong')).toHaveText('8');
  await expect(page.locator('#nDist strong')).toHaveText('3');
  await expect(page.locator('#nCats strong')).toHaveText('3');
  // Porto tem mais gente: começa escolhido
  await expect(page.locator('#iOnde')).toHaveText('profissionais em Porto');
  await page.getByRole('button', { name: /^Braga: 2 profissionais/ }).click();
  await expect(page.locator('#iNum')).toHaveText('2');
  await expect(page.locator('#iCats')).toContainText('Eletricistas');
  await expect(page.locator('#iLink')).toHaveAttribute('href', '/categoria?loc=Braga');
  await expect(page.locator('#cParede')).toBeVisible();
  await expect(page.locator('#cTrab')).toBeVisible();
  await expect(page.locator('#cGaleria a')).toHaveCount(3);
  expect(await page.locator('#quem-somos b:text-is("Ana")').count()).toBe(0);
});

test('com poucos dados: sem parede, sem galeria e sem números a zero', async ({ page }) => {
  await abrir(page, { pros: [pro(0, { location: 'Faro' })] });
  await expect(page.locator('#nPros strong')).toHaveText('1');
  await expect(page.locator('#nDist')).toBeHidden();
  await expect(page.locator('#nCats')).toBeHidden();
  await expect(page.locator('#cParede')).toBeHidden();
  await expect(page.locator('#cTrab')).toBeHidden();
});

test('a conversa corre sozinha e acende o passo certo', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#cPassos li.ativo strong')).toHaveText('Procuras');
  await expect(page.locator('#cPassos li.ativo strong')).toHaveText('Falas', { timeout: 8000 });
  await expect(page.locator('#cFio .b.eu')).toContainText('fuga');
});

test('com "reduzir movimento": a conversa aparece toda de uma vez', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir(page);
  await expect(page.locator('#cFio .prop')).toBeVisible();
  await expect(page.locator('#cPassos li.ativo strong')).toHaveText('Decides');
});

test('no telemóvel não desliza para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrir(page, { pros: [0, 1, 2, 3, 4, 5, 6].map((i) => pro(i)) });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
