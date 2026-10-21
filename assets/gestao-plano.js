// Painel de gestão: o resto da Estratégia (fase 4 do painel único).
// Traz do painel antigo Estratégia (objetivos, roadmap, concorrentes,
// decisões), Histórico, Relatórios, Investidores, as metas e a nota global.
// Os dados são os mesmos do antigo: admin_items (okr, backlog, competitor,
// decision, snapshot) e admin_settings (goals, tam).
"use strict";

/* ---- números de base, partilhados por todos os separadores ---- */
async function metricas() {
  const [pros, reqs, convs, avs, lds, K] = await Promise.all([
    profissionais(), pedidos().catch(() => []),
    todas("conversations?select=id,is_flinko,created_at&order=id").catch(() => []),
    todas("reviews?select=id,created_at&order=id").catch(() => todas("reviews?select=id&order=id").catch(() => [])),
    leads().catch(() => []), contas()
  ]);
  await atividade();
  const cli = C.clientes || [], t = Date.now(), ativos = d => pros.concat(cli).filter(p => p._ultimo && t - p._ultimo < d * DIA).length;
  return {
    pros, cli, reqs, conv: convs.filter(c => !c.is_flinko), avs, lds, K,
    verificados: pros.filter(p => p.verified).length, completos: pros.filter(p => p._pontos >= 80).length,
    wau: ativos(7), mau: ativos(30), mrr: K.mrrEst, registados: lds.filter(l => l.stage === "registado").length,
    porResponder: reqs.filter(r => r.status !== "resolved" && !r._propostas).length
  };
}
const pctDe = (a, b) => b ? Math.round(a / b * 100) : 0;
const progresso = (v, cor) => `<div class="progresso ${cor || ""}" role="img" aria-label="${v}%"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></div>`;
const corDe = v => v >= 70 ? "verde" : v >= 30 ? "laranja" : "vermelho";
// Total acumulado em cada um dos últimos `dias` dias, a partir das datas de criação.
function acumulado(datas, dias) {
  const fim = new Date(); fim.setHours(23, 59, 59, 999);
  const ts = datas.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  return Array.from({ length: dias }, (_, i) => { const t = fim.getTime() - (dias - 1 - i) * DIA; let n = 0; while (n < ts.length && ts[n] <= t) n++; return { x: new Date(t).toISOString().slice(0, 10), y: n }; });
}
function linha(serie, nome) {
  if (serie.length < 2) return '<p class="vazio">Ainda não há pontos suficientes para desenhar a linha.</p>';
  const W = 600, H = 160, m = Math.max(1, ...serie.map(s => s.y)), x = i => i / (serie.length - 1) * W, y = v => H - 8 - v / m * (H - 24);
  const pts = serie.map((s, i) => x(i).toFixed(1) + "," + y(s.y).toFixed(1)).join(" ");
  const ult = serie[serie.length - 1];
  return `<svg class="linha" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(nome)}: de ${num(serie[0].y)} a ${num(ult.y)} entre ${fdata(serie[0].x)} e ${fdata(ult.x)}" preserveAspectRatio="none"><polygon points="0,${H} ${pts} ${W},${H}" fill="var(--orange-soft)"/><polyline points="${pts}" fill="none" stroke="var(--orange)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="linha-eixo"><span>${fdata(serie[0].x)}</span><span>${fdata(ult.x)}</span></div>`;
}

/* ---- fotografia diária dos números (para o histórico) ---- */
async function fotografia(M) {
  const S = await itens("snapshot").catch(() => []), td = hoje();
  if (S.some(s => s.date === td)) return;
  await guardarItem("snapshot", { date: td, pros: M.pros.length, clients: M.cli.length, verified: M.verificados, wau: M.wau, mau: M.mau, convs: M.conv.length, requests: M.reqs.length, reviews: M.avs.length, mrr: M.mrr, leads: M.lds.length, score: Math.round(M.pros.reduce((s, p) => s + p._pontos, 0) / (M.pros.length || 1)), cash: M.K.caixa }).catch(() => {});
}

const VISTA_ESTRATEGIA_BASE = VISTAS.estrategia;
VISTAS.estrategia = async main => {
  const aba = location.hash.split("/")[1] || "";
  const ABAS = [["", "Análise"], ["objetivos", "Objetivos"], ["plano", "Plano e decisões"], ["historico", "Histórico"], ["relatorio", "Relatório"], ["investidores", "Investidores"]];
  const tabs = `<div class="tabs" role="tablist" style="flex-wrap:wrap">${ABAS.map(([k, n]) => `<button role="tab" data-est="${k}" aria-selected="${aba === k}">${n}</button>`).join("")}</div>`;
  const ligar = () => main.querySelectorAll("[data-est]").forEach(b => b.onclick = () => { location.hash = "#estrategia" + (b.dataset.est ? "/" + b.dataset.est : ""); });
  const V = { objetivos: vistaObjetivos, plano: vistaPlano, historico: vistaHistorico, relatorio: vistaRelatorio, investidores: vistaInvestidores }[aba];
  if (V) { await V(main, tabs); ligar(); }
  else { await VISTA_ESTRATEGIA_BASE(main); main.querySelector(".topo").insertAdjacentHTML("afterend", tabs); ligar(); }
  metricas().then(fotografia).catch(() => {});
};

/* ---- Objetivos: OKR, metas e nota global ---- */
const METRICAS_KR = [["pros", "Profissionais"], ["clients", "Clientes"], ["verified", "Verificados"], ["reviews", "Avaliações"], ["conv", "Conversas"], ["requests", "Pedidos de clientes"], ["mrr", "Receita mensal em planos (€)"], ["wau", "Contas ativas (7 dias)"], ["leads", "Contactos que se registaram"], ["manual", "Outro (escreves tu o valor)"]];
function valorKr(kr, M) {
  return { pros: M.pros.length, clients: M.cli.length, verified: M.verificados, reviews: M.avs.length, conv: M.conv.length, requests: M.reqs.length, mrr: M.mrr, wau: M.wau, leads: M.registados }[kr.metric] ?? (+kr.manual || 0);
}
const pctOkr = (o, M) => { const k = o.krs || []; return k.length ? Math.round(k.reduce((s, x) => s + Math.min(1, x.target ? valorKr(x, M) / x.target : 0), 0) / k.length * 100) : 0; };
function notas(M, metas) {
  const n = M.pros.length || 1;
  const S = [
    ["Ativação", pctDe(M.completos, n), "profissionais com o perfil a 80% ou mais"],
    ["Retenção", pctDe(M.mau, (M.pros.length + M.cli.length) || 1), "contas que voltaram nos últimos 30 dias"],
    ["Procura", Math.min(100, Math.round(M.cli.length / n * 200)), "1 cliente por cada 2 profissionais conta 100"],
    ["Confiança", pctDe(M.verificados, n), "profissionais verificados"],
    ["Receita", metas.mrr ? Math.min(100, pctDe(M.mrr, metas.mrr)) : 0, metas.mrr ? "receita mensal face à meta" : "define a meta de receita abaixo"],
    ["Operação", Math.max(0, 100 - M.porResponder * 10), "desconta pedidos de clientes sem proposta"]
  ];
  return { S, geral: Math.round(S.reduce((s, x) => s + x[1], 0) / S.length) };
}
async function vistaObjetivos(main, tabs) {
  const [M, O, def] = await Promise.all([metricas(), itens("okr"), definicoes()]);
  const metas = Object.assign({ pros: 0, clients: 0, reviews: 0, mrr: 0 }, def.goals || {}), { S, geral } = notas(M, metas);
  const atual = { pros: M.pros.length, clients: M.cli.length, reviews: M.avs.length, mrr: M.mrr };
  main.innerHTML = topo("Estratégia", "Objetivos do trimestre, metas e como está a empresa.", '<button class="btn laranja" id="novoOkr">Novo objetivo</button>') + tabs + `
    <div class="cartao" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h2>Nota global da empresa</h2><span class="tag ${corDe(geral)}" style="font-size:1rem">${geral}/100</span></div>
      <div class="grelha g3" style="margin-top:10px">${S.map(([n, v, t]) => `<div><div style="display:flex;justify-content:space-between"><span>${n}</span><b>${v}</b></div>${progresso(v, corDe(v))}<small class="nota">${esc(t)}</small></div>`).join("")}</div>
      <p class="nota" style="margin-top:10px">Média de seis notas de 0 a 100. Serve para ver a tendência, não é uma medida oficial.</p></div>
    <div class="grelha g2">
      <div class="cartao"><h2>Objetivos e resultados-chave</h2><p class="sub">Um objetivo diz o que queres; os resultados-chave dizem como sabes que chegaste. Os números atualizam-se sozinhos.</p>
        ${O.length ? O.map(o => { const p = pctOkr(o, M); return `<div class="okr"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>${esc(o.objective)}</b><span class="nota" style="white-space:nowrap">${esc(o.quarter || "")} · <b>${p}%</b></span></div>${progresso(p, corDe(p))}
          <ul class="lista longa">${(o.krs || []).map(k => `<li><div class="info"><b>${esc(k.text)}</b><small>${num(valorKr(k, M))} de ${num(k.target)} · ${pctDe(valorKr(k, M), k.target)}%</small></div><button class="btn peq perigo" data-ap-kr="${esc(o.id)}|${esc(k.id)}" aria-label="Apagar resultado-chave">×</button></li>`).join("")}</ul>
          <div style="display:flex;gap:8px;margin-top:6px"><button class="btn peq linha" data-kr="${esc(o.id)}">Juntar resultado-chave</button><button class="btn peq perigo" data-ap-okr="${esc(o.id)}">Apagar objetivo</button></div></div>`; }).join("")
          : '<p class="vazio">Ainda sem objetivos. Começa por um só para este trimestre, por exemplo "Provar que há clientes em Braga", com 2 ou 3 números para medir.</p>'}</div>
      <div class="cartao"><h2>Metas</h2><p class="sub">Para onde queres levar os números. A meta de receita entra na nota global.</p>
        ${[["pros", "Profissionais"], ["clients", "Clientes"], ["reviews", "Avaliações"], ["mrr", "Receita mensal (€)"]].map(([k, n]) => `<label class="rot" for="meta_${k}">${n} <small class="nota">agora: ${k === "mrr" ? euro(atual[k]) : num(atual[k])}</small></label><input class="campo" id="meta_${k}" type="number" min="0" value="${metas[k] || ""}"/>${metas[k] ? progresso(pctDe(atual[k], metas[k]), corDe(pctDe(atual[k], metas[k]))) : ""}`).join("")}
        <button class="btn peq" id="gMetas" style="margin-top:10px">Guardar metas</button></div>
    </div>`;
  $("#novoOkr").onclick = async () => { const r = await formulario("Novo objetivo", [{ k: "objective", label: "Objetivo", req: 1, ph: "Provar que há clientes em Braga" }, { k: "quarter", label: "Período", def: "T" + (Math.floor(new Date().getMonth() / 3) + 1) + " " + new Date().getFullYear() }]); if (r) { r.krs = []; await guardarItem("okr", r); aviso("Objetivo criado."); ir(); } };
  main.querySelectorAll("[data-kr]").forEach(b => b.onclick = async () => {
    const o = O.find(x => x.id === b.dataset.kr);
    const r = await formulario("Novo resultado-chave", [{ k: "text", label: "Resultado-chave", req: 1, ph: "Chegar a 50 clientes" }, { k: "metric", label: "Número que mede", type: "select", opts: METRICAS_KR }, { k: "target", label: "Meta", type: "number", req: 1 }, { k: "manual", label: "Valor atual (só para \"Outro\")", type: "number" }]);
    if (r) { r.id = uid(); await guardarItem("okr", Object.assign({}, o, { krs: (o.krs || []).concat([r]) })); aviso("Resultado-chave juntado."); ir(); }
  });
  main.querySelectorAll("[data-ap-kr]").forEach(b => b.onclick = async () => { const [oid, kid] = b.dataset.apKr.split("|"), o = O.find(x => x.id === oid); await guardarItem("okr", Object.assign({}, o, { krs: (o.krs || []).filter(k => k.id !== kid) })); ir(); });
  main.querySelectorAll("[data-ap-okr]").forEach(b => b.onclick = () => apagarItem("okr", b.dataset.apOkr, "Apagar este objetivo e os seus resultados-chave?"));
  $("#gMetas").onclick = async () => { const g = {}; ["pros", "clients", "reviews", "mrr"].forEach(k => g[k] = Number($("#meta_" + k).value) || 0); await guardarDefinicao("goals", g); aviso("Metas guardadas."); ir(); };
}
async function apagarItem(kind, id, pergunta) {
  if (!confirm(pergunta)) return;
  await api("admin_items?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (C.itens) C.itens[kind] = null;
  aviso("Apagado."); ir();
}

/* ---- Plano e decisões: roadmap, concorrentes e registo de decisões ---- */
const ESTADOS_RM = [["ideia", "Ideia"], ["planeado", "Planeado"], ["curso", "Em curso"], ["feito", "Feito"]];
const SUGESTOES_RM = [
  ["Pedir avaliações depois de cada trabalho", "Sem avaliações, os clientes não confiam. É o que mais pesa na escolha.", 5, 2],
  ["Página por ofício e cidade (ex.: eletricistas em Braga)", "Traz pesquisas do Google de quem já precisa de alguém.", 4, 3],
  ["Aviso ao profissional quando um pedido da sua zona chega", "Resposta rápida é o que transforma um pedido em trabalho.", 5, 3],
  ["Programa de indicação de profissionais", "Cada profissional conhece outros; é a angariação mais barata.", 3, 2]
];
const CAMPOS_RM = [{ k: "title", label: "Ideia ou funcionalidade", req: 1 }, { k: "why", label: "Porquê", type: "textarea" }, { k: "impact", label: "Impacto (1 a 5)", type: "number", def: 3 }, { k: "effort", label: "Esforço (1 a 5)", type: "number", def: 3 }, { k: "status", label: "Estado", type: "select", opts: ESTADOS_RM }];
const CAMPOS_CONC = [{ k: "name", label: "Concorrente", req: 1, ph: "Zaask, Fixando, OLX" }, { k: "url", label: "Site" }, { k: "pricing", label: "Como cobram", ph: "comissão, pedidos pagos, assinatura" }, { k: "strengths", label: "Pontos fortes", type: "textarea" }, { k: "weaknesses", label: "Pontos fracos", type: "textarea" }];
const CAMPOS_DEC = [{ k: "date", label: "Data", type: "date", def: hoje() }, { k: "title", label: "Decisão", req: 1 }, { k: "why", label: "Porquê (o contexto e o que ficou de fora)", type: "textarea" }, { k: "review", label: "Rever em", type: "date" }];
async function vistaPlano(main, tabs) {
  const [B0, Cc, D0] = await Promise.all([itens("backlog"), itens("competitor"), itens("decision")]);
  const B = B0.map(b => Object.assign({ _v: +b.effort ? +b.impact / +b.effort : 0 }, b)).sort((a, b) => (a.status === "feito") - (b.status === "feito") || b._v - a._v);
  const D = D0.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), td = hoje();
  const sug = SUGESTOES_RM.map((s, i) => [s, i]).filter(([s]) => !B0.some(b => b.title === s[0]));
  main.innerHTML = topo("Estratégia", "O que vais construir, por que ordem, e as decisões que tomaste.") + tabs + `
    <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Plano de produto</h2><button class="btn peq laranja" id="novoRm">Nova ideia</button></div>
      <p class="sub">Ordenado por valor: impacto a dividir pelo esforço. O que está no topo é o que rende mais pelo trabalho que dá.</p>
      ${B.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Ideia</th><th>Impacto</th><th>Esforço</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody>${B.map(b => `<tr><td><b>${esc(b.title)}</b>${b.why ? `<br/><small class="nota">${esc(b.why)}</small>` : ""}</td><td>${num(b.impact)}</td><td>${num(b.effort)}</td><td><b>${b._v.toFixed(1)}</b></td>
        <td><select class="campo" style="width:auto" data-est-rm="${esc(b.id)}" aria-label="Estado">${ESTADOS_RM.map(([k, n]) => `<option value="${k}"${b.status === k ? " selected" : ""}>${n}</option>`).join("")}</select></td>
        <td style="white-space:nowrap"><button class="btn peq linha" data-ed-rm="${esc(b.id)}">Editar</button> <button class="btn peq perigo" data-ap-rm="${esc(b.id)}" aria-label="Apagar">×</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Ainda sem ideias no plano. Junta uma das sugestões abaixo ou escreve a tua.</p>'}
      ${sug.length ? `<h4 class="mini" style="margin-top:14px">Sugestões para começar</h4><ul class="lista longa">${sug.map(([s, i]) => `<li><div class="info"><b>${esc(s[0])}</b><small style="white-space:normal">${esc(s[1])}</small></div><button class="btn peq linha" data-sug-rm="${i}">Juntar</button></li>`).join("")}</ul>` : ""}</div>
    <div class="grelha g2" style="margin-top:16px">
      <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Registo de decisões</h2><button class="btn peq laranja" id="novaDec">Nova decisão</button></div>
        <p class="sub">O que decidiste e porquê. Daqui a 6 meses vais querer saber.</p>
        ${D.length ? `<ul class="lista longa">${D.map(d => `<li><div class="info"><b>${esc(d.title)}</b><small style="white-space:normal">${fdata(d.date)}${d.why ? " · " + esc(d.why) : ""}</small>${d.review ? `<small class="${d.review <= td ? "tag vermelho" : "nota"}" style="margin-top:4px;display:inline-block">rever em ${fdata(d.review)}</small>` : ""}</div><button class="btn peq perigo" data-ap-dec="${esc(d.id)}" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Ainda sem decisões registadas. A próxima vez que escolheres um preço, uma zona ou um canal, escreve-a aqui com o motivo.</p>'}</div>
      <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Concorrentes que acompanhas</h2><button class="btn peq laranja" id="novoConc">Juntar</button></div>
        <p class="sub">As tuas notas. A comparação geral está no separador Análise.</p>
        ${Cc.length ? `<ul class="lista longa">${Cc.map(c => `<li style="flex-wrap:wrap"><div class="info" style="min-width:200px"><b>${esc(c.name)}</b><small style="white-space:normal">Cobram: ${esc(c.pricing || "não sabes")}${c.strengths ? "<br/>Fortes: " + esc(c.strengths) : ""}${c.weaknesses ? "<br/>Fracos: " + esc(c.weaknesses) : ""}</small></div><button class="btn peq linha" data-ed-conc="${esc(c.id)}">Editar</button><button class="btn peq perigo" data-ap-conc="${esc(c.id)}" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Junta 3 a 5 concorrentes e como cobram. É isso que define o teu preço.</p>'}</div>
    </div>`;
  $("#novoRm").onclick = async () => { const r = await formulario("Nova ideia", CAMPOS_RM, { status: "ideia" }); if (r) { await guardarItem("backlog", r); aviso("Ideia juntada."); ir(); } };
  main.querySelectorAll("[data-sug-rm]").forEach(b => b.onclick = async () => { const s = SUGESTOES_RM[+b.dataset.sugRm]; await guardarItem("backlog", { title: s[0], why: s[1], impact: s[2], effort: s[3], status: "ideia" }); ir(); });
  main.querySelectorAll("[data-ed-rm]").forEach(b => b.onclick = async () => { const x = B0.find(y => y.id === b.dataset.edRm), r = await formulario("Editar ideia", CAMPOS_RM, x); if (r) { await guardarItem("backlog", Object.assign({}, x, r)); ir(); } });
  main.querySelectorAll("[data-est-rm]").forEach(s => s.onchange = async () => { const x = B0.find(y => y.id === s.dataset.estRm); await guardarItem("backlog", Object.assign({}, x, { status: s.value })); aviso("Estado atualizado."); });
  main.querySelectorAll("[data-ap-rm]").forEach(b => b.onclick = () => apagarItem("backlog", b.dataset.apRm, "Apagar esta ideia?"));
  $("#novaDec").onclick = async () => { const r = await formulario("Nova decisão", CAMPOS_DEC); if (r) { await guardarItem("decision", r); aviso("Decisão registada."); ir(); } };
  main.querySelectorAll("[data-ap-dec]").forEach(b => b.onclick = () => apagarItem("decision", b.dataset.apDec, "Apagar esta decisão?"));
  $("#novoConc").onclick = async () => { const r = await formulario("Novo concorrente", CAMPOS_CONC); if (r) { await guardarItem("competitor", r); ir(); } };
  main.querySelectorAll("[data-ed-conc]").forEach(b => b.onclick = async () => { const x = Cc.find(y => y.id === b.dataset.edConc), r = await formulario("Editar concorrente", CAMPOS_CONC, x); if (r) { await guardarItem("competitor", Object.assign({}, x, r)); ir(); } });
  main.querySelectorAll("[data-ap-conc]").forEach(b => b.onclick = () => apagarItem("competitor", b.dataset.apConc, "Apagar este concorrente?"));
}

/* ---- Histórico ---- */
let hMetrica = "pros", hDias = 90;
const FOTOS = { wau: "Contas ativas (7 dias)", mau: "Contas ativas (30 dias)", mrr: "Receita mensal em planos (€)", leads: "Contactos de angariação", score: "Qualidade média dos perfis", cash: "Caixa (€)" };
async function vistaHistorico(main, tabs) {
  const [M, S0] = await Promise.all([metricas(), itens("snapshot")]);
  const S = S0.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const DATAS = { pros: ["Profissionais", M.pros], clients: ["Clientes", M.cli], conv: ["Conversas", M.conv], requests: ["Pedidos de clientes", M.reqs], reviews: ["Avaliações", M.avs.filter(a => a.created_at)] };
  const d = DATAS[hMetrica];
  const grafico = d ? linha(acumulado(d[1].map(x => x.created_at), hDias), d[0])
    : S.length >= 2 ? linha(S.map(s => ({ x: s.date, y: +s[hMetrica] || 0 })), FOTOS[hMetrica])
    : `<p class="vazio">Só há ${S.length} fotografia(s) diária(s). O painel guarda os números de cada dia em que abres a Estratégia; amanhã já aparece a linha.</p>`;
  const linhaTab = ([k, [nome, arr]]) => { const s = acumulado(arr.map(x => x.created_at), 31), n = s[30].y, w = s[23].y, m = s[0].y, v = (a, b) => `<span class="var ${a - b > 0 ? "sobe" : a - b < 0 ? "desce" : ""}">${a - b >= 0 ? "+" : ""}${a - b}${b ? " (" + pctDe(a - b, b) + "%)" : ""}</span>`; return `<tr><th scope="row">${nome}</th><td><b>${num(n)}</b></td><td>${num(w)}</td><td>${num(m)}</td><td>${v(n, w)}</td><td>${v(n, m)}</td></tr>`; };
  main.innerHTML = topo("Estratégia", "Como os números evoluíram ao longo do tempo.") + tabs + `
    <div class="cartao"><h2>Evolução</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 14px"><select class="campo" style="width:auto" id="hMet" aria-label="Número"><optgroup label="Desde o início (pelas datas de criação)">${Object.entries(DATAS).map(([k, v]) => `<option value="${k}"${hMetrica === k ? " selected" : ""}>${v[0]}</option>`).join("")}</optgroup><optgroup label="Fotografias diárias">${Object.entries(FOTOS).map(([k, v]) => `<option value="${k}"${hMetrica === k ? " selected" : ""}>${v}</option>`).join("")}</optgroup></select>
        ${d ? `<select class="campo" style="width:auto" id="hDias" aria-label="Período">${[30, 90, 180, 365].map(n => `<option value="${n}"${hDias === n ? " selected" : ""}>${n} dias</option>`).join("")}</select>` : ""}</div>
      ${grafico}</div>
    <div class="cartao" style="margin-top:16px"><h2>Crescimento</h2><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Número</th><th>Hoje</th><th>Há 7 dias</th><th>Há 30 dias</th><th>Em 7 dias</th><th>Em 30 dias</th></tr></thead><tbody>${Object.entries(DATAS).map(linhaTab).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:8px">Os totais do passado são refeitos a partir da data de criação de cada registo. Contas apagadas entretanto não contam.</p></div>`;
  $("#hMet").onchange = e => { hMetrica = e.target.value; ir(); };
  if ($("#hDias")) $("#hDias").onchange = e => { hDias = +e.target.value; ir(); };
}

/* ---- Relatório (para copiar, enviar a sócios ou guardar em PDF) ---- */
let rDias = 7;
async function textoRelatorio(dias) {
  const M = await metricas(), [R, T] = await Promise.all([itens("risk").catch(() => []), tarefas().catch(() => [])]);
  const t = Date.now(), a = t - dias * DIA, b = t - 2 * dias * DIA;
  const entre = (arr, x, y) => arr.filter(r => { const q = new Date(r.created_at).getTime(); return q >= x && q < y; }).length;
  const comp = (c, p) => `${c} (${c - p >= 0 ? "+" : ""}${c - p} face ao período anterior)`;
  const np = entre(M.pros, a, t + DIA), npp = entre(M.pros, b, a), nc = entre(M.cli, a, t + DIA), ncp = entre(M.cli, b, a);
  const cv = entre(M.conv, a, t + DIA), cvp = entre(M.conv, b, a), rq = entre(M.reqs, a, t + DIA), rqp = entre(M.reqs, b, a);
  const L = M.K.L.filter(e => new Date(e.date).getTime() >= a), rec = L.filter(e => e.type === "receita").reduce((s, e) => s + (+e.amount || 0), 0), desp = L.filter(e => e.type === "despesa").reduce((s, e) => s + (+e.amount || 0), 0);
  const atrasadas = T.filter(x => x.status !== "done" && x.due_date && x.due_date < hoje()).length, bom = [], mau = [];
  if (np > npp) bom.push(`Mais registos de profissionais: ${np} (antes ${npp})`); else if (np < npp) mau.push(`Menos registos de profissionais: ${np} (antes ${npp})`);
  if (nc) bom.push(`${nc} cliente(s) novo(s)`); else mau.push("Nenhum cliente novo");
  if (cv) bom.push(`${cv} conversa(s) nova(s) entre clientes e profissionais`); else mau.push("Nenhuma conversa nova entre clientes e profissionais");
  if (M.porResponder) mau.push(`${M.porResponder} pedido(s) de clientes sem nenhuma proposta`);
  if (atrasadas) mau.push(`${atrasadas} tarefa(s) atrasada(s)`);
  if (M.K.runway && M.K.runway < 6) mau.push(`A caixa aguenta ${M.K.runway.toFixed(1)} meses`);
  const riscos = R.map(r => [(+r.prob || 0) * (+r.impact || 0), r.title]).sort((x, y) => y[0] - x[0]).slice(0, 3);
  return `RELATÓRIO FLINKO · últimos ${dias} dias · ${new Date().toLocaleDateString("pt-PT")}

O QUE CORREU BEM
${bom.map(x => "+ " + x).join("\n") || "(nada a destacar)"}

A QUE PRESTAR ATENÇÃO
${mau.map(x => "- " + x).join("\n") || "(nada)"}

NÚMEROS
Profissionais registados: ${comp(np, npp)} · total ${M.pros.length}
Clientes registados: ${comp(nc, ncp)} · total ${M.cli.length}
Conversas novas: ${comp(cv, cvp)}
Pedidos de clientes: ${comp(rq, rqp)}
Contas ativas: ${M.wau} nos últimos 7 dias · ${M.mau} nos últimos 30
Profissionais verificados: ${M.verificados} de ${M.pros.length} · com o perfil a 80% ou mais: ${M.completos}
Avaliações: ${M.avs.length}

ANGARIAÇÃO
Contactos na lista: ${M.lds.length} · registaram-se: ${M.registados}

DINHEIRO
Receita mensal em planos (estimativa): ${euro(M.mrr)}
Receitas registadas no período: ${euro(rec)} · despesas: ${euro(desp)}
Caixa: ${euro(M.K.caixa)}${M.K.runway ? " · aguenta " + M.K.runway.toFixed(1) + " meses" : ""}

MAIORES RISCOS
${riscos.map(r => `- ${r[1]} (pontuação ${r[0]})`).join("\n") || "(ainda sem riscos registados em Empresa > Conformidade e riscos)"}
`;
}
async function vistaRelatorio(main, tabs) {
  const txt = await textoRelatorio(rDias);
  main.innerHTML = topo("Estratégia", "Um resumo pronto para copiar, enviar a sócios ou guardar em PDF.") + tabs + `
    <div class="chips no-print" role="group" aria-label="Período">${[7, 30, 90].map(d => `<button type="button" data-rd="${d}" aria-pressed="${rDias === d}">${d} dias</button>`).join("")}</div>
    <div class="cartao"><pre class="relatorio" id="relTxt">${esc(txt)}</pre>
      <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn laranja" id="cRel">Copiar texto</button><button class="btn linha" id="pRel">Imprimir ou guardar PDF</button></div></div>`;
  main.querySelectorAll("[data-rd]").forEach(b => b.onclick = () => { rDias = +b.dataset.rd; ir(); });
  $("#cRel").onclick = () => navigator.clipboard.writeText(txt).then(() => aviso("Relatório copiado."), () => aviso("Não deu para copiar. Seleciona o texto e copia à mão.", true));
  $("#pRel").onclick = () => window.print();
}

/* ---- Investidores ---- */
async function vistaInvestidores(main, tabs) {
  const [M, def] = await Promise.all([metricas(), definicoes()]);
  const T = Object.assign({ n: 0, arpu: 0, sam: 0, som: 0 }, def.tam || {}), tam = T.n * T.arpu * 12, sam = tam * T.sam / 100, som = sam * T.som / 100;
  const g = acumulado(M.pros.map(p => p.created_at), 31), cresc = g[0].y ? pctDe(g[30].y - g[0].y, g[0].y) : 0, fixo = pctDe(M.wau, M.mau);
  const resumo = `FLINKO · RESUMO DE NÚMEROS · ${new Date().toLocaleDateString("pt-PT")}
Profissionais: ${M.pros.length} (${M.verificados} verificados) · Clientes: ${M.cli.length}
Crescimento de profissionais em 30 dias: ${cresc}%
Contas ativas: ${M.wau} em 7 dias · ${M.mau} em 30 dias (${fixo}% voltam todas as semanas)
Perfis com 80% ou mais: ${M.completos} de ${M.pros.length}
Conversas: ${M.conv.length} · Pedidos: ${M.reqs.length} · Avaliações: ${M.avs.length}
Receita mensal em planos: ${euro(M.mrr)} · por ano: ${euro(M.mrr * 12)}
Caixa: ${euro(M.K.caixa)}${M.K.runway ? " · aguenta " + M.K.runway.toFixed(1) + " meses" : ""}
Custo por profissional novo: ${M.K.novos90 ? euro(M.K.cac) : "sem dados"}`;
  const kpi = (v, t, s) => `<div class="cartao kpi"><strong>${v}</strong><span>${t}</span>${s ? `<div class="nota">${s}</div>` : ""}</div>`;
  main.innerHTML = topo("Estratégia", "Os números que um investidor ou parceiro te vai pedir.") + tabs + `
    <div class="grelha g4">
      ${kpi(cresc + "%", "crescimento de profissionais", "últimos 30 dias")}
      ${kpi(fixo + "%", "voltam todas as semanas", "ativos em 7 dias a dividir pelos de 30")}
      ${kpi(euro(M.mrr * 12), "receita por ano ao ritmo atual", "receita mensal " + euro(M.mrr))}
      ${kpi(M.K.runway ? M.K.runway.toFixed(1) + " meses" : "sem risco", "quanto tempo a caixa aguenta", "caixa " + euro(M.K.caixa))}
      ${kpi(num(M.verificados), "profissionais verificados", pctDe(M.verificados, M.pros.length) + "% do total")}
      ${kpi(num(M.reqs.length) + " / " + num(M.conv.length), "pedidos e conversas", "a prova de que há procura")}
      ${kpi(M.K.novos90 ? euro(M.K.cac) : "—", "custo por profissional novo", "marketing de 90 dias a dividir pelos novos")}
      ${kpi(num(M.avs.length), "avaliações", "a prova social")}
    </div>
    <div class="grelha g2" style="margin-top:16px">
      <div class="cartao"><h2>Tamanho do mercado</h2><p class="sub">Usa números de fontes que consigas mostrar (INE, associações do setor). Um investidor vai perguntar de onde vêm.</p>
        <label class="rot" for="t_n">Profissionais no mercado (Portugal)</label><input class="campo" id="t_n" type="number" min="0" value="${T.n || ""}"/>
        <label class="rot" for="t_arpu">Quanto pagaria cada um por mês (€)</label><input class="campo" id="t_arpu" type="number" min="0" step="0.01" value="${T.arpu || ""}"/>
        <label class="rot" for="t_sam">Parte que consegues servir (%)</label><input class="campo" id="t_sam" type="number" min="0" max="100" value="${T.sam || ""}"/>
        <label class="rot" for="t_som">Parte que consegues ganhar em 3 anos (%)</label><input class="campo" id="t_som" type="number" min="0" max="100" value="${T.som || ""}"/>
        <button class="btn peq" id="gTam" style="margin-top:10px">Guardar</button>
        <div class="grelha g3" style="margin-top:14px">${kpi(euro(tam), "mercado total por ano")}${kpi(euro(sam), "o que consegues servir")}${kpi(euro(som), "o que podes ganhar")}</div></div>
      <div class="cartao"><h2>Resumo para enviar</h2><pre class="relatorio" id="invTxt">${esc(resumo)}</pre><button class="btn laranja" id="cInv" style="margin-top:12px">Copiar</button></div>
    </div>`;
  $("#gTam").onclick = async () => { const v = {}; ["n", "arpu", "sam", "som"].forEach(k => v[k] = Number($("#t_" + k).value) || 0); await guardarDefinicao("tam", v); aviso("Guardado."); ir(); };
  $("#cInv").onclick = () => navigator.clipboard.writeText(resumo).then(() => aviso("Resumo copiado."), () => aviso("Não deu para copiar. Seleciona o texto e copia à mão.", true));
}
