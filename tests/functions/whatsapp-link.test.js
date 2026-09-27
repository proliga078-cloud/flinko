// Testa assets/whatsapp-link.js — "Click to WhatsApp" (links wa.me).
//
// O que estes testes protegem:
//  - números portugueses ganham o 351 uma só vez (nunca 351351…);
//  - números inválidos, fixos ou vazios não geram link (o botão não aparece);
//  - a mensagem vai codificada (acentos, espaços, quebras de linha, & ? # +)
//    e volta igual quando o WhatsApp a descodifica;
//  - a mensagem de um pedido não leva contactos nem dados sensíveis.
const test = require('node:test');
const assert = require('node:assert/strict');
const wa = require('../../assets/whatsapp-link.js');

test('número português normal: 912345678 → 351912345678', () => {
  assert.equal(wa.numero('912345678'), '351912345678');
  assert.equal(wa.numero('912 345 678'), '351912345678');
  assert.equal(wa.numero('(91) 234-5678'), '351912345678');
  assert.equal(wa.numero('93.123.45.67'), '351931234567');
});

test('número já com +351 / 00351 / 351: nunca duplica o indicativo', () => {
  assert.equal(wa.numero('+351912345678'), '351912345678');
  assert.equal(wa.numero('+351 912 345 678'), '351912345678');
  assert.equal(wa.numero('00351 912345678'), '351912345678');
  assert.equal(wa.numero('351912345678'), '351912345678');
  assert.equal(wa.link('+351 912 345 678'), 'https://wa.me/351912345678');
});

test('números estrangeiros em formato internacional', () => {
  assert.equal(wa.numero('+33 6 12 34 56 78'), '33612345678');
  assert.equal(wa.numero('0044 7911 123456'), '447911123456');
  assert.equal(wa.numero('+55 (11) 91234-5678'), '5511912345678');
});

test('número inválido: sem link', () => {
  for (const v of ['223456789', '+351223456789', '12345', '9123456789', '+351 9123', 'abc', '91234567a', '+0 123456789', '++351912345678', '351', '+35191234567890']) {
    assert.equal(wa.numero(v), null, v);
    assert.equal(wa.link(v, 'Olá'), null, v);
  }
});

test('ausência de número do profissional: sem link e mensagem de fallback', () => {
  for (const v of [null, undefined, '', '   ']) {
    assert.equal(wa.numero(v), null);
    assert.equal(wa.link(v, 'Olá'), null);
  }
  assert.equal(wa.SEM_NUMERO, 'Este profissional não tem um número de WhatsApp disponível.');
});

const texto = (url) => decodeURIComponent(new URL(url).searchParams.get('text') === null ? '' : url.split('?text=')[1]);

test('mensagem com acentos: codificada e volta igual', () => {
  const msg = 'Olá! Instalação elétrica em Guimarães, çã õ ü';
  const u = wa.link('912345678', msg);
  assert.match(u, /^https:\/\/wa\.me\/351912345678\?text=/);
  assert.doesNotMatch(u.split('?text=')[1], /[áçãõü]/);
  assert.equal(texto(u), msg);
});

test('mensagem com espaços e quebras de linha: %20 e %0A, nunca espaços crus', () => {
  const msg = 'Linha um\n\nLinha   dois';
  const q = wa.link('912345678', msg).split('?text=')[1];
  assert.doesNotMatch(q, /[\s]/);
  assert.match(q, /%20/);
  assert.match(q, /%0A%0A/);
  assert.equal(decodeURIComponent(q), msg);
});

test('mensagem com caracteres especiais: & ? # + = / % " < > e emoji não partem o link', () => {
  const msg = 'Preço 50€ & IVA? #1 + extra = 100% "já" <ok> / 👍';
  const u = wa.link('912345678', msg);
  const q = u.split('?text=')[1];
  assert.doesNotMatch(q, /[&?#+=\s"<>]/);
  assert.equal(new URL(u).searchParams.get('text'), msg);
  assert.equal(decodeURIComponent(q), msg);
});

test('mensagemPedido: formato pedido, texto limpo e sem dados sensíveis', () => {
  const m = wa.mensagemPedido({
    servico: 'Trocar quadro elétrico (Eletricistas)',
    localizacao: 'Braga – Guimarães',
    descricao: 'Quadro   antigo,\n\ndisjuntores a saltar',
    url: 'https://flinko.pt/pedido.html?id=abc',
  });
  assert.equal(m, [
    'Olá! Recebeste um novo pedido através da Flinko.',
    '',
    'Serviço: Trocar quadro elétrico (Eletricistas)',
    'Localização: Braga – Guimarães',
    'Descrição: Quadro antigo, disjuntores a saltar',
    '',
    'Podes consultar todos os detalhes do pedido na Flinko:',
    'https://flinko.pt/pedido.html?id=abc',
    '',
    'Obrigado,',
    'Flinko',
  ].join('\n'));
  assert.doesNotMatch(m, /@|\+351|\b9\d{8}\b/);
  // descrições enormes são cortadas; sem descrição, a linha não aparece
  const longa = wa.mensagemPedido({ servico: 'x', descricao: 'a'.repeat(1000) });
  assert.ok(longa.split('\n').find((l) => l.startsWith('Descrição:')).length <= 312);
  assert.doesNotMatch(wa.mensagemPedido({ servico: 'x' }), /Descrição/);
  // o link completo continua dentro do limite prático dos URLs
  assert.ok(wa.link('912345678', longa).length < 2000);
});
