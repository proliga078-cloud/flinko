// Testa assets/pros-search.js — a lógica de filtrar/ordenar/paginar profissionais
// partilhada pelas páginas de listagem.
//
// REGRESSÃO principal: antes os filtros (plano, avaliação, preço) e a ordenação
// por avaliação/preço eram aplicados só aos 12 resultados da página atual, depois
// de a base de dados já ter paginado. "4+ estrelas" ignorava quem estava na
// página 2, a contagem não refletia os filtros e a ordenação só reordenava 12.
const test = require('node:test');
const assert = require('node:assert/strict');
const PS = require('../../assets/pros-search.js');
const { makeQueryableSupabase } = require('./helpers/queryable');

let n = 0;
const pro = (over) => ({
  id: 'p' + ++n, name: 'Pro ' + n, slug: null, category: 'Eletricistas', location: 'Porto – Porto', plan: 'free',
  verified: false, created_at: '2026-01-' + String(10 + (n % 18)).padStart(2, '0') + 'T00:00:00Z',
  avg_response_minutes: null, response_sample_count: 0, ...over,
});
const base = (pros, avaliacoes = [], servicos = []) => ({
  pros, rMap: PS.resumirAvaliacoes(avaliacoes), pMap: PS.precosMinimos(servicos),
});
const rev = (id, ...notas) => notas.map((rating) => ({ professional_id: id, rating }));

test('REGRESSÃO: o filtro de avaliação vê TODOS os profissionais, não só a 1.ª página', () => {
  // 30 profissionais; só os 3 últimos (que a paginação antiga mandava para a página 3) têm 5 estrelas
  const pros = Array.from({ length: 30 }, () => pro());
  const bons = pros.slice(-3);
  const avaliacoes = bons.flatMap((p) => rev(p.id, 5, 5));
  const r = PS.consultar(base(pros, avaliacoes), { minRating: 4, page: 1, perPage: 12 });
  assert.equal(r.total, 3, 'a contagem tem de refletir o filtro');
  assert.deepEqual(r.items.map((p) => p.id).sort(), bons.map((p) => p.id).sort());
  assert.equal(r.totalPages, 1);
});

test('REGRESSÃO: ordenar por avaliação ordena o conjunto completo (o melhor da "página 3" vem primeiro)', () => {
  const pros = Array.from({ length: 30 }, () => pro());
  const melhor = pros[29];
  const avaliacoes = [...rev(melhor.id, 5, 5, 5), ...rev(pros[0].id, 3)];
  const r = PS.consultar(base(pros, avaliacoes), { sort: 'rating', page: 1, perPage: 12 });
  assert.equal(r.items[0].id, melhor.id);
  assert.equal(r.items[1].id, pros[0].id);
});

test('REGRESSÃO: filtro de preço e ordenar por menor preço sobre o conjunto completo', () => {
  const pros = Array.from({ length: 20 }, () => pro());
  const servicos = [
    { professional_id: pros[19].id, price_from: 15 },
    { professional_id: pros[19].id, price_from: 25 },
    { professional_id: pros[5].id, price_from: 40 },
    { professional_id: pros[0].id, price_from: 90 },
  ];
  const barato = PS.consultar(base(pros, [], servicos), { sort: 'price_asc', perPage: 12 });
  assert.equal(barato.items[0].id, pros[19].id, 'usa o menor preço do profissional (15)');
  assert.deepEqual(barato.items.slice(0, 3).map((p) => p.id), [pros[19].id, pros[5].id, pros[0].id]);
  // sem preço vai para o fim
  assert.ok(!barato.items.slice(0, 3).some((p) => p.id === pros[10].id));

  const faixa = PS.consultar(base(pros, [], servicos), { priceMin: 30, priceMax: 100 });
  assert.deepEqual(faixa.items.map((p) => p.id).sort(), [pros[0].id, pros[5].id].sort());
});

test('preço: sem preço indicado só fica de fora se houver mínimo; com só máximo continua a aparecer', () => {
  const a = pro(), b = pro();
  const bs = base([a, b], [], [{ professional_id: a.id, price_from: 20 }]);
  assert.equal(PS.filtrar(bs.pros, bs, { priceMin: 10 }).length, 1);
  assert.equal(PS.filtrar(bs.pros, bs, { priceMax: 50 }).length, 2);
  assert.equal(PS.filtrar(bs.pros, bs, { priceMax: 10 }).length, 1, 'quem cobra 20 sai; sem preço fica');
});

test('avaliação mínima: sem avaliações fica de fora; média exata no limite conta', () => {
  const a = pro(), b = pro(), c = pro();
  const bs = base([a, b, c], [...rev(a.id, 4, 4), ...rev(b.id, 5, 3)]);
  assert.deepEqual(PS.filtrar(bs.pros, bs, { minRating: 4 }).map((p) => p.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(PS.filtrar(bs.pros, bs, { minRating: 4.5 }).map((p) => p.id), []);
});

test('REGRESSÃO: "Destaque primeiro" põe Pro à frente do Starter (antes era ordem alfabética invertida)', () => {
  const free = pro({ plan: 'free', verified: true });
  const starter = pro({ plan: 'starter' });
  const proP = pro({ plan: 'pro' });
  const premium = pro({ plan: 'premium' });
  const empresas = pro({ plan: 'empresas' });
  const r = PS.consultar(base([free, starter, proP, premium, empresas]), { sort: 'plan', perPage: 12 });
  const ordem = r.items.map((p) => p.plan);
  const ultimoDestaque = Math.max(...['pro', 'premium', 'empresas'].map((x) => ordem.indexOf(x)));
  const primeiroOutro = Math.min(ordem.indexOf('free'), ordem.indexOf('starter'));
  assert.ok(ultimoDestaque < primeiroOutro, 'todos os planos com destaque antes de free/starter: ' + ordem.join(','));
  assert.equal(r.items[3].plan, 'free', 'dentro dos restantes, o verificado vem primeiro');
});

test('planos com destaque ficam à frente em TODAS as ordenações (benefício do plano Pro)', () => {
  const normal = pro(), proP = pro({ plan: 'pro' });
  const avaliacoes = rev(normal.id, 5, 5, 5);
  for (const sort of ['plan', 'rating', 'price_asc', 'newest', 'response']) {
    const r = PS.consultar(base([normal, proP], avaliacoes), { sort });
    assert.equal(r.items[0].id, proP.id, sort);
  }
});

test('filtro de plano: Pro inclui Empresas; Premium é separado', () => {
  const a = pro({ plan: 'pro' }), b = pro({ plan: 'empresas' }), c = pro({ plan: 'premium' }), d = pro({ plan: 'free' });
  const bs = base([a, b, c, d]);
  assert.deepEqual(PS.filtrar(bs.pros, bs, { planos: ['pro'] }).map((p) => p.plan).sort(), ['empresas', 'pro']);
  assert.deepEqual(PS.filtrar(bs.pros, bs, { planos: ['premium'] }).map((p) => p.plan), ['premium']);
  assert.equal(PS.filtrar(bs.pros, bs, { planos: [] }).length, 4);
});

test('filtro "responde em menos de 1 hora" e ordenar por tempo de resposta', () => {
  const rapido = pro({ avg_response_minutes: 10, response_sample_count: 5 });
  const medio = pro({ avg_response_minutes: 50, response_sample_count: 3 });
  const lento = pro({ avg_response_minutes: 300, response_sample_count: 8 });
  const semDados = pro({ avg_response_minutes: 5, response_sample_count: 0 }); // amostra 0 não conta
  const bs = base([lento, semDados, medio, rapido]);
  assert.deepEqual(PS.filtrar(bs.pros, bs, { rapido: true }).map((p) => p.id).sort(), [rapido.id, medio.id].sort());
  const r = PS.consultar(bs, { sort: 'response', perPage: 12 });
  assert.deepEqual(r.items.map((p) => p.id), [rapido.id, medio.id, lento.id, semDados.id]);
});

test('paginação: total de páginas, cortes e página fora do intervalo', () => {
  const lista = Array.from({ length: 30 }, () => pro());
  const bs = base(lista);
  const p1 = PS.consultar(bs, { page: 1, perPage: 12 });
  const p3 = PS.consultar(bs, { page: 3, perPage: 12 });
  assert.equal(p1.items.length, 12);
  assert.equal(p3.items.length, 6);
  assert.equal(p1.totalPages, 3);
  assert.equal(PS.consultar(bs, { page: 99, perPage: 12 }).page, 3, 'página a mais volta à última');
  assert.equal(PS.consultar(bs, { page: -4, perPage: 12 }).page, 1);
  const vazio = PS.consultar(base([]), { page: 1 });
  assert.deepEqual([vazio.total, vazio.totalPages, vazio.items.length], [0, 1, 0]);
  // páginas não repetem nem perdem ninguém
  const ids = [1, 2, 3].flatMap((pg) => PS.consultar(bs, { page: pg, perPage: 12 }).items.map((p) => p.id));
  assert.equal(new Set(ids).size, 30);
});

test('ordenar não altera a lista original', () => {
  const lista = [pro(), pro({ plan: 'pro' })];
  const copia = lista.map((p) => p.id);
  PS.ordenar(lista, base(lista), 'plan');
  assert.deepEqual(lista.map((p) => p.id), copia);
});

test('sanitizarPesquisa remove os caracteres que partem o filtro .or() do PostgREST', () => {
  assert.equal(PS.sanitizarPesquisa('Lisboa, Porto'), 'Lisboa Porto');
  assert.equal(PS.sanitizarPesquisa('a),is_admin.eq.true,(b'), 'a is_admin.eq.true b');
  assert.equal(PS.sanitizarPesquisa(null), '');
  assert.equal(PS.sanitizarPesquisa('x'.repeat(200)).length, 80);
});

// ---- carregar(): consultas ao servidor e cache ----
function fakeDb(scenario) {
  return makeQueryableSupabase(scenario)();
}

test('carregar: filtros no servidor, avaliações/preços em lotes e cache enquanto os filtros não mudam', async () => {
  const scenario = { log: [] };
  const pros = Array.from({ length: 230 }, (_, i) => pro({ id: 'x' + i }));
  scenario.queries = {
    profiles: () => ({ data: pros, error: null }),
    reviews: () => ({ data: [{ professional_id: 'x0', rating: 5 }], error: null }),
    services: () => ({ data: [{ professional_id: 'x0', price_from: 30 }], error: null }),
  };
  const db = fakeDb(scenario);
  PS.limparCache();

  const b1 = await PS.carregar(db, { cat: 'Eletricistas', loc: 'Porto', q: 'a, b', verified: true });
  assert.equal(b1.pros.length, 230);
  assert.equal(PS.consultar(b1, { minRating: 4 }).total, 1);

  const perfis = scenario.log.filter((l) => l.table === 'profiles')[0].calls;
  const metodos = perfis.map((c) => c.method + ':' + c.args.join('|'));
  assert.ok(metodos.some((m) => m.startsWith('ilike:category|%Eletricistas%')));
  assert.ok(metodos.some((m) => m.startsWith('ilike:location|%Porto%')));
  assert.ok(metodos.some((m) => m.startsWith('eq:verified|true')));
  assert.ok(metodos.some((m) => m.startsWith('eq:is_demo|false')));
  assert.ok(metodos.some((m) => m.includes('name.ilike.%a b%')), 'pesquisa sanitizada');
  assert.ok(metodos.some((m) => m.startsWith('limit:500')));
  const lotesReviews = scenario.log.filter((l) => l.table === 'reviews').length;
  assert.equal(lotesReviews, 3, '230 ids em lotes de 100 = 3 pedidos');

  const consultasAntes = scenario.log.length;
  await PS.carregar(db, { cat: 'Eletricistas', loc: 'Porto', q: 'a, b', verified: true });
  assert.equal(scenario.log.length, consultasAntes, 'mesmos filtros = cache, sem pedidos novos');
  await PS.carregar(db, { cat: 'Pintores' });
  assert.ok(scenario.log.length > consultasAntes, 'filtro de servidor diferente = novo pedido');
});

test('carregar: erro da base de dados devolve error e listas vazias (a página mostra a mensagem)', async () => {
  const scenario = { log: [], queries: { profiles: () => ({ data: null, error: { message: 'falhou' } }) } };
  PS.limparCache();
  const b = await PS.carregar(fakeDb(scenario), {});
  assert.equal(b.error.message, 'falhou');
  assert.deepEqual(b.pros, []);
});

// Out/2026 (Baymard: custos inesperados são a 1.ª razão para desistir): o
// cartão mostrava só "A partir de €20", sem dizer se era à hora ou pelo
// trabalho todo. E o tempo de resposta só aparecia no perfil.
test('unidadesDosPrecos: guarda a unidade do serviço mais barato de cada profissional', () => {
  const u = PS.unidadesDosPrecos([
    { professional_id: 'a', price_from: 40, price_unit: 'trabalho' },
    { professional_id: 'a', price_from: 15, price_unit: 'hora' },
    { professional_id: 'b', price_from: 0, price_unit: 'hora' },
    { professional_id: 'c', price_from: 8, price_unit: 'm²' },
  ]);
  assert.deepEqual(u, { a: 'hora', c: 'm²' });
});

test('textoPreco: diz a unidade em português claro', () => {
  assert.equal(PS.textoPreco(15, 'hora'), 'A partir de €15/hora');
  assert.equal(PS.textoPreco(8, 'm²'), 'A partir de €8/m²');
  assert.equal(PS.textoPreco(40, 'trabalho'), 'A partir de €40 por trabalho');
  assert.equal(PS.textoPreco(40, null), 'A partir de €40');
  assert.equal(PS.textoPreco(null, 'hora'), null);
});

test('textoResposta: só com amostra real (3+) e quando responde em menos de 1 dia', () => {
  assert.equal(PS.textoResposta({ avg_response_minutes: 25, response_sample_count: 3 }), 'Responde em ~25 min');
  assert.equal(PS.textoResposta({ avg_response_minutes: 130, response_sample_count: 5 }), 'Responde em ~2 h');
  assert.equal(PS.textoResposta({ avg_response_minutes: 25, response_sample_count: 2 }), null);
  assert.equal(PS.textoResposta({ avg_response_minutes: 2000, response_sample_count: 9 }), null);
  assert.equal(PS.textoResposta({ avg_response_minutes: null, response_sample_count: 0 }), null);
});
