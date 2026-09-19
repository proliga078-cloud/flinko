// Testa as páginas locais de SEO (local-page.js) e o respetivo sitemap
// (sitemap-local.js): /eletricistas/braga, /pintores/porto, ...
//
// O que protege:
//  - só é indexável com profissionais reais (sem ninguém: noindex);
//  - categorias e cidades inexistentes dão 404 a sério;
//  - nada vindo da base de dados executa HTML/JS (nomes, bio, localização);
//  - o sitemap só lista combinações com pelo menos 1 profissional.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.URL = 'https://flinko.pt';

const PAGE_PATH = require.resolve('../../netlify/functions/local-page.js');
const MAP_PATH = require.resolve('../../netlify/functions/sitemap-local.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, PAGE_PATH);
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, MAP_PATH);

const page = require(PAGE_PATH).handler;
const sitemap = require(MAP_PATH).handler;

const pro = (over) => ({
  id: 'id-' + Math.random().toString(36).slice(2, 8), name: 'Ana Silva', slug: null, bio: 'Bio', photo_url: null,
  category: 'Eletricistas', location: 'Braga – Guimarães', verified: false, plan: 'free',
  avg_response_minutes: null, response_sample_count: 0, created_at: '2026-01-01T00:00:00Z', ...over,
});

function reset(pros, error = null) {
  scenario.log = [];
  scenario.queries = { profiles: () => ({ data: error ? null : pros, error }) };
}
const ev = (cat, city) => ({ queryStringParameters: { cat, city } });

test('categoria e cidade com profissionais: 200, indexável, título e canonical corretos', async () => {
  reset([pro({ name: 'Rui Braga', location: 'Braga – Braga' })]);
  const res = await page(ev('eletricistas', 'braga'));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>Eletricistas em Braga – Encontra e contrata \| Flinko<\/title>/);
  assert.match(res.body, /<meta name="robots" content="index, follow">/);
  assert.match(res.body, /<link rel="canonical" href="https:\/\/flinko\.pt\/eletricistas\/braga">/);
  assert.match(res.body, /Rui Braga/);
  assert.match(res.body, /1 profissional em Braga/);
});

test('REGRESSÃO: lê categoria e cidade do caminho (/.netlify/functions/local-page/:cat/:city), como o Netlify as passa', async () => {
  reset([pro({ location: 'Braga – Braga' })]);
  const res = await page({ path: '/.netlify/functions/local-page/eletricistas/braga' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Eletricistas em Braga/);
  const com = await page({ path: '/.netlify/functions/local-page/eletricistas/viana%20do%20castelo' });
  assert.equal(com.statusCode, 200);
  assert.equal((await page({ path: '/.netlify/functions/local-page/%E0%A4%A/x' })).statusCode, 404);
});

test('REGRESSÃO: num redirect o Netlify entrega o caminho original (/eletricistas/braga)', async () => {
  reset([pro({ location: 'Braga – Braga' })]);
  const res = await page({ path: '/eletricistas/braga' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Eletricistas em Braga/);
  assert.equal((await page({ path: '/eletricistas/cidade-x' })).statusCode, 404);
});

test('só mostra profissionais da categoria pedida e da zona pedida', async () => {
  reset([
    pro({ name: 'Eletricista Braga', location: 'Braga – Braga' }),
    pro({ name: 'Eletricista Porto', location: 'Porto – Porto' }),
    pro({ name: 'Pintor Braga', category: 'Pintores', location: 'Braga – Braga' }),
  ]);
  const res = await page(ev('eletricistas', 'braga'));
  assert.match(res.body, /Eletricista Braga/);
  assert.ok(!res.body.includes('Eletricista Porto'));
  assert.ok(!res.body.includes('Pintor Braga') || /Outros serviços/.test(res.body));
  const cartoes = res.body.split('class="card"').length - 1;
  assert.equal(cartoes, 1);
});

test('cidade (parte depois do distrito) também tem página: /eletricistas/guimaraes', async () => {
  reset([pro({ name: 'Rui', location: 'Braga – Guimarães' })]);
  const res = await page(ev('eletricistas', 'guimaraes'));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Eletricistas em Guimarães/);
  assert.match(res.body, /Rui/);
});

test('distrito válido mas sem ninguém: abre, mas com noindex e convite a publicar pedido', async () => {
  reset([pro({ location: 'Porto – Porto' })]);
  const res = await page(ev('eletricistas', 'faro'));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /noindex, follow/);
  assert.match(res.body, /Ainda não há eletricistas em Faro/);
  assert.match(res.body, /Publicar pedido grátis/);
});

test('categoria desconhecida ou cidade que não existe: 404', async () => {
  reset([pro()]);
  assert.equal((await page(ev('canalhas', 'braga'))).statusCode, 404);
  assert.equal((await page(ev('eletricistas', 'cidade-inventada'))).statusCode, 404);
  assert.equal((await page({ queryStringParameters: {} })).statusCode, 404);
});

test('SEGURANÇA: nome, bio, localização e foto com HTML são escapados', async () => {
  reset([pro({
    name: '<img src=x onerror=alert(1)>', bio: '<script>alert(2)</script>',
    location: 'Braga – <b>Braga</b>', photo_url: 'javascript:alert(3)', slug: 'x" onmouseover="alert(4)',
  })]);
  const res = await page(ev('eletricistas', 'braga'));
  assert.ok(!res.body.includes('<img src=x onerror'));
  assert.ok(!res.body.includes('<script>alert(2)'));
  assert.ok(!res.body.includes('javascript:alert(3)'), 'foto com javascript: não pode ir para o src');
  assert.ok(!/href="\/x" onmouseover/.test(res.body), 'slug com aspas não pode sair do href');
  assert.match(res.body, /&lt;img src=x onerror/);
});

test('JSON-LD: "<" é escapado para nunca fechar a tag <script>', async () => {
  reset([pro({ name: '</script><script>alert(1)</script>' })]);
  const res = await page(ev('eletricistas', 'braga'));
  const blocos = res.body.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  assert.ok(blocos.length >= 2);
  for (const b of blocos) {
    const conteudo = b.replace('<script type="application/ld+json">', '').replace(/<\/script>$/, '');
    assert.ok(!conteudo.includes('<'), 'nenhum "<" cru dentro do JSON-LD');
    JSON.parse(conteudo);
  }
});

test('planos pagos e verificados aparecem primeiro', async () => {
  reset([
    pro({ name: 'Gratis Antigo', created_at: '2025-01-01T00:00:00Z' }),
    pro({ name: 'Pago Pro', plan: 'pro' }),
    pro({ name: 'Verificado', verified: true }),
  ]);
  const res = await page(ev('eletricistas', 'braga'));
  const ordem = ['Pago Pro', 'Verificado', 'Gratis Antigo'].map((n) => res.body.indexOf(n));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
});

test('ligações internas: outras categorias na mesma zona e a mesma categoria noutras zonas', async () => {
  reset([
    pro({ location: 'Braga – Braga' }),
    pro({ category: 'Pintores', location: 'Braga – Braga' }),
    pro({ category: 'Eletricistas', location: 'Porto – Porto' }),
  ]);
  const res = await page(ev('eletricistas', 'braga'));
  assert.match(res.body, /href="\/pintores\/braga"/);
  assert.match(res.body, /href="\/eletricistas\/porto"/);
});

test('só consulta profissionais aprovados, não suspensos e não demo', async () => {
  reset([pro()]);
  await page(ev('eletricistas', 'braga'));
  const filtros = scenario.log[0].calls.filter((c) => c.method === 'eq').map((c) => c.args.join('='));
  assert.ok(filtros.includes('approved=true'));
  assert.ok(filtros.includes('suspended=false'));
  assert.ok(filtros.includes('is_demo=false'));
});

test('erro da base de dados: 500 (não devolve uma página "vazia" indexável)', async () => {
  reset(null, { message: 'db em baixo' });
  const res = await page(ev('eletricistas', 'braga'));
  assert.equal(res.statusCode, 500);
});

test('sitemap: só combinações com profissionais, distrito e cidade, sem duplicados', async () => {
  reset([
    pro({ location: 'Braga – Guimarães' }),
    pro({ location: 'Braga – Guimarães' }),
    pro({ category: 'Pintores', location: 'Porto – Porto' }),
  ]);
  const res = await sitemap();
  assert.equal(res.statusCode, 200);
  const urls = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(urls, [
    'https://flinko.pt/eletricistas/braga',
    'https://flinko.pt/eletricistas/guimaraes',
    'https://flinko.pt/pintores/porto',
  ]);
});

test('sitemap: erro da BD devolve um sitemap vazio mas válido (nunca um erro ao Google)', async () => {
  reset(null, { message: 'db em baixo' });
  const res = await sitemap();
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<urlset[^>]*><\/urlset>/);
});
