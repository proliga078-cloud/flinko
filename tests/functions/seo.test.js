// Testes de SEO das páginas públicas (sem browser).
//
// Porquê existem: a auditoria de out/2026 encontrou três problemas. Os links
// internos usavam /eletricistas mas o canonical dizia /eletricistas.html (o
// Google via dois endereços para a mesma página); o sitemap.xml não tinha 4
// artigos da Academia nem a calculadora; e páginas importantes tinham títulos
// curtos que não diziam nada a quem pesquisa ("Pedidos de Clientes – Flinko").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// profile.html recebe o canonical certo da função profile-page (um por perfil).
const FORA = new Set(['profile.html']);

function meta(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

// Páginas que o Google deve indexar: têm canonical e não têm noindex.
function paginasIndexaveis() {
  return fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html') && !FORA.has(f))
    .map((f) => {
      const html = ler(f);
      return {
        f,
        html,
        canonical: meta(html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/),
        ogUrl: meta(html, /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/),
        robots: meta(html, /<meta[^>]+name="robots"[^>]+content="([^"]+)"/) || '',
        titulo: (meta(html, /<title[^>]*>([^<]*)<\/title>/) || '').trim(),
      };
    })
    .filter((p) => p.canonical && !/noindex/.test(p.robots));
}

function urlsDoSitemap() {
  return [...ler('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

test('há páginas indexáveis suficientes para o teste fazer sentido', () => {
  assert.ok(paginasIndexaveis().length >= 30);
});

test('os canonicals usam o endereço sem .html (o mesmo dos links internos)', () => {
  const comHtml = paginasIndexaveis().filter((p) => p.canonical.endsWith('.html')).map((p) => `${p.f}: ${p.canonical}`);
  assert.deepEqual(comHtml, []);
});

test('o og:url é igual ao canonical', () => {
  const diferentes = paginasIndexaveis()
    .filter((p) => p.ogUrl && p.ogUrl !== p.canonical)
    .map((p) => `${p.f}: og:url ${p.ogUrl} != ${p.canonical}`);
  assert.deepEqual(diferentes, []);
});

test('o modelo das páginas de categoria gera canonical, og:url e dados estruturados sem .html', () => {
  const modelo = ler('templates/categoria.template.html');
  assert.ok(!modelo.includes('{{SLUG}}.html'), 'o modelo ainda gera endereços com .html');
});

test('o sitemap.xml tem todas as páginas indexáveis, pelo endereço do canonical', () => {
  const sitemap = new Set(urlsDoSitemap());
  const faltam = paginasIndexaveis().filter((p) => !sitemap.has(p.canonical)).map((p) => `${p.f} (${p.canonical})`);
  assert.deepEqual(faltam, []);
});

test('o sitemap.xml não tem endereços com .html nem repetidos', () => {
  const urls = urlsDoSitemap();
  assert.deepEqual(urls.filter((u) => u.endsWith('.html')), []);
  assert.equal(new Set(urls).size, urls.length);
});

test('as páginas indexáveis têm títulos que dizem o que lá se encontra (30 a 65 caracteres)', () => {
  const maus = paginasIndexaveis()
    .filter((p) => p.titulo.length < 30 || p.titulo.length > 65)
    .map((p) => `${p.f}: "${p.titulo}" (${p.titulo.length})`);
  assert.deepEqual(maus, []);
});
