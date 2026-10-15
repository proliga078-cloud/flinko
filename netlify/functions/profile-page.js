// Perfil de profissional com o essencial já no HTML (SEO e partilhas).
//
// O profile.html monta o perfil no browser. O Google acaba por correr o
// JavaScript, mas mais tarde e nem sempre; o WhatsApp, o Facebook e o LinkedIn
// nunca o correm, por isso um link de perfil partilhado mostrava sempre
// "Perfil Profissional – Flinko" e a imagem genérica. Esta função serve o mesmo
// profile.html com o título, a descrição, a imagem, o canonical, os dados
// estruturados (LocalBusiness + avaliações) e um resumo do perfil (nome, área,
// zona, descrição, serviços) já escritos no servidor. O JavaScript da página
// continua a desenhar o resto por cima, como antes.
//
// Rotas (netlify.toml):
//   /o-nome-dele              -> /.netlify/functions/profile-page/o-nome-dele
//   /profile.html?id=<uuid>   -> /.netlify/functions/profile-page?id=<uuid>
//
// Se algo falhar (base de dados, etc.), devolve o profile.html tal como está:
// a página continua a funcionar exatamente como antes desta função existir.
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { categories, placesOf } = require('./_local')

const SITE = 'https://flinko.pt'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/
const COLS = 'id,name,bio,category,location,photo_url,slug,verified,experience_years'

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
// JSON dentro de <script>: impede que "</script>" num campo feche a tag.
const jsonScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c')
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const httpUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '')

let template = null
function loadTemplate() {
  if (template) return template
  const candidates = [
    path.join(__dirname, '..', '..', 'profile.html'),
    path.join(process.cwd(), 'profile.html'),
    path.join(process.env.LAMBDA_TASK_ROOT || '/var/task', 'profile.html'),
  ]
  for (const p of candidates) {
    try { template = fs.readFileSync(p, 'utf8'); return template } catch (e) {}
  }
  throw new Error('profile.html não encontrado junto da função (ver included_files no netlify.toml)')
}

function whoFrom(event) {
  const q = event.queryStringParameters || {}
  if (q.id) return UUID.test(q.id) ? { id: q.id } : null
  // Nas reescritas (/o-nome -> função), o Netlify tanto pode passar o caminho
  // da função (/.netlify/functions/profile-page/o-nome) como o original
  // (/o-nome): aceita os dois.
  const p = String(event.path || '')
  const raw = q.slug || (p.includes('/profile-page/') ? p.split('/profile-page/')[1] : p.replace(/^\/+/, '')) || ''
  let slug = ''
  try { slug = decodeURIComponent(raw).toLowerCase().replace(/\/+$/, '') } catch (e) { return null }
  return SLUG.test(slug) ? { slug } : null
}

function profileUrl(p) {
  return p.slug ? `${SITE}/${encodeURIComponent(p.slug)}` : `${SITE}/profile.html?id=${p.id}`
}

function eur(n) {
  const v = Number(n)
  return isFinite(v) && v > 0 ? v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : ''
}

function setMeta(html, id, attr, value) {
  const re = new RegExp(`(<[^>]*id="${id}"[^>]*\\s${attr}=")[^"]*(")`)
  return html.replace(re, (m, a, b) => a + esc(value) + b)
}

// Função pura (testável): recebe o HTML base e os dados, devolve o HTML final.
function render(html, pro, { services = [], ratings = [] } = {}) {
  const url = profileUrl(pro)
  const area = oneLine(pro.category) || 'Profissional'
  const zona = oneLine(pro.location)
  const titulo = `${oneLine(pro.name)} – ${area}${zona ? ` em ${zona}` : ''} | Flinko`
  const descricao = pro.bio
    ? oneLine(pro.bio).slice(0, 155)
    : `${area}${zona ? ` em ${zona}` : ''}. Vê os serviços e avaliações e contacta diretamente pela Flinko, sem comissões.`
  const imagem = httpUrl(pro.photo_url) || `${SITE}/assets/og-image.png`
  const n = ratings.length
  const media = n ? ratings.reduce((s, r) => s + Number(r.rating || 0), 0) / n : 0

  let out = html.replace(/<title id="meta-title">[^<]*<\/title>/, `<title id="meta-title">${esc(titulo)}</title>`)
  out = setMeta(out, 'meta-description', 'content', descricao)
  out = setMeta(out, 'meta-canonical', 'href', url)
  out = setMeta(out, 'meta-og-title', 'content', titulo)
  out = setMeta(out, 'meta-og-description', 'content', descricao)
  out = setMeta(out, 'meta-og-url', 'content', url)
  out = setMeta(out, 'meta-og-image', 'content', imagem)
  out = setMeta(out, 'meta-twitter-title', 'content', titulo)
  out = setMeta(out, 'meta-twitter-description', 'content', descricao)
  out = setMeta(out, 'meta-twitter-image', 'content', imagem)

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: oneLine(pro.name),
    url,
    image: httpUrl(pro.photo_url) || undefined,
    description: pro.bio ? oneLine(pro.bio).slice(0, 500) : undefined,
    additionalType: area,
    areaServed: zona || 'Portugal',
    address: zona ? { '@type': 'PostalAddress', addressLocality: zona, addressCountry: 'PT' } : undefined,
    aggregateRating: n ? { '@type': 'AggregateRating', ratingValue: Math.round(media * 10) / 10, reviewCount: n, bestRating: 5, worstRating: 1 } : undefined,
    makesOffer: services.length ? services.slice(0, 20).map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: oneLine(s.title) } })) : undefined,
  }
  Object.keys(ld).forEach((k) => ld[k] === undefined && delete ld[k])
  out = out.replace('</head>', `<script type="application/ld+json" id="structured-data-ld">${jsonScript(ld)}</script>\n</head>`)

  // Resumo lido por quem não corre JavaScript (o JS da página substitui-o).
  const servicos = services.slice(0, 12).map((s) => {
    const preco = eur(s.price_from)
    return `<li>${esc(oneLine(s.title))}${preco ? ` — a partir de ${esc(preco)}` : ''}</li>`
  }).join('')
  const resumo = `<div class="ssr-profile" style="padding:24px">
      <h1 style="font-size:1.6rem;margin-bottom:6px">${esc(oneLine(pro.name))}</h1>
      <p style="color:#4E5C57;margin-bottom:12px">${esc(area)}${zona ? ` · ${esc(zona)}` : ''}${pro.verified ? ' · Verificado pela Flinko' : ''}${n ? ` · ${esc(media.toFixed(1).replace('.', ','))} ★ (${n} ${n === 1 ? 'avaliação' : 'avaliações'})` : ''}</p>
      ${pro.bio ? `<p style="margin-bottom:12px">${esc(oneLine(pro.bio).slice(0, 600))}</p>` : ''}
      ${servicos ? `<h2 style="font-size:1.05rem;margin:8px 0">Serviços</h2><ul style="padding-left:18px">${servicos}</ul>` : ''}
    </div>`
  out = out.replace(/(<div id="profile-header" class="profile-header">)\s*<div class="loading"><div class="spinner"><\/div><\/div>/, `$1\n    ${resumo}`)
  return migalhas(out, pro, url)
}

// Caminho "Flinko › Eletricistas › Braga" por cima do perfil, com ligações
// para a categoria e para a página local (/eletricistas/braga), mais o
// BreadcrumbList para o Google. Fica fora do bloco que o JS substitui.
function migalhas(html, pro, url) {
  const cat = categories.find((c) => c.serviceType === oneLine(pro.category))
  if (!cat) return html
  const zona = placesOf(pro)[0]
  const passos = [{ nome: 'Flinko', url: SITE + '/' }, { nome: cat.serviceType, url: `${SITE}/${cat.slug}` }]
  if (zona) passos.push({ nome: zona.name, url: `${SITE}/${cat.slug}/${zona.slug}` })
  passos.push({ nome: oneLine(pro.name), url })
  const nav = `<nav class="fk-crumbs" aria-label="Caminho" style="max-width:1100px;margin:0 auto;padding:14px 5% 0;font-size:13px;color:#5E6B66">${passos.map((p, i) => i === passos.length - 1 ? `<span aria-current="page">${esc(p.nome)}</span>` : `<a href="${esc(p.url.replace(SITE, '') || '/')}" style="color:inherit">${esc(p.nome)}</a>`).join(' › ')}</nav>`
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: passos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.nome, item: p.url })) }
  return html
    .replace('</head>', `<script type="application/ld+json">${jsonScript(ld)}</script>\n</head>`)
    .replace(/(<div id="profile-header" class="profile-header">)/, `${nav}\n$1`)
}

function page(statusCode, body, cache) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache },
    body,
  }
}

exports.handler = async (event) => {
  let html
  try { html = loadTemplate() } catch (e) {
    console.error('profile-page:', e.message)
    return { statusCode: 302, headers: { Location: '/index.html' }, body: '' }
  }
  const who = whoFrom(event)
  const naoEncontrado = () => page(404, html.replace(/(<meta id="meta-robots"[^>]*content=")[^"]*(")/, '$1noindex, nofollow$2'), 'public, max-age=60')
  if (!who) return naoEncontrado()
  try {
    // Só profissionais: a conta de um cliente não tem página pública (RGPD).
    let q = admin.from('profiles').select(COLS).eq('account_type', 'professional').eq('approved', true).eq('suspended', false).eq('is_demo', false)
    q = who.id ? q.eq('id', who.id) : q.eq('slug', who.slug)
    const { data: pro, error } = await q.maybeSingle()
    if (error) throw new Error(error.message)
    if (!pro) return naoEncontrado()
    const [{ data: services }, { data: ratings }] = await Promise.all([
      admin.from('services').select('title,price_from').eq('professional_id', pro.id).order('created_at').limit(20),
      admin.from('reviews').select('rating').eq('professional_id', pro.id).limit(1000),
    ])
    return page(200, render(html, pro, { services: services || [], ratings: ratings || [] }), 'public, max-age=300')
  } catch (e) {
    console.error('profile-page error:', e)
    return page(200, html, 'no-store')
  }
}

exports.render = render
exports.whoFrom = whoFrom
