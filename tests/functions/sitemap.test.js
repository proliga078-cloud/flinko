// Garante que o sitemap.xml (páginas estáticas) está alinhado com o site:
//  - todas as páginas indexáveis (robots "index") estão lá, pelo endereço
//    oficial (o <link rel="canonical"> de cada página);
//  - nada no sitemap aponta para páginas que não existem ou que não são
//    indexáveis (o Google trata isso como erro no Search Console).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const noSitemap = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

// Páginas que existem mas não entram no sitemap de propósito.
const FORA = new Set([
  'profile.html',      // perfis estão em sitemap-profiles.xml
  'eletricista-lisboa.html', // página antiga, substituída por /eletricistas/lisboa
  'index.html',        // é a página inicial (https://flinko.pt/)
]);

function paginas() {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const robots = (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
    return { f, indexavel: !/noindex/.test(robots), canonical }; // sem etiqueta robots, o Google indexa
  });
}

test('todas as páginas indexáveis estão no sitemap, pelo endereço oficial', () => {
  const faltam = paginas().filter((p) => p.indexavel && p.canonical && !FORA.has(p.f) && !noSitemap.has(p.canonical)).map((p) => p.f + ' (' + p.canonical + ')');
  assert.deepEqual(faltam, [], 'Acrescenta estas páginas ao sitemap.xml');
});

test('o sitemap só tem endereços oficiais de páginas indexáveis', () => {
  const oficiais = new Set(paginas().filter((p) => p.indexavel).map((p) => p.canonical));
  oficiais.add('https://flinko.pt/');
  const estranhos = [...noSitemap].filter((u) => !oficiais.has(u));
  assert.deepEqual(estranhos, [], 'Estes endereços do sitemap não são o canonical de nenhuma página indexável');
});
