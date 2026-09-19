// Sitemap das páginas locais (/eletricistas/braga, ...).
//
// Só entram combinações categoria × zona com pelo menos 1 profissional real:
// listar páginas vazias no sitemap dá ao Google centenas de páginas sem
// conteúdo, o que prejudica o site todo. Cresce sozinho à medida que entram
// profissionais em zonas novas.
const{createClient}=require('@supabase/supabase-js')
const{SITE,esc,loadPros,combinacoes}=require('./_local')

const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const VAZIO='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n'

exports.handler=async()=>{
  const cabecalhos={'Content-Type':'application/xml; charset=utf-8'}
  try{
    const combos=combinacoes(await loadPros(admin))
    const hoje=new Date().toISOString().slice(0,10)
    const urls=combos
      .sort((a,b)=>(a.cat.slug+a.place.slug).localeCompare(b.cat.slug+b.place.slug))
      .map(c=>`<url><loc>${esc(`${SITE}/${c.cat.slug}/${c.place.slug}`)}</loc><lastmod>${hoje}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`)
      .join('')
    return{
      statusCode:200,
      headers:{...cabecalhos,'Cache-Control':'public, max-age=3600'},
      body:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    }
  }catch(err){
    // Nunca devolver erro ao Google num sitemap: um sitemap vazio mas válido é
    // melhor do que ele marcar o ficheiro inteiro como inválido.
    console.error('sitemap-local error:',err)
    return{statusCode:200,headers:cabecalhos,body:VAZIO}
  }
}
