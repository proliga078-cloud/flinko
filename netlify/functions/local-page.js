// Páginas locais para SEO: /eletricistas/braga, /pintores/porto, ...
//
// O Google procura muito por "canalizador em Braga". Em vez de manter uma página
// à mão por cada combinação (só existia eletricista-lisboa.html), esta function
// gera a página no momento com os profissionais reais dessa categoria e zona.
//
// Regras de qualidade (para o Google não tratar isto como spam):
//  - só é indexável se houver pelo menos 1 profissional real; sem ninguém, a
//    página abre na mesma (útil para o visitante, que pode publicar um pedido)
//    mas com noindex;
//  - todo o texto vindo da base de dados é escapado;
//  - categorias e cidades desconhecidas devolvem 404 a sério.
const{createClient}=require('@supabase/supabase-js')
const{SITE,DISTRITOS,slugify,esc,categoryBySlug,placesOf,loadPros,ordenar,profileUrl,combinacoes}=require('./_local')
const{siteHeader,siteFooter}=require('../../scripts/site-header.js')

const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const MAX_CARTOES=24

function html404(){
  return{
    statusCode:404,
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300'},
    body:'<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Página não encontrada – Flinko</title></head><body style="font-family:Arial,sans-serif;text-align:center;padding:60px"><h1>Página não encontrada</h1><p><a href="/">Voltar à Flinko</a></p></body></html>',
  }
}

function tirarTags(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()}
function iniciais(nome){return String(nome||'?').split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase()}
function plural(n,sing,plur){return n+' '+(n===1?sing:plur)}

function cartao(p){
  const url=p.slug?`/${encodeURIComponent(p.slug)}`:`/profile.html?id=${encodeURIComponent(p.id)}`
  const avatar=p.photo_url&&/^https?:\/\//i.test(p.photo_url)
    ?`<img src="${esc(p.photo_url)}" alt="${esc(p.name)}" loading="lazy" width="56" height="56">`
    :esc(iniciais(p.name))
  const bio=p.bio?esc(p.bio.length>150?p.bio.slice(0,147)+'…':p.bio):''
  const resposta=p.response_sample_count>0&&p.avg_response_minutes!=null&&Number(p.avg_response_minutes)<=60
    ?`<span class="chip">Responde em ~${Math.max(1,Math.round(p.avg_response_minutes))} min</span>`:''
  return `<a class="card" href="${url}">
  <div class="ctop">
    <div class="av">${avatar}</div>
    <div class="cbody">
      <div class="cname">${esc(p.name)}${p.verified?' <span class="ver" title="Perfil revisto pela Flinko">✓</span>':''}</div>
      <div class="cmeta">${esc(p.location||'Portugal')}</div>
    </div>
  </div>
  ${bio?`<p class="cbio">${bio}</p>`:''}
  ${resposta}
  <div class="cfoot"><span>Orçamento grátis</span><span class="cgo">Ver perfil e falar</span></div>
</a>`
}

// Num redirect (status 200) o Netlify entrega a esta function o caminho ORIGINAL
// do pedido (/eletricistas/braga); numa chamada direta chega
// /.netlify/functions/local-page/eletricistas/braga. Aceitamos os dois, e ainda
// ?cat=&city= (testes e chamadas diretas). Nao se usa :cat na query string do
// redirect porque a substituicao ai nao e fiavel.
function lerParametros(event){
  const q=event.queryStringParameters||{}
  const partes=String(event.path||'').split('/').filter(Boolean)
  const i=partes.indexOf('local-page')
  const doCaminho=i>=0?partes.slice(i+1):partes.slice(-2)
  const dec=s=>{try{return decodeURIComponent(s||'')}catch(e){return ''}}
  return{cat:dec(doCaminho[0])||q.cat||'',city:dec(doCaminho[1])||q.city||''}
}

exports.handler=async(event)=>{
  const q=lerParametros(event)
  const cat=categoryBySlug(String(q.cat||'').toLowerCase())
  const citySlug=slugify(q.city)
  if(!cat||!citySlug)return html404()

  let todos
  try{
    todos=await loadPros(admin)
  }catch(err){
    console.error('local-page error:',err)
    return{statusCode:500,headers:{'Content-Type':'text/plain; charset=utf-8'},body:'Erro temporário. Tenta novamente.'}
  }

  // Nome legível do lugar: primeiro o que aparece nos perfis, depois a lista de distritos.
  let placeName=null
  for(const p of todos){
    const hit=placesOf(p).find(pl=>pl.slug===citySlug)
    if(hit){placeName=hit.name;break}
  }
  if(!placeName){
    const distrito=DISTRITOS.find(d=>slugify(d)===citySlug)
    if(!distrito)return html404()
    placeName=distrito
  }

  const daCategoria=todos.filter(p=>p.category===cat.serviceType)
  const daqui=ordenar(daCategoria.filter(p=>placesOf(p).some(pl=>pl.slug===citySlug)))
  const total=daqui.length
  const indexavel=total>0

  // Ligações internas: outras categorias nesta zona, e a mesma categoria noutras zonas.
  const combos=combinacoes(todos)
  const outrasCategorias=combos.filter(c=>c.place.slug===citySlug&&c.cat.slug!==cat.slug)
  const outrasZonas=combos.filter(c=>c.cat.slug===cat.slug&&c.place.slug!==citySlug)
    .sort((a,b)=>b.pros.length-a.pros.length).slice(0,8)

  const canonical=`${SITE}/${cat.slug}/${citySlug}`
  const servico=cat.serviceType
  const titulo=`${servico} em ${placeName} – Encontra e contrata | Flinko`
  const descricao=total
    ?`${plural(total,'profissional','profissionais')} de ${servico.toLowerCase()} em ${placeName} na Flinko. Vê perfis, compara e contacta diretamente, sem comissões.`
    :`Ainda não há ${servico.toLowerCase()} em ${placeName} na Flinko. Publica um pedido grátis e os profissionais candidatam-se a ti.`

  const pedidoUrl=`/pedidos.html?publicar=1&amp;cat=${encodeURIComponent(servico)}`
  const faq=(cat.faq||[]).slice(0,4)

  const jsonLd=[
    {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'Flinko',item:SITE+'/'},
      {'@type':'ListItem',position:2,name:servico,item:`${SITE}/${cat.slug}`},
      {'@type':'ListItem',position:3,name:placeName,item:canonical},
    ]},
    ...(total?[{'@context':'https://schema.org','@type':'ItemList',name:`${servico} em ${placeName}`,
      itemListElement:daqui.slice(0,MAX_CARTOES).map((p,i)=>({'@type':'ListItem',position:i+1,url:profileUrl(p),name:p.name}))}]:[]),
    ...(faq.length?[{'@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map(f=>({'@type':'Question',name:tirarTags(f.q),acceptedAnswer:{'@type':'Answer',text:tirarTags(f.a)}}))}]:[]),
  ]
  // "<" escapado para o JSON nunca poder fechar a tag <script>.
  const jsonLdHtml=jsonLd.map(o=>`<script type="application/ld+json">${JSON.stringify(o).replace(/</g,'\\u003c')}</script>`).join('\n')

  const lista=total
    ?`<div class="grid">${daqui.slice(0,MAX_CARTOES).map(cartao).join('')}</div>${total>MAX_CARTOES?`<p class="mais"><a href="/categoria.html?cat=${encodeURIComponent(servico)}">Ver todos os ${total} profissionais →</a></p>`:''}`
    :`<div class="vazio"><h2>Ainda não há ${esc(servico.toLowerCase())} em ${esc(placeName)}</h2><p>Sê o primeiro a receber propostas: publica um pedido grátis e os profissionais da zona candidatam-se a ti.</p><a class="btn" href="${pedidoUrl}">Publicar pedido grátis</a></div>`

  const ligacoes=[
    outrasCategorias.length?`<section class="links"><h2>Outros serviços em ${esc(placeName)}</h2><div class="chips">${outrasCategorias.map(c=>`<a href="/${c.cat.slug}/${c.place.slug}">${esc(c.cat.serviceType)}</a>`).join('')}</div></section>`:'',
    outrasZonas.length?`<section class="links"><h2>${esc(servico)} noutras zonas</h2><div class="chips">${outrasZonas.map(c=>`<a href="/${c.cat.slug}/${c.place.slug}">${esc(c.place.name)}</a>`).join('')}</div></section>`:'',
  ].join('')

  const faqHtml=faq.length?`<section class="faq"><h2>Perguntas frequentes</h2>${faq.map(f=>`<details><summary>${esc(tirarTags(f.q))}</summary><p>${esc(tirarTags(f.a))}</p></details>`).join('')}</section>`:''

  const pagina=`<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="robots" content="${indexavel?'index, follow':'noindex, follow'}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(`${servico} em ${placeName} – Flinko`)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/assets/og-image.png">
<meta property="og:locale" content="pt_PT">
<meta name="theme-color" content="#FBF6EF">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site-header.js" defer></script>
<script src="/assets/pwa.js" defer></script>
<link rel="manifest" href="/manifest.json">
${jsonLdHtml}
<style>
/* Direção "calorosa e local" (ver CLAUDE.md): papel creme, terracota, títulos em Fraunces. */
:root{--ink:#2B2118;--soft:#6B5A4C;--line:#E6D9CB;--paper:#FBF6EF;--paper-2:#F4ECE1;--accent:#B9502A;--accent-deep:#9A3F1F;--fresh:#3E8E5E}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--paper);line-height:1.6}
a{color:inherit}
.fk-header{background:rgba(251,246,239,.94);border-bottom-color:var(--line)}
.fk-header::after{display:none}
.fk-footer{background:var(--ink)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.crumbs{font-size:13px;color:var(--soft);padding:18px 0 4px}.crumbs a{text-decoration:none}
.hero{padding:10px 0 28px}
h1,h2{font-family:Fraunces,Georgia,serif;font-weight:600;letter-spacing:-.01em}
h1{font-size:clamp(2rem,5vw,2.8rem);line-height:1.1;margin:8px 0 12px}
.lead{color:var(--soft);max-width:600px;margin:0 0 22px;font-size:1.05rem}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px}
.btn:hover{background:var(--accent-deep)}
.ou{display:block;margin-top:12px;font-size:.95rem;color:var(--soft)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:16px;margin:8px 0}
.card{display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid var(--line);border-radius:12px;text-decoration:none;background:#fff}
.card:hover{border-color:var(--soft)}
.ctop{display:flex;gap:14px;align-items:center}
.av{flex:0 0 52px;width:52px;height:52px;border-radius:50%;background:var(--paper-2);color:var(--accent);font-family:Fraunces,Georgia,serif;display:flex;align-items:center;justify-content:center;font-weight:600;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover}
.cbody{min-width:0}.cname{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:1.12rem;line-height:1.25}.cmeta{font-size:13.5px;color:var(--soft)}
.ver{font-family:Inter,sans-serif;font-size:.85rem;font-weight:700;color:var(--fresh)}
.cbio{font-size:14px;color:var(--soft);margin:0}
.chip{align-self:flex-start;font-size:12.5px;color:var(--soft)}
.cfoot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:10px;border-top:1px solid var(--line);font-size:14px}
.cgo{color:var(--accent);font-weight:600}
.vazio{background:var(--paper-2);border-radius:14px;padding:28px;margin:8px 0}
.vazio h2{margin:0 0 8px;font-size:1.35rem}.vazio p{color:var(--soft);margin:0 0 16px}
.mais{margin:12px 0 0;font-weight:600}
section{margin:40px 0}
h2{font-size:1.45rem;margin:0 0 12px}
.passos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.passos strong{display:block;font-family:Fraunces,Georgia,serif;font-size:1.08rem;margin-bottom:4px}
.passos p{margin:0;color:var(--soft);font-size:.95rem}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips a{border:1px solid var(--line);background:#fff;border-radius:99px;padding:7px 14px;text-decoration:none;font-size:14px}
.chips a:hover{border-color:var(--accent);color:var(--accent-deep)}
details{border-bottom:1px solid var(--line);padding:12px 0}summary{cursor:pointer;font-weight:600}details p{color:var(--soft);margin:8px 0 0}
.cta{border-top:1px solid var(--line);padding:24px 0 8px;margin:40px 0 0;color:var(--soft);font-size:.95rem}
.cta a{color:var(--accent);font-weight:600}
@media (max-width:700px){.passos{grid-template-columns:minmax(0,1fr);gap:16px}}
</style>
</head>
<body>
${siteHeader('categoria')}
<main class="wrap">
<div class="crumbs"><a href="/">Flinko</a> › <a href="/${cat.slug}">${esc(servico)}</a> › ${esc(placeName)}</div>
<header class="hero">
<h1>${esc(servico)} em ${esc(placeName)}</h1>
<p class="lead">${total?`${esc(plural(total,'profissional','profissionais'))} em ${esc(placeName)}. Vê os perfis, compara e fala diretamente com quem quiseres, sem comissões e sem intermediários.`:`Ainda não temos ${esc(servico.toLowerCase())} em ${esc(placeName)}, mas podes publicar um pedido grátis e receber propostas.`}</p>
<a class="btn" href="${pedidoUrl}">Publicar pedido grátis</a>
<span class="ou">${total?'Ou escolhe abaixo com quem queres falar.':`Ou vê os <a href="/${cat.slug}">profissionais de todo o país</a>.`}</span>
</header>
${lista}
<section><h2>Como funciona</h2><div class="passos">
<div><strong>Escolhes ou pedes</strong><p>Falas com quem te parecer bem, ou publicas o pedido e recebes propostas de quem está perto.</p></div>
<div><strong>Combinas direto</strong><p>Preço, data e visita combinam-se entre vocês, por mensagem. Sem intermediários.</p></div>
<div><strong>Não pagas à Flinko</strong><p>Pagas ao profissional, como sempre fizeste. A Flinko não fica com nada.</p></div>
</div></section>
${ligacoes}
${faqHtml}
<p class="cta">Trabalhas nesta área em ${esc(placeName)}? <a href="/profissionais">Cria o teu perfil grátis e recebe pedidos da tua zona</a>.</p>
</main>
${siteFooter()}
<script src="/assets/cookie-consent.js" defer></script>
</body>
</html>`

  return{
    statusCode:200,
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=600, s-maxage=3600'},
    body:pagina,
  }
}
