// Funil de clientes no painel (admin-antigo.html › Crescimento e funil): junta os
// eventos contados no servidor (admin_event_counts) com o que já está na base
// de dados (perfis vistos, conversas, pedidos, trabalhos).
const { test, expect } = require('@playwright/test');
const { openAdmin, iso } = require('./fixtures/admin-mock');

const hoje = new Date().toISOString().slice(0, 10);

test('funil de clientes: mostra cada passo com os números dos últimos 30 dias', async ({ page }) => {
  await openAdmin(page, {
    view: 'growth',
    tables: {
      events: [{ day: hoje, name: 'pesquisa', n: 12 }, { day: hoje, name: 'perfil_contactar', n: 3 }, { day: hoje, name: 'pedido_iniciado', n: 2 }, { day: '2020-01-01', name: 'pesquisa', n: 999 }],
      conversations: [{ id: 'c1', professional_id: 'pro-1', client_id: 'cli-1', created_at: iso(2), last_message_at: iso(1) }],
      jobs: [{ id: 'j1', professional_id: 'pro-1', status: 'pago', paid_amount: 80, paid_at: iso(1), created_at: iso(5) }],
    },
  });
  const card = page.locator('.card', { hasText: 'Funil de clientes' });
  await expect(card).toBeVisible();
  const linha = (t) => card.locator('.fun', { hasText: t }).locator('.n b');
  await expect(linha('Pesquisaram')).toHaveText('12');
  await expect(linha('Carregaram em contactar')).toHaveText('3');
  await expect(linha('Conversas começadas')).toHaveText('1');
  await expect(linha('Começaram um pedido')).toHaveText('2');
  await expect(linha('Pedidos publicados')).toHaveText('1');
  await expect(linha('Trabalhos fechados')).toHaveText('1');
});

test('sem eventos (migração por aplicar): o funil aparece na mesma e explica porquê', async ({ page }) => {
  await openAdmin(page, { view: 'growth' });
  await expect(page.locator('.card', { hasText: 'Funil de clientes' })).toContainText('Ainda sem eventos');
});
