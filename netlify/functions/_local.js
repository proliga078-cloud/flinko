// Módulo interno (não é uma function exposta — não tem exports.handler).
// Lógica partilhada pelas páginas locais (local-page.js) e pelo sitemap
// dessas páginas (sitemap-local.js): "categoria × cidade", ex: /eletricistas/braga.
const categories=require('../../scripts/categories-data.json')

const SITE=process.env.URL||'https://flinko.pt'

// Distritos e regiões autónomas — os mesmos que o dashboard oferece no perfil
// ("Distrito – Cidade"). Permitem abrir /eletricistas/faro mesmo sem ninguém
// lá (a página fica noindex e convida a publicar um pedido).
const DISTRITOS=['Aveiro','Beja','Braga','Bragança','Castelo Branco','Coimbra','Évora','Faro','Guarda','Leiria','Lisboa','Portalegre','Porto','Santarém','Setúbal','Viana do Castelo','Vila Real','Viseu','Açores','Madeira']

function slugify(s){
  return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
}

function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function categoryBySlug(slug){
  return categories.find(c=>c.slug===slug)||null
}

// "Porto – Matosinhos" -> {district:'Porto', city:'Matosinhos'}
function partsOf(location){
  const partes=String(location||'').split(/\s[–-]\s/)
  return{district:(partes[0]||'').trim(),city:(partes[1]||'').trim()}
}

// Lugares (distrito e cidade) onde um profissional aparece, com o slug de URL.
function placesOf(pro){
  const{district,city}=partsOf(pro.location)
  const out=[]
  for(const nome of[district,city]){
    const slug=slugify(nome)
    if(slug&&!out.some(p=>p.slug===slug))out.push({slug,name:nome})
  }
  return out
}

const COLUNAS='id,name,slug,bio,photo_url,category,location,verified,plan,avg_response_minutes,response_sample_count,created_at'

// Todos os profissionais públicos (mesmos filtros que o site: aprovados, não
// suspensos, não demo). Usa a service role porque approved/suspended não são
// legíveis pelo role anon.
async function loadPros(admin){
  const{data,error}=await admin.from('profiles').select(COLUNAS)
    .not('category','is',null).neq('category','')
    .eq('approved',true).eq('suspended',false).eq('is_demo',false)
    .limit(5000)
  if(error)throw new Error(error.message)
  return data||[]
}

const PLANOS_PAGOS=['starter','pro','premium']

// Pagos primeiro, depois verificados, depois os mais recentes.
function ordenar(pros){
  const pontos=p=>(PLANOS_PAGOS.includes(p.plan)?2:0)+(p.verified?1:0)
  return pros.slice().sort((a,b)=>pontos(b)-pontos(a)||String(b.created_at||'').localeCompare(String(a.created_at||'')))
}

function profileUrl(p){
  return p.slug?`${SITE}/${encodeURIComponent(p.slug)}`:`${SITE}/profile.html?id=${encodeURIComponent(p.id)}`
}

// Combinações categoria × lugar que têm pelo menos 1 profissional.
// Devolve [{cat, place:{slug,name}, pros:[...]}]
function combinacoes(pros){
  const mapa=new Map()
  for(const p of pros){
    const cat=categories.find(c=>c.serviceType===p.category)
    if(!cat)continue
    for(const place of placesOf(p)){
      const chave=cat.slug+'/'+place.slug
      if(!mapa.has(chave))mapa.set(chave,{cat,place,pros:[]})
      mapa.get(chave).pros.push(p)
    }
  }
  return[...mapa.values()]
}

module.exports={categories,SITE,DISTRITOS,slugify,esc,categoryBySlug,partsOf,placesOf,loadPros,ordenar,profileUrl,combinacoes}
