// Testa assets/gestao-numeros.js: os números da parte "Números e decisões"
// do painel de gestão. O que protegem:
//  - a equipa e os profissionais não contam como visitantes (eram a maioria);
//  - cada visita fica com o canal certo (Google, Facebook, IA, direto…) e os
//    passos internos (o próprio site, o login do Google) não contam como canal;
//  - procura e oferta por ofício, e as recomendações só aparecem com o número
//    que as justifica.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../../assets/gestao-numeros.js');

const linha = (visitor_id, path, ref_host = 'Direto', day = '2026-10-15', user_id = null) => ({ visitor_id, path, ref_host, day, user_id, n: 1 });

test('canal: agrupa as origens e marca os passos internos', () => {
  assert.equal(N.canal('google.com'), 'Google');
  assert.equal(N.canal('google.pt'), 'Google');
  assert.equal(N.canal('l.facebook.com'), 'Facebook');
  assert.equal(N.canal('l.instagram.com'), 'Instagram');
  assert.equal(N.canal('chatgpt.com'), 'IA (ChatGPT e outros)');
  assert.equal(N.canal('Direto'), 'Direto');
  assert.equal(N.canal('flinko.pt'), 'Interno');
  assert.equal(N.canal('accounts.google.com'), 'Interno');
  assert.equal(N.canal('checkout.stripe.com'), 'Interno');
  assert.equal(N.canal('olx.pt'), 'Outros sites');
});

test('pagina: reconhece ofícios, perfis com link próprio e as páginas do site', () => {
  assert.deepEqual(N.pagina('/eletricistas'), { tipo: 'categoria', categoria: 'Eletricistas' });
  assert.deepEqual(N.pagina('/pintores.html'), { tipo: 'categoria', categoria: 'Pintores' });
  assert.equal(N.pagina('/profile.html').tipo, 'perfil');
  assert.equal(N.pagina('/rui-eletricista').tipo, 'perfil');
  assert.equal(N.pagina('/').tipo, 'inicio');
  assert.equal(N.pagina('/pedidos').tipo, 'pedidos');
  assert.equal(N.pagina('/dashboard.html').tipo, 'painel');
  assert.equal(N.pagina('/blog-limpeza-precos').tipo, 'outra');
});

test('visitantes: tira quem alguma vez entrou com conta profissional ou de admin', () => {
  const rows = [
    linha('v-cliente', '/', 'google.com'),
    linha('v-cliente', '/eletricistas', 'flinko.pt'),
    linha('v-cliente', '/rui', 'flinko.pt'),
    linha('v-pro', '/', 'Direto'),
    linha('v-pro', '/dashboard', 'flinko.pt', '2026-10-16', 'pro-1'),
  ];
  const vis = N.visitantes(rows, new Set(['pro-1']));
  assert.deepEqual(vis.map((v) => v.id), ['v-cliente']);
  assert.equal(vis[0].canal, 'Google', 'o canal é a origem de fora, não os passos dentro do site');
  assert.deepEqual(Object.keys(vis[0].categorias), ['Eletricistas']);
  assert.deepEqual(N.caminho(vis).map((p) => p.n), [1, 1, 1, 0]);
});

test('porCanal: visitantes por canal e quantos chegaram a um perfil', () => {
  const vis = N.visitantes([
    linha('a', '/', 'google.com'), linha('a', '/rui', 'flinko.pt'),
    linha('b', '/', 'google.com'),
    linha('c', '/', 'l.facebook.com'),
  ], new Set());
  assert.deepEqual(N.porCanal(vis), [
    { canal: 'Google', visitantes: 2, viramPerfil: 1 },
    { canal: 'Facebook', visitantes: 1, viramPerfil: 0 },
  ]);
});

test('procuraOferta: junta procura (visitas e pedidos) e profissionais prontos por ofício', () => {
  const vis = N.visitantes([linha('a', '/canalizadores'), linha('b', '/canalizadores')], new Set());
  const pros = [{ id: 'p1', category: 'Pintores', _pontos: 80 }, { id: 'p2', category: 'Pintores', _pontos: 90 }, { id: 'p3', category: 'Canalizadores', _pontos: 30 }];
  const t = N.procuraOferta(vis, pros, [{ category: 'Canalizadores' }]);
  assert.deepEqual(t[0], { categoria: 'Canalizadores', procura: 2, pedidos: 1, profissionais: 1, prontos: 0 });
  assert.deepEqual(t[1], { categoria: 'Pintores', procura: 0, pedidos: 0, profissionais: 2, prontos: 2 });
});

test('recomendações: completas (situação, estudo, passos, medida) e só quando os números as justificam', () => {
  const vis = N.visitantes([linha('a', '/canalizadores', 'google.com'), linha('b', '/', 'google.com')], new Set());
  const pros = [{ id: 'p1', category: 'Pintores', _pontos: 80, verified: true, location: 'Lisboa – Sintra' }, { id: 'p2', category: 'Pintores', _pontos: 90, verified: false, location: 'Lisboa' }, { id: 'p3', category: 'Canalizadores', _pontos: 30, location: 'Lisboa' }];
  const rec = N.recomendacoes({
    dias: 30, avaliacoes: 2, caminho: N.caminho(vis), canais: N.porCanal(vis), procuraOferta: N.procuraOferta(vis, pros, []),
    distritos: N.porDistrito(pros, []), caminhoPro: N.caminhoPro(pros, new Set()),
  });
  const ids = rec.map((r) => r.id);
  assert.deepEqual(ids.slice(0, 2).sort(), ['angariar', 'trafego'], 'prioridade 1 primeiro');
  for (const id of ['canal', 'divulgar', 'local']) assert.ok(ids.includes(id), id);
  for (const r of rec) {
    assert.ok(r.situacao.length > 60 && r.estudo.length > 60, r.id + ': explicação completa');
    assert.ok(r.passos.length >= 3, r.id + ': pelo menos 3 passos');
    assert.ok(r.medir, r.id + ': diz como medir');
  }
  assert.match(rec.find((r) => r.id === 'trafego').situacao, /2 visitantes reais em 30 dias/);
  assert.match(rec.find((r) => r.id === 'local').situacao, /Lisboa tem 3 profissionais e 0 pedidos/);
  assert.ok(rec.find((r) => r.id === 'angariar').situacao.includes('Canalizadores (1 visitas, 0 pedidos)'));
  assert.ok(!ids.includes('confianca'), 'sem visitas a perfis suficientes, não fala de confiança');
  assert.ok(rec.length <= 7);
});

test('semanas: conta visitantes reais por semana, de segunda a domingo', () => {
  const vis = N.visitantes([linha('a', '/', 'Direto', '2026-10-13'), linha('b', '/', 'Direto', '2026-10-19'), linha('c', '/', 'Direto', '2026-10-06')], new Set());
  const s = N.semanas(vis, 2, '2026-10-20');
  assert.deepEqual(s.map((x) => [x.desde, x.ate, x.n]), [['2026-10-12', '2026-10-18', 1], ['2026-10-19', '2026-10-25', 1]]);
});

test('recomendação de canal: com um só canal de fora não escreve "Os outros: ."', () => {
  const vis = N.visitantes([linha('a', '/canalizadores', 'google.com'), linha('b', '/', 'google.com')], new Set());
  const rec = N.recomendacoes({ dias: 30, avaliacoes: 0, caminho: N.caminho(vis), canais: N.porCanal(vis), procuraOferta: [], distritos: [], caminhoPro: N.caminhoPro([], new Set()) });
  const canal = rec.find((r) => r.id === 'canal');
  assert.ok(canal, 'há recomendação de canal');
  assert.ok(!/Os outros: \./.test(canal.situacao), canal.situacao);
});
