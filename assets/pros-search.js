// Pesquisa de profissionais: carregar, filtrar, ordenar e paginar.
//
// Partilhado por categoria.html, pelo template das páginas de categoria
// (templates/categoria.template.html -> eletricistas.html, canalizadores.html, ...)
// e por eletricista-lisboa.html. Antes, cada página trazia a sua cópia deste
// código, com um erro sério: a paginação vinha da base de dados (12 por vez) e
// os filtros de plano, avaliação e preço, e a ordenação por avaliação/preço,
// eram aplicados depois, só sobre esses 12. Resultado: "4+ estrelas" ignorava
// quem estava nas outras páginas, a contagem "N encontrados" não refletia os
// filtros, e a ordenação só reordenava a página atual.
//
// Agora carrega-se o conjunto completo (até LIMITE profissionais, já filtrado
// no servidor por categoria/zona/pesquisa/verificado), aplicam-se TODOS os
// filtros e a ordenação sobre esse conjunto, e só no fim se pagina.
//
// Funciona no browser (global ProsSearch) e em Node (require), para ter testes.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProsSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var LIMITE = 500;
  var LOTE = 100; // ids por pedido .in() (URLs curtas)
  var COLUNAS = 'id,name,slug,category,location,plan,photo_url,bio,verified,created_at,avg_response_minutes,response_sample_count';

  // Planos com "primeiro lugar nas listagens" (promessa do pricing.html): Pro e
  // Empresas (que inclui tudo do Pro). "premium" é o nome legado do Pro.
  var DESTAQUE = { pro: true, premium: true, empresas: true };
  function temDestaque(p) { return DESTAQUE[p && p.plan] ? 1 : 0; }

  // Limpa o texto de pesquisa antes de o meter numa string .or() do PostgREST,
  // onde vírgulas, parênteses e aspas separam condições.
  function sanitizarPesquisa(s) {
    return String(s == null ? '' : s).replace(/[,()\\"%*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  // [{professional_id, rating}] -> { id: {s: soma, c: nº} }
  function resumirAvaliacoes(rows) {
    var m = {};
    (rows || []).forEach(function (r) {
      var x = m[r.professional_id] || (m[r.professional_id] = { s: 0, c: 0 });
      x.s += Number(r.rating) || 0;
      x.c++;
    });
    return m;
  }

  // [{professional_id, price_from}] -> { id: preço mínimo }
  function precosMinimos(rows) {
    var m = {};
    (rows || []).forEach(function (s) {
      var v = Number(s.price_from);
      if (v > 0 && (m[s.professional_id] == null || v < m[s.professional_id])) m[s.professional_id] = v;
    });
    return m;
  }

  function media(r) { return r && r.c ? r.s / r.c : 0; }

  function respondeRapido(p, limiteMinutos) {
    return p.response_sample_count > 0 && p.avg_response_minutes != null &&
      Number(p.avg_response_minutes) <= (limiteMinutos || 60);
  }

  // opts: { planos:['pro','premium'] | [], minRating, priceMin, priceMax, rapido }
  function filtrar(pros, base, opts) {
    opts = opts || {};
    var planos = opts.planos && opts.planos.length ? opts.planos : null;
    var minRating = Number(opts.minRating) || 0;
    var pMin = Number(opts.priceMin) || 0;
    var pMax = Number(opts.priceMax) || 99999;
    return pros.filter(function (p) {
      if (planos && planos.indexOf(p.plan) === -1) {
        // "Pro" inclui Empresas (que traz tudo do Pro).
        if (!(planos.indexOf('pro') !== -1 && p.plan === 'empresas')) return false;
      }
      if (minRating > 0) {
        var r = base.rMap[p.id];
        if (!r || media(r) < minRating) return false;
      }
      if (pMin > 0 || pMax < 99999) {
        var preco = base.pMap[p.id];
        if (preco == null) { if (pMin > 0) return false; }
        else if (preco < pMin || preco > pMax) return false;
      }
      if (opts.rapido && !respondeRapido(p)) return false;
      return true;
    });
  }

  // Em TODAS as ordenações os planos com destaque vão primeiro (é um benefício
  // anunciado); dentro do mesmo grupo vale o critério escolhido.
  function ordenar(pros, base, sort) {
    var lista = pros.slice();
    function porRecente(a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }
    var criterio;
    if (sort === 'rating') {
      criterio = function (a, b) {
        var ra = base.rMap[a.id], rb = base.rMap[b.id];
        return (media(rb) - media(ra)) || ((rb ? rb.c : 0) - (ra ? ra.c : 0)) || porRecente(a, b);
      };
    } else if (sort === 'price_asc') {
      criterio = function (a, b) {
        var pa = base.pMap[a.id], pb = base.pMap[b.id];
        if (pa == null && pb == null) return porRecente(a, b);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb || porRecente(a, b);
      };
    } else if (sort === 'response') {
      criterio = function (a, b) {
        var ta = respondeRapido(a, 1e9) ? Number(a.avg_response_minutes) : Infinity;
        var tb = respondeRapido(b, 1e9) ? Number(b.avg_response_minutes) : Infinity;
        if (ta === tb) return porRecente(a, b);
        return ta < tb ? -1 : 1;
      };
    } else if (sort === 'newest') {
      criterio = porRecente;
    } else { // 'plan' = "Destaque primeiro"
      criterio = function (a, b) {
        return ((b.verified ? 1 : 0) - (a.verified ? 1 : 0)) ||
          (media(base.rMap[b.id]) - media(base.rMap[a.id])) || porRecente(a, b);
      };
    }
    lista.sort(function (a, b) { return (temDestaque(b) - temDestaque(a)) || criterio(a, b); });
    return lista;
  }

  function paginar(lista, pagina, porPagina) {
    porPagina = porPagina || 12;
    var total = lista.length;
    var totalPages = Math.max(1, Math.ceil(total / porPagina));
    var page = Math.min(Math.max(1, Number(pagina) || 1), totalPages);
    var de = (page - 1) * porPagina;
    return { items: lista.slice(de, de + porPagina), total: total, totalPages: totalPages, page: page };
  }

  // filtros + ordenação + paginação sobre o conjunto completo.
  function consultar(base, opts) {
    opts = opts || {};
    var lista = ordenar(filtrar(base.pros, base, opts), base, opts.sort);
    var pg = paginar(lista, opts.page, opts.perPage);
    pg.lista = lista;
    return pg;
  }

  var cache = null;

  // Carrega os profissionais (filtrados no servidor) com avaliações e preços.
  // opts: { cat, loc, zona, q, verified }. Guarda em cache enquanto estes
  // filtros não mudarem, para mexer nos filtros do lado do cliente ser instantâneo.
  async function carregar(db, opts) {
    opts = opts || {};
    var chave = JSON.stringify([opts.cat || '', opts.loc || '', opts.zona || '', opts.q || '', !!opts.verified]);
    if (cache && cache.chave === chave) return cache.base;

    var hoje = new Date().toISOString().slice(0, 10);
    var q = db.from('profiles').select(COLUNAS).eq('is_demo', false);
    q = q.or('unavailable_until.is.null,unavailable_until.lt.' + hoje);
    if (opts.cat) q = q.ilike('category', '%' + opts.cat + '%');
    if (opts.loc) q = q.ilike('location', '%' + opts.loc + '%');
    if (opts.zona) q = q.ilike('location', '%' + opts.zona + '%');
    var termo = sanitizarPesquisa(opts.q);
    if (termo) q = q.or('name.ilike.%' + termo + '%,category.ilike.%' + termo + '%,bio.ilike.%' + termo + '%');
    if (opts.verified) q = q.eq('verified', true);
    var res = await q.order('created_at', { ascending: false }).limit(LIMITE);
    if (res.error) return { error: res.error, pros: [], rMap: {}, pMap: {} };

    var pros = res.data || [];
    var ids = pros.map(function (p) { return p.id; });
    var avaliacoes = [], servicos = [];
    for (var i = 0; i < ids.length; i += LOTE) {
      var lote = ids.slice(i, i + LOTE);
      var par = await Promise.all([
        db.from('reviews').select('professional_id,rating').in('professional_id', lote),
        db.from('services').select('professional_id,price_from').in('professional_id', lote),
      ]);
      avaliacoes = avaliacoes.concat(par[0].data || []);
      servicos = servicos.concat(par[1].data || []);
    }
    var base = { pros: pros, rMap: resumirAvaliacoes(avaliacoes), pMap: precosMinimos(servicos), error: null };
    cache = { chave: chave, base: base };
    return base;
  }

  function limparCache() { cache = null; }

  return {
    LIMITE: LIMITE, sanitizarPesquisa: sanitizarPesquisa, resumirAvaliacoes: resumirAvaliacoes,
    precosMinimos: precosMinimos, filtrar: filtrar, ordenar: ordenar, paginar: paginar,
    consultar: consultar, carregar: carregar, limparCache: limparCache, respondeRapido: respondeRapido,
  };
});
