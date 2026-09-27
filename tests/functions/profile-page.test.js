// Testa netlify/functions/profile-page.js: o perfil servido com título,
// descrição, imagem de partilha, dados estruturados e resumo já no HTML.
//
// O que protege:
//  - perfis por link próprio (/o-nome) e por id (?id=uuid) saem com os dados certos;
//  - perfis inexistentes, suspensos ou por aprovar dão 404 com noindex;
//  - nada vindo da base de dados executa HTML/JS (nem dentro do JSON-LD);
//  - se a base de dados falhar, a página abre na mesma (como antes da função).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const FN_PATH = require.resolve('../../netlify/functions/profile-page.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, FN_PATH);
const { handler, whoFrom } = require(FN_PATH);

const ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
const pro = (over) => ({ id: ID, name: 'Rui Braga', bio: 'Instalações elétricas em casas e empresas.', category: 'Eletricistas', location: 'Braga – Guimarães', photo_url: 'https://cdn.x/foto.jpg', slug: null, verified: true, experience_years: 10, ...over });

function reset({ profile = pro(), services = [], ratings = [], error = null } = {}) {
  scenario.log = [];
  scenario.queries = {
    profiles: () => ({ data: error ? null : (profile ? [profile] : []), error }),
    services: () => ({ data: services, error: null }),
    reviews: () => ({ data: ratings, error: null }),
  };
}
const filtros = (table) => scenario.log.find((e) => e.table === table).calls.filter((c) => c.method === 'eq').map((c) => c.args);

test('perfil por id: 200 com título, descrição, canonical, imagem e resumo no HTML', async () => {
  reset({ services: [{ title: 'Quadro elétrico', price_from: 120 }], ratings: [{ rating: 5 }, { rating: 4 }] });
  const res = await handler({ queryStringParameters: { id: ID } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title id="meta-title">Rui Braga – Eletricistas em Braga – Guimarães \| Flinko<\/title>/);
  assert.match(res.body, /id="meta-description" name="description" content="Instalações elétricas em casas e empresas\."/);
  assert.match(res.body, new RegExp(`id="meta-canonical" rel="canonical" href="https://flinko\\.pt/profile\\.html\\?id=${ID}"`));
  assert.match(res.body, /id="meta-og-image" property="og:image" content="https:\/\/cdn\.x\/foto\.jpg"/);
  assert.match(res.body, /class="ssr-profile"[\s\S]*<h1[^>]*>Rui Braga<\/h1>/);
  assert.match(res.body, /Quadro elétrico — a partir de 120/);
  assert.match(res.body, /4,5 ★ \(2 avaliações\)/);
  const ld = JSON.parse(res.body.match(/<script type="application\/ld\+json" id="structured-data-ld">(.*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'LocalBusiness');
  assert.deepEqual(ld.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 });
  assert.equal(ld.makesOffer[0].itemOffered.name, 'Quadro elétrico');
  // só perfis públicos: aprovados, não suspensos, não demo
  assert.deepEqual(filtros('profiles'), [['approved', true], ['suspended', false], ['is_demo', false], ['id', ID]]);
});

test('perfil por link próprio (/o-nome): lê o slug do caminho, como o Netlify o passa', async () => {
  reset({ profile: pro({ slug: 'rui-braga' }) });
  const res = await handler({ path: '/.netlify/functions/profile-page/rui-braga' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /href="https:\/\/flinko\.pt\/rui-braga"/);
  assert.deepEqual(filtros('profiles').at(-1), ['slug', 'rui-braga']);
});

test('REGRESSÃO: também aceita o caminho original (/o-nome), como o Netlify o passa nas reescritas', async () => {
  reset({ profile: pro({ slug: 'deixaqueeureparo' }) });
  const res = await handler({ path: '/deixaqueeureparo' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(filtros('profiles').at(-1), ['slug', 'deixaqueeureparo']);
  assert.equal((await handler({ path: '/.netlify/functions/profile-page' })).statusCode, 404);
});

test('sem avaliações nem bio: sem aggregateRating e com descrição de reserva', async () => {
  reset({ profile: pro({ bio: null, photo_url: null }) });
  const res = await handler({ queryStringParameters: { id: ID } });
  const ld = JSON.parse(res.body.match(/id="structured-data-ld">(.*?)<\/script>/)[1]);
  assert.equal(ld.aggregateRating, undefined);
  assert.match(res.body, /content="Eletricistas em Braga – Guimarães\. Vê os serviços/);
  assert.match(res.body, /og:image" content="https:\/\/flinko\.pt\/assets\/og-image\.png"/);
});

test('perfil inexistente (ou suspenso/por aprovar, que a consulta exclui): 404 com noindex', async () => {
  reset({ profile: null });
  const res = await handler({ path: '/.netlify/functions/profile-page/nao-existe' });
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /id="meta-robots" name="robots" content="noindex, nofollow"/);
});

test('caminhos e ids inválidos nem chegam à base de dados', async () => {
  reset();
  for (const ev of [{ path: '/.netlify/functions/profile-page/a' }, { path: '/.netlify/functions/profile-page/%E0%A4%A' }, { path: '/.netlify/functions/profile-page/x.php' }, { queryStringParameters: { id: 'nao-e-uuid' } }]) {
    assert.equal((await handler(ev)).statusCode, 404);
  }
  assert.equal(scenario.log.length, 0);
  assert.deepEqual(whoFrom({ path: '/.netlify/functions/profile-page/Rui-Braga/' }), { slug: 'rui-braga' });
});

test('SEGURANÇA: nome/bio com HTML ficam escapados, também dentro do JSON-LD', async () => {
  reset({ profile: pro({ name: '<img src=x onerror=alert(1)>', bio: '"><script>alert(2)</script>' }), services: [{ title: '</script><script>alert(3)</script>' }] });
  const res = await handler({ queryStringParameters: { id: ID } });
  assert.doesNotMatch(res.body, /<img src=x/);
  assert.doesNotMatch(res.body, /<script>alert/);
  assert.match(res.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('imagem de partilha só aceita https (nada de javascript: nem http)', async () => {
  reset({ profile: pro({ photo_url: 'javascript:alert(1)' }) });
  const res = await handler({ queryStringParameters: { id: ID } });
  assert.match(res.body, /og:image" content="https:\/\/flinko\.pt\/assets\/og-image\.png"/);
});

test('se a base de dados falhar, a página abre na mesma (sem cache)', async () => {
  reset({ error: { message: 'timeout' } });
  const res = await handler({ queryStringParameters: { id: ID } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.match(res.body, /<title id="meta-title">Perfil Profissional – Flinko<\/title>/);
});
