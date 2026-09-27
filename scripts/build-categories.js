// Gera todas as paginas de categoria (ex: eletricistas.html) a partir de
// UM template (templates/categoria.template.html) + scripts/categories-data.json.
//
// Para mudar o texto, FAQ ou meta tags de uma categoria: edita
// scripts/categories-data.json e corre `node scripts/build-categories.js`.
// Para mudar o layout/estilo partilhado por todas: edita o template.
// Para adicionar uma categoria nova: acrescenta uma entrada em
// categories-data.json (com o mesmo formato das outras) e corre este script
// — a pagina nova aparece automaticamente na navegacao de todas as outras.
//
// Corre automaticamente no deploy (ver [build] command em netlify.toml).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'categoria.template.html');
const DATA_PATH = path.join(__dirname, 'categories-data.json');

const categories = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
// Mesma lista de distritos e mesmos slugs das páginas locais (/eletricistas/braga).
const { DISTRITOS, slugify } = require('../netlify/functions/_local.js');
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildNavChips(activeSlug) {
  const items = [' <a href="categoria.html" class="cat-chip">Todos</a>'];
  for (const c of categories) {
    const activeClass = c.slug === activeSlug ? ' active' : '';
    items.push(
      ` <a href="${c.slug}.html" class="cat-chip${activeClass}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${c.h1Icon}</svg> ${escHtml(c.serviceType)}</a>`
    );
  }
  return items.join('\n');
}

// Ligações para as páginas locais da categoria, por distrito. Sem elas o
// Google só as conhecia pelo sitemap; com ligações internas ganham peso.
function buildZonasHtml(cat) {
  return DISTRITOS.map((d) => ` <a href="/${cat.slug}/${slugify(d)}" class="cat-chip">${escHtml(d)}</a>`).join('\n');
}

function buildFaqHtml(faq) {
  return faq.map((item, i) => {
    const openClass = i === 0 ? ' open' : '';
    return [
      ` <div class="faq-item${openClass}">`,
      ` <button class="faq-q" onclick="this.parentElement.classList.toggle('open')">${item.q}<span class="faq-chevron">›</span></button>`,
      ` <div class="faq-a">${item.a}</div>`,
      ` </div>`
    ].join('\n');
  }).join('\n');
}

function buildFaqJsonLd(faq) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  });
}

let written = 0;
for (const cat of categories) {
  let out = template;
  const tokens = {
    '{{TITLE}}': cat.title,
    '{{META_DESCRIPTION}}': cat.metaDescription,
    '{{SLUG}}': cat.slug,
    '{{OG_TITLE}}': cat.ogTitle,
    '{{OG_DESCRIPTION}}': cat.ogDescription,
    '{{FAQ_JSONLD}}': buildFaqJsonLd(cat.faq),
    '{{SERVICE_TYPE}}': cat.serviceType,
    '{{SERVICE_TYPE_URL}}': encodeURIComponent(cat.serviceType),
    '{{H1_ICON}}': cat.h1Icon,
    '{{H1_TEXT}}': cat.h1Text,
    '{{ICON_BG}}': cat.iconBg,
    '{{ICON_COLOR}}': cat.iconColor,
    '{{INTRO}}': cat.intro,
    '{{REQUEST_CTA}}': cat.requestCta,
    '{{NAV_CHIPS}}': buildNavChips(cat.slug),
    '{{COMO_CONTRATAR_HEADING}}': cat.comoContratarHeading,
    '{{PERGUNTAS_HEADING}}': cat.perguntasHeading,
    '{{FAQ_HTML}}': buildFaqHtml(cat.faq),
    '{{ZONAS_HTML}}': buildZonasHtml(cat),
    '{{EMPTY_STATE_SENTENCE}}': cat.emptyStateSentence,
  };
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value);
  }
  const remaining = out.match(/\{\{[A-Z_]+\}\}/);
  if (remaining) {
    throw new Error(`Token por preencher em ${cat.slug}.html: ${remaining[0]}`);
  }
  fs.writeFileSync(path.join(ROOT, `${cat.slug}.html`), out);
  written++;
}

console.log(`Geradas ${written} paginas de categoria a partir do template.`);
