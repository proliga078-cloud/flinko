// Testes de consistência do CONTEÚDO do site (sem browser).
//
// Porquê existem: a página para profissionais (profissionais.html) ficou meses
// com preços e planos desatualizados (mostrava só Grátis e Pro a 12,99 €, quando
// o pricing.html já vendia Starter, Pro a 19,99 € e Empresas), e uma página
// antiga órfã ainda dizia "mais tarde poderá haver planos pagos". Estes testes
// falham se o pricing.html mudar e as outras páginas não acompanharem, e se
// algum link interno apontar para uma página que não existe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// { starter: '9,99', pro: '19,99', empresas: '39,99' } a partir do JS do pricing.html
function precosMensais() {
  const html = ler('pricing.html');
  const out = {};
  for (const m of html.matchAll(/(starter|pro|empresas):\{name:'[^']+',monthly:'([\d,]+)'/g)) out[m[1]] = m[2];
  return out;
}

test('pricing.html tem os 3 planos pagos com preço (base das restantes verificações)', () => {
  const p = precosMensais();
  assert.deepEqual(Object.keys(p).sort(), ['empresas', 'pro', 'starter']);
});

test('profissionais.html mostra os mesmos planos e preços que o pricing.html', () => {
  const pagina = ler('profissionais.html');
  const precos = precosMensais();
  for (const [plano, preco] of Object.entries(precos)) {
    const nome = plano.charAt(0).toUpperCase() + plano.slice(1);
    assert.ok(pagina.includes(`<div class="nm">${nome}</div>`), `falta o cartão do plano ${nome}`);
    assert.ok(pagina.includes(`&euro;${preco}<small>/mês</small>`), `preço do ${nome} devia ser ${preco} €/mês`);
  }
  assert.ok(pagina.includes('<div class="nm">Grátis</div>'));
});

test('profissionais.html não tem as afirmações antigas (preço 12,99, "software grátis", contas grátis)', () => {
  const pagina = ler('profissionais.html');
  assert.ok(!pagina.includes('12,99'), 'preço antigo do Pro');
  assert.ok(!/Software grátis/i.test(pagina), 'título antigo');
  // "contas do trimestre" só pode aparecer associado ao Pro, nunca como algo grátis
  const hero = pagina.slice(pagina.indexOf('<h1'), pagina.indexOf('id="funcionalidades"'));
  assert.ok(!/contas do trimestre/i.test(hero), 'as contas fazem parte do Pro, não do plano grátis');
});

test('o FAQ visível de profissionais.html contém todas as perguntas do JSON-LD (e vice-versa)', () => {
  const pagina = ler('profissionais.html');
  const ld = JSON.parse(pagina.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1]);
  const perguntasLd = ld.mainEntity.map((q) => q.name);
  const visivel = [...pagina.matchAll(/class="faq-q"[^>]*>([^<]+)</g)].map((m) => m[1]);
  for (const q of perguntasLd) assert.ok(visivel.includes(q), `pergunta só no JSON-LD: ${q}`);
  assert.ok(perguntasLd.length >= 5);
});

test('a página antiga torna-te-profissional.html já não existe, tem redirect e saiu do sitemap', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'torna-te-profissional.html')));
  assert.match(ler('netlify.toml'), /from = "\/torna-te-profissional"\s+to = "\/profissionais"\s+status = 301/);
  assert.ok(!ler('sitemap.xml').includes('torna-te-profissional'));
});

test('todos os links internos para ficheiros .html existem (ou têm redirect no netlify.toml)', () => {
  const ficheiros = new Set(fs.readdirSync(ROOT));
  const redirects = new Set([...ler('netlify.toml').matchAll(/from = "\/([^"]+)"/g)].map((m) => m[1]));
  const partidos = [];
  for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
    for (const m of ler(f).matchAll(/href="([^"#?:]+\.html)(?:[?#][^"]*)?"/g)) {
      const alvo = m[1].replace(/^\//, '');
      if (!ficheiros.has(alvo) && !redirects.has(alvo)) partidos.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual(partidos, []);
});
