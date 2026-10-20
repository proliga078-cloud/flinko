// Cálculos da parte "Números e decisões" do painel de gestão (gestao.html).
// Funções puras: recebem as linhas da base de dados e devolvem números.
// Funcionam no browser (global FlinkoNumeros) e em Node (testes).
//
// Visitantes reais: tiramos a equipa e os profissionais. Um visitante conta
// como "da casa" se em algum momento entrou com uma conta profissional ou de
// admin (o mesmo visitor_id aparece com esse user_id). Sem isto, os números
// eram sobretudo a equipa a abrir o painel.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlinkoNumeros = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DIA = 864e5;

  var CATEGORIAS = { eletricistas: 'Eletricistas', canalizadores: 'Canalizadores', pintores: 'Pintores', pedreiros: 'Pedreiros', carpinteiros: 'Carpinteiros', serralheiros: 'Serralheiros', jardineiros: 'Jardineiros', limpeza: 'Limpeza', mudancas: 'Mudanças', decoradores: 'Decoradores', programadores: 'Programadores', designers: 'Designers', 'reparacoes-tech': 'Reparações Tech', 'personal-trainers': 'Personal Trainers', cabeleireiros: 'Cabeleireiros', esteticistas: 'Esteticistas', 'eletricista-lisboa': 'Eletricistas' };
  var PAGINAS = { '': 'inicio', index: 'inicio', categoria: 'pesquisa', pedidos: 'pedidos', pedido: 'pedidos', auth: 'conta', dashboard: 'painel', messages: 'painel', gestao: 'painel', admin: 'painel', profissionais: 'profissionais', pricing: 'precos', sobre: 'outra', contacto: 'outra', 'como-funciona': 'outra', academia: 'outra', 'porque-escolher': 'outra', termos: 'outra', privacidade: 'outra', cookies: 'outra', rgpd: 'outra', 'calculadora-orcamento': 'outra', avaliar: 'outra', cartaz: 'painel', profile: 'perfil' };

  // De onde veio a visita. "Interno" = passos dentro do próprio site ou do
  // início de sessão/pagamento: não é um canal de marketing.
  function canal(host) {
    var h = String(host || '').toLowerCase().replace(/^www\./, '');
    if (!h || h === 'direto') return 'Direto';
    if (/(^|\.)flinko\.pt$|netlify\.app$|^accounts\.google\.|checkout\.stripe\.com|localhost/.test(h)) return 'Interno';
    if (/(^|\.)google\./.test(h)) return 'Google';
    if (/facebook\.com$|fb\.com$|fb\.me$/.test(h)) return 'Facebook';
    if (/instagram\.com$/.test(h)) return 'Instagram';
    if (/chatgpt\.com$|openai\.com$|perplexity\.ai$|copilot\.microsoft\.com$|gemini\.google\.com$|claude\.ai$/.test(h)) return 'IA (ChatGPT e outros)';
    if (/bing\.com$|duckduckgo\.com$|yahoo\.|ecosia\.org$/.test(h)) return 'Outros motores de pesquisa';
    if (/whatsapp\.com$|wa\.me$/.test(h)) return 'WhatsApp';
    if (/linkedin\.com$|lnkd\.in$|tiktok\.com$|t\.co$|twitter\.com$|x\.com$/.test(h)) return 'Outras redes';
    return 'Outros sites';
  }

  // Que página é: categoria (com o ofício), perfil, pesquisa, pedidos…
  function pagina(path) {
    var p = String(path || '').split('?')[0].split('#')[0].replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
    if (CATEGORIAS[p]) return { tipo: 'categoria', categoria: CATEGORIAS[p] };
    if (/^blog-/.test(p)) return { tipo: 'outra' };
    if (Object.prototype.hasOwnProperty.call(PAGINAS, p)) return { tipo: PAGINAS[p] };
    if (/^[a-z0-9-]{3,30}$/.test(p)) return { tipo: 'perfil' }; // link com o nome: flinko.pt/o-nome
    return { tipo: 'outra' };
  }

  // Junta as linhas de visitas (uma por dia/visitante/página) por visitante,
  // e tira a equipa e os profissionais.
  function visitantes(rows, casa) {
    var porVisitante = {}, daCasa = {};
    (rows || []).forEach(function (r) {
      if (r.user_id && casa && casa.has(r.user_id)) daCasa[r.visitor_id] = true;
    });
    (rows || []).forEach(function (r) {
      if (!r.visitor_id || daCasa[r.visitor_id]) return;
      var v = porVisitante[r.visitor_id] || (porVisitante[r.visitor_id] = { id: r.visitor_id, primeiro: r.day, canal: null, tipos: {}, categorias: {}, dias: {} });
      if (r.day < v.primeiro) v.primeiro = r.day;
      v.dias[r.day] = true;
      var c = canal(r.ref_host);
      if (c !== 'Interno' && (!v.canal || r.day < v._diaCanal)) { v.canal = c; v._diaCanal = r.day; }
      var pg = pagina(r.path);
      v.tipos[pg.tipo] = true;
      if (pg.categoria) v.categorias[pg.categoria] = true;
    });
    return Object.keys(porVisitante).map(function (k) { var v = porVisitante[k]; if (!v.canal) v.canal = 'Direto'; return v; });
  }

  function noPeriodo(v, desde, ate) { return Object.keys(v.dias).some(function (d) { return d >= desde && d <= ate; }); }

  // Caminho do cliente num período, a partir das páginas que cada visitante viu.
  function caminho(vis) {
    var n = function (f) { return vis.filter(f).length; };
    return [
      { passo: 'Visitaram o site', n: vis.length },
      { passo: 'Procuraram um ofício', n: n(function (v) { return v.tipos.categoria || v.tipos.pesquisa; }) },
      { passo: 'Viram um perfil', n: n(function (v) { return v.tipos.perfil; }) },
      { passo: 'Abriram os pedidos', n: n(function (v) { return v.tipos.pedidos; }) }
    ];
  }

  function porCanal(vis) {
    var m = {};
    vis.forEach(function (v) {
      var x = m[v.canal] || (m[v.canal] = { canal: v.canal, visitantes: 0, viramPerfil: 0 });
      x.visitantes++;
      if (v.tipos.perfil || v.tipos.pedidos) x.viramPerfil++;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.visitantes - a.visitantes; });
  }

  // Procura (visitantes que viram a página do ofício + pedidos) contra oferta
  // (profissionais com o perfil razoável, 60% ou mais).
  function procuraOferta(vis, pros, pedidos) {
    var m = {};
    var linha = function (c) { return m[c] || (m[c] = { categoria: c, procura: 0, pedidos: 0, profissionais: 0, prontos: 0 }); };
    vis.forEach(function (v) { Object.keys(v.categorias).forEach(function (c) { linha(c).procura++; }); });
    (pedidos || []).forEach(function (r) { if (r.category) linha(r.category).pedidos++; });
    (pros || []).forEach(function (p) { if (!p.category || p.suspended) return; var x = linha(p.category); x.profissionais++; if ((p._pontos || 0) >= 60) x.prontos++; });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return (b.procura + b.pedidos * 5) - (a.procura + a.pedidos * 5) || b.profissionais - a.profissionais; });
  }

  function porDistrito(pros, pedidos) {
    var m = {};
    var d = function (loc) { return String(loc || '').split(' – ')[0].trim(); };
    var linha = function (x) { return m[x] || (m[x] = { distrito: x, profissionais: 0, pedidos: 0 }); };
    (pros || []).forEach(function (p) { var x = d(p.location); if (x && !p.suspended) linha(x).profissionais++; });
    (pedidos || []).forEach(function (r) { var x = d(r.location); if (x) linha(x).pedidos++; });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.profissionais - a.profissionais; });
  }

  function caminhoPro(pros, comContacto) {
    var ativos = (pros || []).filter(function (p) { return !p.suspended; });
    return [
      { passo: 'Criaram conta', n: ativos.length },
      { passo: 'Perfil a 60% ou mais', n: ativos.filter(function (p) { return (p._pontos || 0) >= 60; }).length },
      { passo: 'Verificados', n: ativos.filter(function (p) { return p.verified; }).length },
      { passo: 'Receberam um contacto', n: ativos.filter(function (p) { return comContacto && comContacto.has(p.id); }).length },
      { passo: 'Plano pago', n: ativos.filter(function (p) { return p.plan && p.plan !== 'free'; }).length }
    ];
  }

  // Semanas (segunda a domingo) das últimas n semanas: visitantes reais por semana.
  function semanas(vis, n, hojeStr) {
    var hoje = new Date((hojeStr || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
    var seg = new Date(hoje.getTime() - ((hoje.getUTCDay() + 6) % 7) * DIA);
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var ini = new Date(seg.getTime() - i * 7 * DIA), fim = new Date(ini.getTime() + 6 * DIA);
      var a = ini.toISOString().slice(0, 10), b = fim.toISOString().slice(0, 10);
      out.push({ desde: a, ate: b, n: vis.filter(function (v) { return noPeriodo(v, a, b); }).length });
    }
    return out;
  }
  function contarPorSemana(datas, sem) {
    return sem.map(function (s) { return { desde: s.desde, ate: s.ate, n: (datas || []).filter(function (d) { var x = String(d).slice(0, 10); return x >= s.desde && x <= s.ate; }).length }; });
  }

  // O que fazer a seguir. Cada recomendação vem completa: a situação com os
  // números de agora, o que dizem os estudos, os passos e como medir. Só
  // aparece quando os números a justificam. Prioridade 1 = fazer esta semana.
  function recomendacoes(d) {
    var r = [];
    var pct = function (a, b) { return b ? Math.round(a / b * 100) : 0; };
    var vis = d.caminho[0].n, procuraram = d.caminho[1].n, perfil = d.caminho[2].n, pedidos = d.caminho[3].n;
    var cp = d.caminhoPro, pros = cp[0].n;
    var canaisFora = d.canais.filter(function (c) { return c.canal !== 'Direto'; });
    var top = (d.distritos || [])[0];

    if (vis < 300) r.push({
      id: 'trafego', prioridade: 1,
      titulo: 'Trazer clientes: o problema é falta de gente, não o site',
      situacao: 'Tiveste ' + vis + ' visitantes reais em ' + d.dias + ' dias (sem contar a equipa nem os profissionais). ' + (pedidos ? pedidos + ' chegaram aos pedidos.' : 'Nenhum chegou a publicar um pedido.') + ' Num site de serviços, só uma pequena parte de quem visita chega a pedir alguma coisa, por isso com estes números é normal haver 0 pedidos.',
      estudo: 'Andrew Chen (The Cold Start Problem, 2021; foi responsável pelo crescimento da Uber) mostra que um marketplace só arranca quando junta, num sítio pequeno, gente suficiente dos dois lados para os encontros acontecerem sozinhos: a "rede atómica". Antes disso, melhorar o site rende pouco. O que rende é trazer pessoas à mão.',
      passos: [
        'Escolhe UM distrito para começar' + (top ? ' (sugestão: ' + top.distrito + ', onde tens ' + top.profissionais + ' profissionais)' : '') + '. Todo o marketing desta fase vai para lá.',
        'Todos os dias, 15 minutos nos grupos de Facebook de moradores desse distrito: quando alguém pergunta "alguém conhece um eletricista?", responde com o link do ofício (flinko.pt/eletricistas). Nada de publicidade solta, só respostas úteis.',
        'Liga e escreve às administradoras de condomínio do distrito. Cada uma gere dezenas de prédios e precisa de profissionais todas as semanas.',
        'Pede a cada profissional que partilhe o seu link com o nome e o QR com os clientes que já tem. É o canal mais barato que existe.',
        'Depois de 2 semanas, mede de onde vieram os visitantes (secção "De onde vêm") e põe mais tempo no canal que trouxe mais gente a ver perfis.'
      ],
      medir: 'Visitantes reais por semana (objetivo: dobrar em 4 semanas) e pedidos publicados (objetivo: os primeiros 5).'
    });

    if (canaisFora.length) {
      var melhor = canaisFora.slice().sort(function (a, b) { return b.viramPerfil - a.viramPerfil || b.visitantes - a.visitantes; })[0];
      r.push({
        id: 'canal', prioridade: 2,
        titulo: 'Investir mais em ' + melhor.canal,
        situacao: melhor.canal + ' trouxe ' + melhor.visitantes + ' visitantes reais, e ' + melhor.viramPerfil + ' (' + pct(melhor.viramPerfil, melhor.visitantes) + '%) chegaram a um perfil ou aos pedidos. É o canal de fora que melhor está a funcionar neste período. Os outros: ' + canaisFora.filter(function (c) { return c !== melhor; }).map(function (c) { return c.canal + ' ' + c.visitantes; }).join(', ') + '.',
        estudo: 'A regra dos marketplaces que cresceram (Lenny Rachitsky estudou como arrancaram os maiores marketplaces de consumo, 2020) é concentrar esforço nos poucos canais que já mostram resultado, em vez de estar em todo o lado. Cada canal novo só se testa com um objetivo e um prazo.',
        passos: melhor.canal === 'Google' ? [
          'Cria o Perfil da Empresa no Google (business.google.com) para o Flinko, com fotos, horário e o link do site. É grátis.',
          'Garante que cada página de ofício tem texto útil para quem pesquisa (preços normais, o que perguntar ao profissional). O Google mostra páginas que respondem a perguntas.',
          'Testa anúncios no Google com 5 € por dia, só para "eletricista + distrito" e "canalizador + distrito", durante 2 semanas. Mede quantos visitantes chegaram aos perfis.'
        ] : melhor.canal === 'Facebook' || melhor.canal === 'Instagram' ? [
          'Publica 3 vezes por semana trabalhos reais dos profissionais (com autorização), com o nome e o link do perfil.',
          'Entra em mais grupos de moradores e responde a pedidos de recomendação com o link do ofício.',
          'Testa um anúncio local de 5 € por dia mostrado só a quem vive no distrito escolhido.'
        ] : [
          'Descobre que páginas ou mensagens trouxeram estas visitas e repete o que funcionou.',
          'Põe o link com o nome de cada profissional em todo o lado onde esse canal aparece.',
          'Revê os números ao fim de 2 semanas e decide se continuas.'
        ],
        medir: 'Visitantes de ' + melhor.canal + ' por semana e quantos chegam a um perfil.'
      });
    }

    if (vis >= 15 && pct(perfil, vis) < 30) r.push({
      id: 'perfis-vistos', prioridade: 2,
      titulo: 'Levar quem chega até aos perfis',
      situacao: 'Só ' + perfil + ' de ' + vis + ' visitantes (' + pct(perfil, vis) + '%) abriram o perfil de um profissional. ' + procuraram + ' procuraram um ofício. Os restantes saíram antes de ver quem faz o trabalho.',
      estudo: 'Nielsen Norman Group (estudos de rastreio do olhar) mostra que as pessoas passam a maior parte do tempo no primeiro ecrã e leem só 20 a 28% do texto. Se o primeiro ecrã não mostra logo profissionais reais, a pessoa sai.',
      passos: [
        'Mostrar na página inicial, logo no primeiro ecrã, 3 profissionais reais do distrito escolhido, com foto e preço.',
        'Nas páginas de cada ofício, pôr os profissionais antes do texto explicativo.',
        'Garantir que todos os profissionais com perfil visível têm foto de cara e pelo menos um serviço com preço.'
      ],
      medir: 'Percentagem de visitantes que veem um perfil (objetivo: mais de 40%).'
    });

    if (perfil >= 8 && pedidos === 0) r.push({
      id: 'confianca', prioridade: 2,
      titulo: 'Quem vê perfis não avança: falta confiança',
      situacao: perfil + ' visitantes viram perfis e nenhum abriu os pedidos. Há ' + d.avaliacoes + ' avaliações em todo o site.',
      estudo: 'Spiegel Research Center (Northwestern, 2017): um produto com 5 avaliações tem cerca de 270% mais probabilidade de ser escolhido do que um sem nenhuma. BrightLocal (inquérito anual a consumidores) mostra que a grande maioria lê avaliações antes de escolher um serviço local.',
      passos: [
        'Pede a cada profissional 3 avaliações de clientes antigos esta semana (texto pronto em Mensagens: "Pedir avaliações").',
        'Verifica todos os profissionais que têm documentos enviados. O selo aparece nos cartões e no perfil.',
        'Nos perfis sem avaliações, mostrar os trabalhos feitos (fotos) em destaque.'
      ],
      medir: 'Profissionais com 3 ou mais avaliações (objetivo: 10 em 4 semanas).'
    });

    var falta = d.procuraOferta.filter(function (c) { return (c.procura + c.pedidos) > 0 && c.prontos === 0; });
    if (falta.length) r.push({
      id: 'angariar', prioridade: 1,
      titulo: 'Angariar profissionais onde já há procura',
      situacao: 'Estes ofícios têm procura e nenhum profissional com o perfil completo: ' + falta.slice(0, 4).map(function (c) { return c.categoria + ' (' + c.procura + ' visitas, ' + c.pedidos + ' pedidos)'; }).join('; ') + '. Quem procura e não encontra ninguém dificilmente volta.',
      estudo: 'Andrew Chen e a Andreessen Horowitz chamam a isto liquidez: a probabilidade de quem procura encontrar resposta. É a métrica mais importante de um marketplace. Procura sem oferta gasta os clientes que tanto custaram a trazer.',
      passos: [
        'Na parte Angariação, junta 10 profissionais destes ofícios da tua zona (OLX, Facebook, Google Maps, carrinhas na rua).',
        'Contacta-os com o texto pronto "Primeiro contacto" e oferece-te para lhes criar o perfil ao telefone, em 5 minutos.',
        'Aos que já têm conta nestes ofícios, pede que completem o perfil (texto pronto "Completar o perfil").'
      ],
      medir: 'Profissionais com perfil a 60% ou mais em cada um destes ofícios (objetivo: 3 por ofício).'
    });

    var parados = d.procuraOferta.filter(function (c) { return c.prontos >= 2 && c.procura === 0 && c.pedidos === 0; });
    if (parados.length) r.push({
      id: 'divulgar', prioridade: 3,
      titulo: 'Divulgar ofícios que têm profissionais mas ninguém procura',
      situacao: 'Há profissionais prontos e nenhuma procura em: ' + parados.slice(0, 4).map(function (c) { return c.categoria + ' (' + c.prontos + ' prontos)'; }).join(', ') + '. Estes profissionais vão desistir se não receberem contactos.',
      estudo: 'Bill Gurley (Benchmark, "All Markets Are Not Created Equal", 2012): o lado da oferta de um marketplace só fica se receber trabalho. Um profissional sem contactos em 30 dias é um profissional perdido.',
      passos: [
        'Faz uma publicação por ofício nos grupos de Facebook e no Instagram com o link da página desse ofício.',
        'Escreve um artigo útil por ofício na Academia (por exemplo "Quanto custa pintar uma casa em 2026") e partilha-o.',
        'Diz a estes profissionais que partilhem o seu link e o QR: são eles que conhecem os clientes.'
      ],
      medir: 'Visitas às páginas destes ofícios por semana.'
    });

    if (top && top.profissionais >= 3 && top.pedidos === 0) r.push({
      id: 'local', prioridade: 2,
      titulo: 'Concentrar o marketing em ' + top.distrito,
      situacao: top.distrito + ' tem ' + top.profissionais + ' profissionais e 0 pedidos. É onde um cliente novo encontra mais escolha, por isso é onde cada euro e cada hora de marketing rende mais.',
      estudo: 'No estudo de Lenny Rachitsky sobre como arrancaram os maiores marketplaces, a maioria começou limitada a uma cidade ou a um bairro, e só passou à seguinte quando a primeira funcionava sozinha.',
      passos: [
        'Lista os 10 maiores grupos de Facebook de moradores de ' + top.distrito + ' e entra em todos.',
        'Contacta as administradoras de condomínio de ' + top.distrito + ' (o kit de angariação tem o texto).',
        'Põe cartazes com QR em cafés, papelarias e lojas de bairro de ' + top.distrito + '.'
      ],
      medir: 'Pedidos publicados em ' + top.distrito + ' (objetivo: os primeiros 5 em 4 semanas).'
    });

    if (pros && pct(cp[1].n, pros) < 60) r.push({
      id: 'perfis', prioridade: 2,
      titulo: 'Completar os perfis dos profissionais',
      situacao: 'Só ' + cp[1].n + ' de ' + pros + ' profissionais (' + pct(cp[1].n, pros) + '%) têm o perfil a 60% ou mais. O que mais falta: ' + (d.faltaMaisComum || 'foto, serviço com preço e trabalhos') + '.',
      estudo: 'Estudos com dados do Airbnb (Ert, Fleischer e Magen, 2016; Zhang e outros, Management Science 2022) mostram que a foto de cara e as fotos reais de trabalhos mudam a confiança e a procura. Um perfil vazio afasta o cliente que chegou.',
      passos: [
        'Envia o texto pronto "Completar o perfil" a todos com o perfil abaixo de 60% (Mensagens, grupo "Perfil incompleto").',
        'Liga aos 5 com mais visitas e completa o perfil com eles ao telefone.',
        'Não mostres na página inicial perfis abaixo de 60%.'
      ],
      medir: 'Percentagem de perfis a 60% ou mais (objetivo: 70%).'
    });

    if (pros && pct(cp[2].n, pros) < 70) r.push({
      id: 'verificar', prioridade: 3,
      titulo: 'Verificar mais profissionais',
      situacao: (pros - cp[2].n) + ' de ' + pros + ' profissionais ainda não estão verificados. Nos cartões e nos perfis, quem não tem o selo parece menos sério ao lado de quem tem, mesmo que faça o mesmo trabalho.',
      estudo: 'Um estudo da Universidade de Stanford com o Airbnb (PNAS, 2017) mostrou que a reputação visível faz as pessoas confiarem em desconhecidos. O selo de verificado é a primeira prova de reputação de um perfil novo.',
      passos: [
        'Abre Profissionais e escolhe o filtro "Por verificar".',
        'Confirma por telefone ou com documento e carrega em Verificar.',
        'Aos que não respondem, envia a mensagem a pedir o documento.'
      ],
      medir: 'Percentagem de profissionais verificados (objetivo: 80%).'
    });

    return r.sort(function (a, b) { return a.prioridade - b.prioridade; }).slice(0, 7);
  }

  return { canal: canal, pagina: pagina, visitantes: visitantes, noPeriodo: noPeriodo, caminho: caminho, porCanal: porCanal, procuraOferta: procuraOferta, porDistrito: porDistrito, caminhoPro: caminhoPro, semanas: semanas, contarPorSemana: contarPorSemana, recomendacoes: recomendacoes };
});
