// Painel de gestão arrumado em 5 áreas (out/2026). O dono achou o painel
// confuso: 9 partes, ~35 separadores e coisas repetidas. As vistas continuam
// as mesmas (e os mesmos endereços, #dinheiro/faturas, ...); este ficheiro só
// muda a arrumação: menu com 5 áreas + Empresa, um sub-menu por área no lugar
// dos separadores de cada parte, e uma página Hoje que diz o que decidir.
"use strict";

const AREAS = [
  { id: "hoje", nome: "Hoje", icone: ICONES.hoje, partes: ["hoje"], itens: [["#hoje", "Resumo"], ["#hoje/tarefas", "Tarefas"], ["#hoje/calendario", "Calendário"]] },
  { id: "pessoas", nome: "Pessoas", icone: ICONES.profissionais, partes: ["profissionais", "clientes", "angariacao"], itens: [["#profissionais", "Profissionais"], ["#clientes/clientes", "Clientes"], ["#clientes", "Pedidos"], ["#angariacao", "Angariação"]] },
  { id: "comunicacao", nome: "Comunicação", icone: ICONES.mensagens, partes: ["mensagens"], itens: [["#mensagens", "Conversas"], ["#mensagens/enviar", "Enviar a um grupo"], ["#mensagens/outros", "Outros envios"], ["#angariacao/guias", "Textos prontos"], ["#angariacao/marketing", "Campanhas"]] },
  { id: "operacao", nome: "Operação", icone: ICONES.moderacao, partes: ["moderacao"], itens: [["#moderacao/denuncias", "Denúncias"], ["#moderacao/apoio", "Pedidos de apoio"], ["#moderacao/avaliacoes", "Avaliações"], ["#moderacao/conversas", "Conversas suspeitas"], ["#moderacao/verificacoes", "Verificações"], ["#moderacao/rgpd", "RGPD"]] },
  { id: "negocio", nome: "Negócio", icone: ICONES.estrategia, partes: ["estrategia", "dinheiro"], itens: [["—", "Estratégia"], ["#estrategia", "Análise"], ["#estrategia/objetivos", "Objetivos"], ["#estrategia/plano", "Plano e decisões"], ["#estrategia/historico", "Histórico"], ["#estrategia/relatorio", "Relatório"], ["#estrategia/investidores", "Investidores"], ["—", "Dinheiro"], ["#dinheiro", "Resumo"], ["#dinheiro/movimentos", "Movimentos"], ["#dinheiro/faturas", "Faturas"], ["#dinheiro/precos", "Preços"]] },
  { id: "empresa", nome: "Empresa", icone: ICONES.empresa, partes: ["empresa"], itens: [["#empresa", "Equipa"], ["#empresa/registo", "Registo de ações"], ["#empresa/conformidade", "Conformidade e riscos"], ["#empresa/contactos", "Contactos e processos"]] }
];
// No telemóvel cabem 4 áreas em baixo; Negócio e Empresa vão para "Mais".
const AREAS_PRINCIPAIS = ["hoje", "pessoas", "comunicacao", "operacao"];
// O item do sub-menu é o endereço mais comprido que começa o endereço atual.
function itemAtual(h) {
  let melhor = null;
  AREAS.forEach(a => a.itens.forEach(([x]) => { if (x !== "—" && (h === x || h.startsWith(x + "/")) && (!melhor || x.length > melhor[1].length)) melhor = [a, x]; }));
  return melhor;
}
function areaAtual() {
  const h = location.hash || "#hoje", m = itemAtual(h);
  if (m) return m[0];
  const p = h.slice(1).split("/")[0];
  return AREAS.find(a => a.partes.includes(p)) || AREAS[0];
}

desenharNav = function (contas = {}) {
  const A = areaAtual(), conta = a => a.partes.reduce((s, p) => s + (contas[p] || 0), 0);
  const outras = AREAS.filter(a => !AREAS_PRINCIPAIS.includes(a.id)), nOutras = outras.reduce((s, a) => s + conta(a), 0);
  $("#nav").innerHTML = AREAS.map(a => `${a.id === "empresa" ? '<span class="nav-sep" aria-hidden="true"></span>' : ""}<a href="${a.itens.find(i => i[0] !== "—")[0]}"${AREAS_PRINCIPAIS.includes(a.id) ? "" : ' class="sec"'}${a === A ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${a.icone}</svg><span>${esc(a.nome)}</span>${conta(a) ? `<span class="conta" aria-label="${conta(a)} por tratar">${conta(a)}</span>` : ""}</a>`).join("") +
    `<button type="button" class="mais" id="bMais" aria-label="Mais áreas e procurar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span>Mais</span>${nOutras ? `<span class="conta">${nOutras}</span>` : ""}</button>`;
  $("#bMais").onclick = () => {
    abrirFicha(`<div class="cab"><div><h2>Mais</h2></div><button class="fechar" aria-label="Fechar">×</button></div>
      <button type="button" class="btn linha" style="width:100%;margin-bottom:12px" id="mProcurar">Procurar pessoas, pedidos, contactos…</button>
      <ul class="lista">${outras.map(a => `<li><a href="${a.itens.find(i => i[0] !== "—")[0]}" class="info" style="text-decoration:none" data-fechar><b>${esc(a.nome)}</b></a>${conta(a) ? `<span class="tag laranja">${conta(a)}</span>` : ""}</li>`).join("")}</ul>`);
    $("#mProcurar").onclick = () => { fecharFicha(); if (typeof abrirPesquisa === "function") abrirPesquisa(); };
    $("#ficha").querySelectorAll("[data-fechar]").forEach(a => a.addEventListener("click", fecharFicha));
  };
};

// Troca os separadores de cada parte pelo sub-menu da área (guarda as contagens).
function subMenu(main) {
  const contagens = {};
  main.querySelectorAll('.tabs[role="tablist"]').forEach(t => {
    t.querySelectorAll('[role="tab"]').forEach(b => { const tag = b.querySelector(".tag"); if (tag) contagens[b.textContent.replace(tag.textContent, "").trim()] = tag.textContent.trim(); });
    t.remove();
  });
  const A = areaAtual(), m = itemAtual(location.hash || "#hoje"), atual = m && m[0] === A ? m[1] : null;
  const html = `<nav class="subnav" aria-label="${esc(A.nome)}">${A.itens.map(([x, n]) => x === "—" ? `<span class="subsep">${esc(n)}</span>` : `<a href="${x}"${x === atual ? ' aria-current="page"' : ""}>${esc(n)}${contagens[n] ? ` <span class="conta-sub">${esc(contagens[n])}</span>` : ""}</a>`).join("")}</nav>`;
  const tp = main.querySelector(".topo");
  // O título de cada página é o nome da área (o sub-menu diz em que página estás).
  const h1 = tp && tp.querySelector("h1"); if (h1) h1.textContent = A.nome;
  if (tp) tp.insertAdjacentHTML("afterend", html); else main.insertAdjacentHTML("afterbegin", html);
}
desenharParte = async function () {
  const h = (location.hash || "#hoje").slice(1).split("/")[0];
  parte = PARTES.some(([id]) => id === h) ? h : "hoje";
  desenharNav(C.contas);
  const main = $("#main");
  main.innerHTML = '<p class="vazio">A carregar…</p>';
  try { await VISTAS[parte](main); } catch (e) { main.innerHTML = `<div class="cartao"><h2>Não foi possível carregar esta parte</h2><p class="sub">${esc(e.message)}</p><button class="btn linha" onclick="location.reload()">Tentar outra vez</button></div>`; }
  subMenu(main);
};

/* ================= Hoje: o que decidir e o que tratar ================= */
const METAS_BASE = { pedidos: 20, resposta: 240, prontos: 60, custo: 15, caixa: 6 };
const TIPO_AVISO = { gdpr: "RGPD", regmeio: "Registos", verif: "Verificação", unver: "Verificação", nocat: "Perfil", notif: "Sistema", req: "Pedido", exp: "Plano", ticket: "Apoio", den: "Denúncia", inv: "Fatura", lead: "Angariação", crm: "Contacto", reg: "Crescimento" };
const VISTA_HOJE_ABAS = VISTAS.hoje;
VISTAS.hoje = async main => {
  if (location.hash.split("/")[1]) return VISTA_HOJE_ABAS(main);
  if (dono() && !C.meio) C.meio = await fn("admin-registos-a-meio", { action: "preview" }).catch(() => ({}));
  const [pros, reqs, conv, def, K, An] = await Promise.all([profissionais(), pedidos().catch(() => []), caixa().catch(() => []), definicoes().catch(() => ({})), contas().catch(() => null), analise(30).catch(() => null)]);
  const [A, segs, tks, ld] = await Promise.all([avisos(), seguimentosPorFazer().catch(() => []), tarefas().catch(() => []), leads().catch(() => [])]);
  const porResponder = conv.filter(c => c.porResponder);
  C.contas = { profissionais: pros.filter(p => !p.verified && !p.suspended).length, mensagens: porResponder.length, angariacao: ld.filter(l => l.next && l.next <= hoje() && !["registado", "perdido"].includes(l.stage)).length };
  desenharNav(C.contas);

  // 1. Decisões: as recomendações da Estratégia, as 3 mais importantes.
  const recs = An ? An.recs.slice().sort((a, b) => a.prioridade - b.prioridade).slice(0, 3) : [];
  // 2. Por tratar: tudo numa lista, o mais urgente primeiro.
  const segHoje = segs.filter(f => f.due <= hoje()), tkHoje = tks.filter(t => t.status !== "done" && t.due_date && t.due_date <= hoje());
  const L = [];
  A.filter(a => !["seg", "task"].includes(a.regra)).forEach(a => L.push({ n: a.nivel === "mau" ? 0 : 1, tipo: TIPO_AVISO[a.regra] || "Aviso", txt: esc(a.texto), acao: `<button class="btn peq linha" data-av-ir="${esc(a.ir)}">Abrir</button><button class="btn peq fantasma" data-av-adiar="${esc(a.chave)}" title="Esconder 7 dias">Adiar</button>` }));
  porResponder.forEach(c => L.push({ n: 1, tipo: "Mensagem", txt: `<b>${esc(c.name)}</b>: “${esc(c.lastMessage || "")}”`, quando: c.lastAt, acao: `<a class="btn peq linha" href="#mensagens/${esc(c.id)}">Responder</a>` }));
  segHoje.forEach(f => L.push({ n: f.due < hoje() ? 0 : 1, tipo: "Seguimento", txt: `${esc(f._a.nome)} · ${esc(SEQ_NOME[f.seq] || "WhatsApp")}`, acao: `<button class="btn peq linha" data-seg="${esc(f.id)}">Enviar</button>` }));
  tkHoje.forEach(t => L.push({ n: t.due_date < hoje() ? 0 : 2, tipo: "Tarefa", txt: esc(t.title) + (t.due_date < hoje() ? ` <small class="nota">atrasada desde ${fdata(t.due_date)}</small>` : ""), acao: `<button class="btn peq linha" data-tk-feita="${esc(t.id)}">Feita</button>` }));
  L.sort((a, b) => a.n - b.n);
  const L0 = L.filter(x => x.n === 0).length;
  // 3. Os 5 números que contam, com meta.
  const M = Object.assign({}, METAS_BASE, def.metas5 || {}), t30 = Date.now() - 30 * DIA;
  const ped30 = reqs.filter(r => new Date(r.created_at) > t30).length;
  const pedAnt = reqs.filter(r => { const d = new Date(r.created_at); return d <= t30 && d > t30 - 30 * DIA; }).length;
  const delta = (a, b) => a === b ? "igual aos 30 dias anteriores" : `${a > b ? "+" : ""}${a - b} face aos 30 dias anteriores`;
  const tempos = pros.map(p => +p.avg_response_minutes).filter(x => x > 0).sort((a, b) => a - b), resp = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null;
  const ativos = pros.filter(p => !p.suspended), prontos = pctDe(ativos.filter(p => p._pontos >= 60).length, ativos.length);
  const mkt = K ? K.L.filter(e => e.type === "despesa" && /marketing|anúnc|anunc/i.test(e.category || "") && new Date(e.date) > t30).reduce((s, e) => s + (+e.amount || 0), 0) : 0;
  const custo = mkt && ped30 ? mkt / ped30 : null;
  const horas = m => m < 60 ? Math.round(m) + " min" : (m / 60).toFixed(m < 600 ? 1 : 0).replace(".", ",") + " h";
  const estado = (v, meta, maior) => v == null ? "" : (maior ? v >= meta : v <= meta) ? "bom" : (maior ? v >= meta / 2 : v <= meta * 2) ? "meio" : "mau";
  const NUM = [
    [num(ped30), "pedidos de clientes (30 dias)", "meta " + M.pedidos, estado(ped30, M.pedidos, true), delta(ped30, pedAnt)],
    [resp == null ? "—" : horas(resp), "até à 1.ª resposta (mediana)", "meta até " + horas(M.resposta), estado(resp, M.resposta, false)],
    [prontos + "%", "perfis prontos (60% ou mais)", "meta " + M.prontos + "%", estado(prontos, M.prontos, true)],
    [custo == null ? "—" : euro(custo), "custo de marketing por pedido", custo == null ? "sem gasto em marketing registado" : "meta até " + euro(M.custo), estado(custo, M.custo, false)],
    [!K ? "—" : K.runway ? K.runway.toFixed(1).replace(".", ",") + " meses" : "sem gasto", "quanto tempo a caixa aguenta", "meta " + M.caixa + " meses ou mais", !K ? "" : K.runway ? estado(K.runway, M.caixa, true) : "bom"]
  ];

  main.innerHTML = topo("Hoje", new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })) + `
    <section class="destaque">${recs.length ? `<p class="destaque-rot">O que mais pesa agora</p><h2>${esc(recs[0].titulo)}</h2><p>É a decisão 1, abaixo. ${L0 ? `Tens também ${L0} coisa(s) urgente(s) por tratar.` : "Não há nada urgente por tratar."}</p>` : `<p class="destaque-rot">Esta semana</p><h2>Nada urgente nos números</h2><p>Continua a trazer profissionais e clientes; os conselhos aparecem aqui quando os números mudarem.</p>`}</section>
    ${recs.length ? `<h2 class="tit-sec">Decisões desta semana</h2>
    <div class="decisoes">${recs.map((r, i) => `<article class="decisao">
      <div class="decisao-cab"><span class="decisao-n">${i + 1}</span><div style="flex:1;min-width:0"><h3>${esc(r.titulo)}</h3><p>${esc(r.situacao)}</p></div><span class="tag ${r.prioridade === 1 ? "vermelho" : r.prioridade === 2 ? "laranja" : ""}">${r.prioridade === 1 ? "Esta semana" : r.prioridade === 2 ? "Este mês" : "Depois"}</span></div>
      <details><summary>Porquê e como fazer</summary><div class="rec-corpo"><h4>O que dizem os estudos</h4><p>${esc(r.estudo)}</p><h4>Passos</h4><ol>${r.passos.map(p => `<li>${esc(p)}</li>`).join("")}</ol><h4>Como saber se resultou</h4><p>${esc(r.medir)}</p></div></details>
      <div class="acoes"><button class="btn peq" data-decidir="${i}">Criar tarefa para esta semana</button><a class="btn peq fantasma" href="#estrategia">Ver os números</a></div></article>`).join("")}</div>` : ""}
    <h2 class="tit-sec">Por tratar <span class="nota">${L.length ? L.length + (L.length === 1 ? " coisa" : " coisas") : ""}</span></h2>
    <div class="cartao" style="padding:4px 16px">${L.length ? `<ul class="tratar">${L.map(x => `<li><span class="tag ${x.n === 0 ? "vermelho" : x.n === 1 ? "laranja" : ""}">${esc(x.tipo)}</span><div class="txt">${x.txt}</div>${x.quando ? `<small class="nota">${ha(x.quando)}</small>` : ""}<div class="acoes">${x.acao}</div></li>`).join("")}</ul>` : '<p class="vazio">Está tudo tratado. Bom momento para trabalhar numa das decisões acima.</p>'}
      <div style="padding:8px 0 10px;border-top:1px solid var(--line)"><button class="btn peq fantasma" id="bRegras">Escolher que avisos aparecem</button></div></div>
    <h2 class="tit-sec">5 números que contam <button class="btn peq fantasma" id="bMetas" style="margin-left:6px">Mudar metas</button></h2>
    <div class="numeros">${NUM.map(([v, t, meta, e, d]) => `<div class="numero ${e}"><strong>${v}</strong><span>${t}</span>${d ? `<div class="delta">${esc(d)}</div>` : ""}<small>${esc(meta)}</small></div>`).join("")}</div>
    ${An ? `<h2 class="tit-sec">Evolução nas últimas 12 semanas</h2>
    <div class="evolucao">${[["Visitantes reais", An.sem], ["Pedidos de clientes", An.semReqs], ["Profissionais novos", An.semPros]].map(([n, s]) => `<div class="cartao"><h3>${n}</h3><strong>${num(s.reduce((x, w) => x + w.n, 0))}</strong>${linha(s.map(w => ({ x: w.desde, y: w.n })), n + " por semana")}</div>`).join("")}</div>` : ""}
    <p class="nota" style="margin-top:8px">Verde: na meta. Laranja: a meio caminho. Vermelho: longe da meta. O detalhe está em Negócio.</p>`;

  main.querySelectorAll("[data-decidir]").forEach(b => b.onclick = async () => {
    const r = recs[+b.dataset.decidir];
    await guardarTarefa({ id: uid(), title: r.titulo, status: "todo", priority: r.prioridade === 1 ? "alta" : "media", due_date: diaMais(7), profile_id: null, created_at: new Date().toISOString() });
    b.textContent = "Tarefa criada"; b.disabled = true; aviso("Tarefa criada em Hoje > Tarefas, para daqui a 7 dias.");
  });
  main.querySelectorAll("[data-av-ir]").forEach(b => b.onclick = () => irPara(b.dataset.avIr));
  main.querySelectorAll("[data-av-adiar]").forEach(b => b.onclick = async () => { await guardarItem("snooze", { key: b.dataset.avAdiar, until: diaMais(7) }); aviso("Adiado por 7 dias."); ir(); });
  main.querySelectorAll("[data-seg]").forEach(b => b.onclick = async () => { await enviarSeguimento(segs.find(f => f.id === b.dataset.seg)); aviso("Seguimento enviado e o próximo marcado."); ir(); });
  main.querySelectorAll("[data-tk-feita]").forEach(b => b.onclick = async () => { const t = tks.find(x => x.id === b.dataset.tkFeita); await guardarTarefa(Object.assign({}, t, { status: "done" })); aviso("Tarefa feita."); ir(); });
  $("#bRegras").onclick = escolherRegras;
  $("#bMetas").onclick = async () => {
    const r = await formulario("Metas dos 5 números", [{ k: "pedidos", label: "Pedidos de clientes em 30 dias", type: "number" }, { k: "resposta", label: "Tempo até à 1.ª resposta (minutos, no máximo)", type: "number" }, { k: "prontos", label: "Perfis prontos (%)", type: "number" }, { k: "custo", label: "Custo de marketing por pedido (€, no máximo)", type: "number" }, { k: "caixa", label: "Meses que a caixa deve aguentar", type: "number" }], M);
    if (r) { await guardarDefinicao("metas5", r); aviso("Metas guardadas."); ir(); }
  };
};
