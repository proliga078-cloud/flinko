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
  <div class="av">${avatar}</div>
  <div class="cbody">
    <div class="cname">${esc(p.name)}${p.verified?' <span class="ver" title="Perfil verificado">✓ Verificado</span>':''}</div>
    <div class="cmeta">${esc(p.location||'Portugal')}</div>
    ${bio?`<p class="cbio">${bio}</p>`:''}
    ${resposta}
  </div>
</a>`
}

exports.handler=async(event)=>{
  const q=event.queryStringParameters||{}
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

  const pedidoUrl=`/pedidos.html?cat=${encodeURIComponent(servico)}`
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
<meta name="theme-color" content="#132420">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${jsonLdHtml}
<style>
:root{--ink:#132420;--soft:#4E5C57;--line:#E1EEE6;--surface:#F3FBF6;--accent:#E8720A;--accent-deep:#B85608;--fresh:#0F8B5F}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--ink);background:#fff;line-height:1.55}
a{color:inherit}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 5%;border-bottom:1px solid var(--line);position:sticky;top:0;background:#fff;z-index:10}
.logo{font-weight:800;font-size:22px;letter-spacing:-1px;text-decoration:none}.logo span{color:var(--accent)}
nav .links a{margin-left:18px;text-decoration:none;font-size:14px;font-weight:600;color:var(--soft)}
.wrap{max-width:1040px;margin:0 auto;padding:0 5%}
.crumbs{font-size:13px;color:var(--soft);padding:18px 0 4px}.crumbs a{text-decoration:none}
.hero{padding:10px 0 26px}
h1{font-size:clamp(1.7rem,4.2vw,2.5rem);line-height:1.15;letter-spacing:-.02em;margin:8px 0 12px}
.lead{color:var(--soft);max-width:640px;margin:0 0 20px;font-size:1.02rem}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px}
.btn:hover{background:var(--accent-deep)}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);margin-left:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:8px 0 8px}
.card{display:flex;gap:14px;padding:16px;border:1px solid var(--line);border-radius:16px;text-decoration:none;background:#fff;transition:box-shadow .15s,border-color .15s}
.card:hover{border-color:#CFE4D9;box-shadow:0 6px 20px rgba(19,36,32,.08)}
.av{flex:0 0 56px;width:56px;height:56px;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover}
.cbody{min-width:0}.cname{font-weight:700}.cmeta{font-size:13px;color:var(--soft)}
.ver{font-size:11px;font-weight:700;color:var(--fresh);background:#D7F5E4;padding:2px 8px;border-radius:99px;white-space:nowrap}
.cbio{font-size:13.5px;color:var(--soft);margin:8px 0 6px}
.chip{display:inline-block;font-size:11.5px;font-weight:600;color:var(--fresh);background:var(--surface);padding:3px 9px;border-radius:99px}
.vazio{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:28px;margin:8px 0}
.vazio h2{margin:0 0 8px;font-size:1.25rem}.vazio p{color:var(--soft);margin:0 0 16px}
.mais{margin:10px 0 0;font-weight:600}
section{margin:34px 0}
h2{font-size:1.25rem;margin:0 0 12px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips a{border:1px solid var(--line);border-radius:99px;padding:7px 14px;text-decoration:none;font-size:14px;font-weight:600}
.chips a:hover{border-color:var(--accent);color:var(--accent-deep)}
details{border-bottom:1px solid var(--line);padding:12px 0}summary{cursor:pointer;font-weight:600}details p{color:var(--soft);margin:8px 0 0}
.cta{background:var(--ink);color:#fff;border-radius:20px;padding:28px;margin:34px 0}
.cta h2{margin:0 0 6px}.cta p{margin:0 0 16px;color:#cfe4d9}
footer{border-top:1px solid var(--line);padding:24px 5%;font-size:13px;color:var(--soft);text-align:center}
footer a{margin:0 8px}
</style>
</head>
<body>
<nav><a class="logo" href="/">Flink<span>o</span></a><div class="links"><a href="/categoria.html">Encontrar</a><a href="/pedidos.html">Pedidos</a><a href="/pricing.html">Preços</a><a href="/auth.html">Entrar</a></div></nav>
<main class="wrap">
<div class="crumbs"><a href="/">Flinko</a> › <a href="/${cat.slug}">${esc(servico)}</a> › ${esc(placeName)}</div>
<header class="hero">
<h1>${esc(servico)} em ${esc(placeName)}</h1>
<p class="lead">${total?`${esc(plural(total,'profissional','profissionais'))} em ${esc(placeName)}. Vê os perfis, compara e fala diretamente com quem quiseres, sem comissões e sem intermediários.`:`Ainda não temos ${esc(servico.toLowerCase())} em ${esc(placeName)}, mas podes publicar um pedido grátis e receber propostas.`}</p>
<a class="btn" href="${pedidoUrl}">Publicar pedido grátis</a><a class="btn ghost" href="/${cat.slug}">Ver todo o país</a>
</header>
${lista}
${ligacoes}
${faqHtml}
<div class="cta"><h2>És ${esc(servico.toLowerCase())} em ${esc(placeName)}?</h2><p>Cria o teu perfil grátis e recebe pedidos de clientes da tua zona.</p><a class="btn" href="/auth.html?tab=register">Criar perfil grátis</a></div>
</main>
<footer><a href="/sobre.html">Sobre</a><a href="/termos.html">Termos</a><a href="/privacidade.html">Privacidade</a><a href="/cookies.html">Cookies</a></footer>
<script src="/assets/cookie-consent.js" defer></script>
</body>
</html>`

  return{
    statusCode:200,
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=600, s-maxage=3600'},
    body:pagina,
  }
}
