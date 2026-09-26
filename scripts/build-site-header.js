// Aplica o cabeçalho único (scripts/site-header.js) a todas as páginas do site
// público. Em cada .html (e no template das categorias), substitui o que está
// entre as marcas:
//   <!-- fk:head --> … <!-- /fk:head -->       (dentro do <head>: CSS e JS)
//   <!-- fk:header --> … <!-- /fk:header -->   (logo a seguir ao <body>)
// Páginas sem marcas ficam como estão (dashboard, admin, auth…).
//
// Corre no deploy do Netlify (ver netlify.toml) e o CI falha se as páginas
// commitadas não estiverem em dia. Para mudar o menu, edita
// scripts/site-header.js e corre `npm run build`.
const fs = require('fs')
const path = require('path')
const { siteHeader } = require('./site-header.js')

const ROOT = path.join(__dirname, '..')
const CATEGORY_SLUGS = new Set(require('./categories-data.json').map(c => c.slug))
const HEAD = '<link rel="stylesheet" href="/assets/site.css" />\n<script src="/assets/site-header.js" defer></script>'

function apply(html, page) {
  return html
    .replace(/<!-- fk:head -->[\s\S]*?<!-- \/fk:head -->/, () => `<!-- fk:head -->\n${HEAD}\n<!-- /fk:head -->`)
    .replace(/<!-- fk:header -->[\s\S]*?<!-- \/fk:header -->/, () => `<!-- fk:header -->\n${siteHeader(page)}\n<!-- /fk:header -->`)
}

function files() {
  const out = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f))
  out.push(path.join(ROOT, 'templates', 'categoria.template.html'))
  return out
}

function build() {
  let n = 0
  for (const file of files()) {
    const html = fs.readFileSync(file, 'utf8')
    if (!html.includes('<!-- fk:header -->')) continue
    // As páginas de categoria são geradas a partir do template e não têm link
    // próprio no menu; "categoria" marca "Encontrar" como ativo.
    const base = path.basename(file, '.html')
    const page = base === 'categoria.template' || CATEGORY_SLUGS.has(base) ? 'categoria' : base
    const out = apply(html, page)
    if (out !== html) fs.writeFileSync(file, out)
    n++
  }
  return n
}

if (require.main === module) console.log(`Cabeçalho aplicado a ${build()} páginas.`)

module.exports = { apply, build, HEAD }
