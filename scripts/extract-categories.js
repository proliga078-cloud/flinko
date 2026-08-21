// Extrai os dados variaveis de cada pagina de categoria existente para
// scripts/categories-data.json, para depois gerar todas a partir de UM
// template (ver build-categories.js). Nao inventa conteudo: le o que ja
// esta escrito em cada ficheiro .html.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// slug -> ficheiro. A ordem aqui e a ordem canonica de navegacao (a mesma
// que categoria.html e dashboard.html ja usam nos seus proprios dropdowns/
// listas — confirmado como a lista "verdadeira" de 16 categorias).
const SLUGS = [
  'eletricistas','canalizadores','pintores','pedreiros','carpinteiros',
  'serralheiros','jardineiros','limpeza','mudancas','decoradores',
  'programadores','designers','reparacoes-tech','personal-trainers',
  'cabeleireiros','esteticistas'
];

function grab(re, txt, label, file) {
  const m = txt.match(re);
  if (!m) throw new Error(`Nao encontrei "${label}" em ${file}`);
  return m[1];
}

function extractOne(slug) {
  const file = `${slug}.html`;
  const txt = fs.readFileSync(path.join(ROOT, file), 'utf8');

  const title = grab(/<title>(.*?)<\/title>/s, txt, 'title', file);
  const metaDescription = grab(/<meta name="description" content="(.*?)"\/>/s, txt, 'meta description', file);
  const ogTitle = grab(/<meta property="og:title" content="(.*?)"\/>/s, txt, 'og:title', file);
  const ogDescription = grab(/<meta property="og:description" content="(.*?)"\/>/s, txt, 'og:description', file);

  const faqJsonRaw = grab(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema\.org", "@type": "FAQPage".*?\})<\/script>/s, txt, 'faq json-ld', file);
  const faqJson = JSON.parse(faqJsonRaw);
  const faq = faqJson.mainEntity.map(q => ({ q: q.name, a: q.acceptedAnswer.text }));

  // Nota: cada pagina tinha um bloco de cor "por categoria" (desktop e
  // mobile), mas um bloco fixo mais tarde no <style> ("tema navy+laranja")
  // redeclara os mesmos seletores sem media query, por isso e sempre ele
  // que vence a cascata em qualquer largura de ecra. Essas cores por
  // categoria nunca chegavam a aparecer — sao codigo morto, por isso o
  // template ja nao as tem e nao precisamos de as extrair.

  const serviceType = grab(/"serviceType":\s*"([^"]+)"/, txt, 'serviceType', file);

  const h1Icon = grab(/<h1><span class="cat-icon-badge"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">(.*?)<\/svg><\/span>/s, txt, 'h1 icon svg', file);
  const h1Text = grab(/<h1><span class="cat-icon-badge">.*?<\/span>\s*(.*?)<\/h1>/s, txt, 'h1 text', file);
  const intro = grab(/<p class="intro">(.*?)<\/p>/s, txt, 'intro', file);

  const comoContratarHeading = grab(/<h2>(Como contratar .*?)<\/h2>/s, txt, 'como contratar heading', file);
  const perguntasHeading = grab(/<h2>(Perguntas frequentes sobre .*?)<\/h2>/s, txt, 'perguntas heading', file);

  const requestCta = grab(/<p>(Publica um pedido em .*? e deixa os profissionais virem até ti\.)<\/p>/s, txt, 'request cta', file);
  const emptyStateSentence = grab(/Ainda não há (.*?) nesta zona\./s, txt, 'empty state sentence', file);
  const catJsVar = grab(/cat:'([^']+)'/, txt, 'cat js var', file);

  const h2CategoriaSecao = grab(/<h2>(?!Como contratar|Perguntas frequentes)([^<]*Norte de Portugal[^<]*)<\/h2>/s, txt, 'h2 categoria secao', file);

  return {
    slug, file, title, metaDescription, ogTitle, ogDescription, faq,
    serviceType, h1Icon, h1Text, intro,
    comoContratarHeading, perguntasHeading, requestCta, emptyStateSentence,
    catJsVar, h2CategoriaSecao
  };
}

const data = SLUGS.map(extractOne);
fs.writeFileSync(path.join(__dirname, 'categories-data.json'), JSON.stringify(data, null, 2));
console.log(`Extraidos dados de ${data.length} categorias -> scripts/categories-data.json`);
