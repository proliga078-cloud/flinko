// Angariação e cobrança no painel de gestão (admin-antigo.html): textos por
// categoria, sequências de seguimento automáticas, resultados por modelo e
// registo de consentimentos para promoções.
const { test, expect } = require('@playwright/test');
const { openAdmin, modalOk, PRO, iso } = require('./fixtures/admin-mock');

const LEAD = { id: 'lead-1', kind: 'lead', data: { name: 'Carlos Pinto', phone: '913000111', category: 'Canalizadores', zone: 'Braga', source: 'Telefone', stage: 'novo', log: [], created: iso(2) } };
const dkey = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const posted = (calls, kind) => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items' && c.body && c.body.kind === kind).map((c) => c.body.data);

test('separadores novos: angariar clientes, objeções, por categoria e resultados', async ({ page }) => {
  await openAdmin(page, { view: 'playbook' });
  for (const [tab, text] of [['Angariar clientes', 'administrador de condomínio'], ['Objeções', 'Já tenho clientes'], ['Por categoria', 'Limpeza, jardim e mudanças'], ['Resultados e consentimentos', 'Que textos funcionam']]) {
    await page.getByRole('button', { name: new RegExp(tab) }).click();
    await expect(page.locator('#main')).toContainText(text);
  }
  await expect(page.locator('#consentCard')).toBeVisible();
});

test('WhatsApp a um lead com “Primeiro contacto”: regista o modelo e agenda o seguimento a 3 dias', async ({ page }) => {
  const calls = await openAdmin(page, { view: 'leads', tables: { admin_items: [LEAD] } });
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'WA' }).click();
  await page.locator('#ff_t').selectOption('d1');
  await modalOk(page);
  const wa = await popup;
  expect(new URL(wa.url()).searchParams.get('text')).toContain('Quem procura canalizadores na sua zona'); // variante "obras e reparações"
  await wa.close();
  await expect.poll(() => posted(calls, 'followup').length).toBe(1);
  const fu = posted(calls, 'followup')[0];
  expect(fu).toMatchObject({ target: 'lead', ref: 'lead-1', seq: 'd1', step: 0, tpl: 'd6', due: dkey(Date.now() + 3 * 864e5) });
  const lead = posted(calls, 'lead').pop();
  expect(lead.stage).toBe('contactado');
  expect(lead.log[0]).toMatchObject({ tpl: 'd1' });
  await expect(page.locator('#fuCard')).toContainText('Carlos Pinto');
  await expect(page.locator('#fuCard')).toContainText('Seguimento (3 dias)');
});

test('seguimento para hoje: aparece em “Para fazer hoje”, envia o texto certo e agenda o passo seguinte', async ({ page }) => {
  const FU = { id: 'fu-1', kind: 'followup', data: { target: 'lead', ref: 'lead-1', seq: 'd1', step: 0, tpl: 'd6', due: dkey(Date.now()) } };
  const calls = await openAdmin(page, { tables: { admin_items: [LEAD, FU] } });
  await expect(page.locator('#main')).toContainText('seguimentos para enviar');
  await page.evaluate(() => go('leads'));
  const popup = page.waitForEvent('popup');
  await page.locator('#fuCard').getByRole('button', { name: /Enviar/ }).click();
  const wa = await popup;
  expect(new URL(wa.url()).searchParams.get('text')).toContain('só para saber se chegou a ver a minha mensagem');
  await wa.close();
  await expect.poll(() => posted(calls, 'followup').length).toBe(2);
  const [done, next] = posted(calls, 'followup');
  expect(done.done).toBe('enviado');
  expect(next).toMatchObject({ step: 1, tpl: 'd7', due: dkey(Date.now() + 4 * 864e5) }); // 7 dias depois do 1.º contacto = 4 dias depois deste
});

test('lead que se registou deixa de ter seguimentos', async ({ page }) => {
  const registered = { ...LEAD, data: { ...LEAD.data, phone: '912345678' } }; // o telemóvel do PRO do simulador
  const FU = { id: 'fu-1', kind: 'followup', data: { target: 'lead', ref: 'lead-1', seq: 'd1', step: 0, tpl: 'd6', due: dkey(Date.now()) } };
  await openAdmin(page, { view: 'leads', tables: { admin_items: [registered, FU] } });
  await expect(page.locator('#fuCard')).toContainText('Nenhum');
});

test('modelo promocional: só aparece e só envia a quem tem consentimento registado', async ({ page }) => {
  await openAdmin(page, { view: 'contact' });
  await page.evaluate(() => { setSeg('all'); setTpl('d4'); });
  await expect(page.locator('#ctable')).toContainText('Ninguém neste grupo');
  await expect(page.locator('#main')).toContainText('promocional');
  await page.evaluate(() => openPro('pro-1'));
  await page.locator('#drawer').getByRole('button', { name: 'WhatsApp com modelo' }).click();
  await page.locator('#ff_t').selectOption('d4');
  await modalOk(page);
  await expect(page.locator('.toast')).toContainText('não tem consentimento');
});

test('consentimento registado na ficha: passa a receber o modelo promocional e fica no registo', async ({ page }) => {
  const CONSENT = { id: 'c-1', kind: 'consent', data: { ref: 'pro-1', name: PRO.name, status: 'dado', channel: 'WhatsApp', date: dkey(Date.now() - 864e5), source: 'Disse que sim por WhatsApp', at: iso(1) } };
  const calls = await openAdmin(page, { view: 'contact', tables: { admin_items: [CONSENT] } });
  await page.evaluate(() => { setSeg('all'); setTpl('d4'); });
  await expect(page.locator('#ctable')).toContainText('Rui Alves');
  // registar a recusa (PARAR) na ficha
  await page.evaluate(() => openPro('pro-1'));
  await expect(page.locator('#drawer')).toContainText('consentiu');
  await page.locator('#drawer').getByRole('button', { name: /Registar recusa/ }).click();
  await page.locator('#ff_source').fill('Respondeu PARAR');
  await modalOk(page);
  await expect.poll(() => posted(calls, 'consent').length).toBe(1);
  expect(posted(calls, 'consent')[0]).toMatchObject({ ref: 'pro-1', status: 'retirado', source: 'Respondeu PARAR' });
  await expect(page.locator('#drawer')).toContainText('recusou / retirou');
});

test('resultados: conta envios por modelo e leads que se registaram', async ({ page }) => {
  const reg = { id: 'lead-2', kind: 'lead', data: { name: 'Rui', phone: '912345678', category: 'Eletricistas', stage: 'contactado', log: [{ at: iso(5), txt: 'WhatsApp · Primeiro contacto', tpl: 'd1' }] } };
  const notReg = { ...LEAD, data: { ...LEAD.data, stage: 'contactado', log: [{ at: iso(4), txt: 'WhatsApp · Primeiro contacto', tpl: 'd1' }] } };
  await openAdmin(page, { view: 'playbook', tables: { admin_items: [reg, notReg] } });
  await page.getByRole('button', { name: /Resultados e consentimentos/ }).click();
  const row = page.locator('#tplStats tr', { hasText: 'Primeiro contacto' });
  await expect(row).toContainText('50%');
  await expect(row).toContainText('(1/2)');
});

// Campanha "Traz os teus clientes" (out/2026): o dono prefere WhatsApp a email,
// porque as pessoas leem. Os modelos têm de existir no painel, não são
// promocionais (são sobre o perfil do próprio profissional) e ficam registados.
for (const [tpl, trecho] of [['d12', 'link de avaliação'], ['d13', 'cartaz']]) {
  test(`modelo de campanha ${tpl}: abre o WhatsApp do profissional com o texto certo e regista o contacto`, async ({ page }) => {
    const calls = await openAdmin(page, { view: 'contact' });
    await page.evaluate(() => openPro('pro-1'));
    const popup = page.waitForEvent('popup');
    await page.locator('#drawer').getByRole('button', { name: 'WhatsApp com modelo' }).click();
    await page.locator('#ff_t').selectOption(tpl);
    await modalOk(page);
    const wa = await popup;
    const texto = new URL(wa.url()).searchParams.get('text');
    expect(texto).toContain('Olá Rui');
    expect(texto).toContain(trecho);
    expect(texto).toContain('flinko.pt/dashboard');
    await wa.close();
    await expect.poll(() => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items' && c.body && c.body.kind === 'contact').length).toBeGreaterThan(0);
  });
}
