// Sitemap dinâmico dos perfis públicos de profissionais.
//
// sitemap.xml (na raiz do site) é mantido à mão e serve bem para as
// páginas fixas (categorias, pricing, etc.) — mas os perfis de
// profissionais são criados e atualizados todos os dias na base de
// dados. Um ficheiro estático ficaria desatualizado no dia seguinte, e
// até agora nenhum perfil aparecia no sitemap, o que prejudica a forma
// como o Google descobre e indexa as páginas de profissionais. Esta
// função gera o sitemap de perfis em tempo real, sempre que pedido.
//
// Usa a service role (só leitura aqui) em vez da chave pública porque
// precisamos de "approved"/"suspended"/"updated_at" para filtrar bem e
// dar um lastmod correto — colunas que, por segurança, o role anon não
// pode ler diretamente (ver supabase/migrations/20260815152431_*.sql).
const { createClient } = require('@supabase/supabase-js')

const SITE = process.env.URL || 'https://flinko.pt'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Limite do próprio protocolo de sitemaps (50 000 URLs por ficheiro). Se a
// Flinko chegar a ter mais profissionais aprovados do que isto, este
// ficheiro passa a precisar de paginação (sitemap index) — não é o caso
// hoje, mas fica aqui documentado para quem chegar a esse ponto.
const LIMITE_URLS = 50000

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function urlDoPerfil(p) {
  // Profissionais Pro têm link próprio (flinko.pt/o-nome-dele); os
  // restantes ficam no endereço com ?id=, que continua indexável.
  return p.slug ? `${SITE}/${encodeURIComponent(p.slug)}` : `${SITE}/profile.html?id=${p.id}`
}

exports.handler = async () => {
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('id,slug,updated_at,created_at')
      .not('category', 'is', null)
      .neq('category', '')
      .eq('approved', true)
      .eq('suspended', false)
      .eq('is_demo', false)
      .order('created_at', { ascending: false })
      .limit(LIMITE_URLS)

    if (error) throw error

    const urls = (data || []).map((p) => {
      const lastmod = String(p.updated_at || p.created_at || '').slice(0, 10)
      return `<url><loc>${esc(urlDoPerfil(p))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.6</priority></url>`
    }).join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: xml,
    }
  } catch (e) {
    console.error('sitemap-profiles error:', e)
    // Nunca devolver erro ao Google num pedido de sitemap: alguns motores
    // de busca marcam o sitemap inteiro como inválido por causa disso.
    // Preferimos devolver um sitemap vazio mas válido, e o erro real fica
    // só nos logs da função.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
    }
  }
}
