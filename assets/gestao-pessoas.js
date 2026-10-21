// Painel de gestão: Profissionais e Clientes completos (fase 2 do painel único).
// Traz do painel antigo: atividade (quem está em risco ou nunca voltou), contas
// suspeitas, Excel (CSV), consentimento para promoções, tarefas por pessoa,
// seguimento "completar perfil", pagamentos e reembolsos, histórico de ações,
// e a ficha do cliente.
"use strict";

/* ---- atividade e contas suspeitas ---- */
async function atividade() {
  if (C.ativ) return C.ativ;
  const [pros, linhas] = await Promise.all([profissionais(), todas("rpc/admin_visit_rows?p_days=400&order=day,visitor_id").catch(() => [])]);
  const ult = {};
  linhas.forEach(v => { if (v.user_id) { const t = new Date(v.last_at || v.day).getTime(); if (!ult[v.user_id] || t > ult[v.user_id].t) ult[v.user_id] = { t, n: 0 }; ult[v.user_id].n = (ult[v.user_id].n || 0) + 1; } });
  const d9 = s => String(s || "").replace(/\D/g, "").slice(-9);
  const rep = {}; pros.forEach(p => { const k = d9(p._tel); if (k.length === 9) rep[k] = (rep[k] || 0) + 1; });
  const agora = Date.now();
  pros.forEach(p => {
    const criado = new Date(p.created_at).getTime(), u = ult[p.id];
    p._ultimo = u ? u.t : null;
    p._nuncaVoltou = agora - criado > 3 * DIA && (!u || u.t - criado < DIA);
    p._emRisco = !!u && agora - u.t > 14 * DIA && agora - u.t <= 30 * DIA;
    p._parado = !!u && agora - u.t > 30 * DIA;
    const why = [], dias = Math.floor((agora - criado) / DIA);
    if (/^(test|teste|asd|xxx|demo|aaa)/i.test(String(p.name || "").trim()) || String(p.name || "").trim().length < 3) why.push("nome suspeito");
    if (rep[d9(p._tel)] > 1) why.push("telemóvel repetido noutra conta");
    if (!p.category && !p.bio && !p.photo_url && dias > 14) why.push(`conta vazia há ${dias} dias`);
    if (p.verified && p._pontos < 40) why.push("verificado com o perfil muito incompleto");
    p._suspeito = why;
  });
  (C.clientes || []).forEach(c => { const u = ult[c.id]; c._ultimo = u ? u.t : null; });
  C.ativ = true;
  return true;
}
// Grupos novos na lista de Profissionais (o painel antigo tinha-os em "Retenção" e "Qualidade").
GRUPOS.push(["risco", "Em risco (14 a 30 dias sem entrar)", p => !p.suspended && p._emRisco]);
GRUPOS.push(["nuncavoltou", "Nunca voltaram", p => !p.suspended && p._nuncaVoltou]);
GRUPOS.push(["suspeitos", "Contas suspeitas", p => (p._suspeito || []).length > 0]);

const VISTA_PROS_BASE = VISTAS.profissionais;
VISTAS.profissionais = async main => {
  await atividade();
  await VISTA_PROS_BASE(main);
  const t = main.querySelector(".topo");
  t.insertAdjacentHTML("beforeend", '<button class="btn linha" id="bCsv">Exportar para Excel</button>');
  $("#bCsv").onclick = exportarPros;
};
function csv(nomeFicheiro, linhas) {
  const txt = "﻿" + linhas.map(r => r.map(c => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv" })); a.download = nomeFicheiro; document.body.appendChild(a); a.click(); a.remove();
}
function exportarPros() {
  const g = GRUPOS.find(x => x[0] === filtroPros.grupo) || GRUPOS[0];
  const L = (C.pros || []).filter(g[2]);
  csv("flinko-profissionais-" + hoje() + ".csv", [["Nome", "Ofício", "Zona", "Telemóvel", "Plano", "Verificado", "Perfil %", "Falta", "Conversas", "Estado (notas)", "Última visita", "Conta criada"]]
    .concat(L.map(p => [p.name, p.category, p.location, p._tel, p.plan || "free", p.verified ? "sim" : "não", p._pontos, (p._falta || []).join(", "), p._conversas, ETAPAS[(C.crm[p.id] || {}).stage || "novo"], p._ultimo ? fdata(p._ultimo) : "nunca", fdata(p.created_at)])));
  aviso("Ficheiro descarregado (" + L.length + " profissionais).");
}

/* ---- ficha do profissional: secções novas ---- */
async function auditoria() {
  if (C.audit) return C.audit;
  C.audit = await api("admin_audit?select=id,at,actor_email,action,target_type,target_id,summary&order=at.desc&limit=500").catch(() => []);
  return C.audit;
}
async function consentimentoDe(id) {
  const cs = (await itens("consent")).filter(c => c.ref === id).sort((a, b) => String(b.date + (b.at || "")).localeCompare(String(a.date + (a.at || ""))));
  return cs[0] || null;
}
const FICHA_BASE = fichaPro;
fichaPro = async function (id) {
  await FICHA_BASE(id);
  await atividade();
  const p = (C.pros || []).find(x => x.id === id); if (!p) return;
  const painel = $("#ficha .painel"); if (!painel) return;
  const [cons, tks, aud] = await Promise.all([consentimentoDe(id), tarefas(), auditoria()]);
  const minhas = tks.filter(t => t.profile_id === id && t.status !== "done");
  const hist = aud.filter(r => r.target_id === id).slice(0, 8);
  const wa = window.flinkoWhatsApp && flinkoWhatsApp.numero(p._tel);
  const estadoAtiv = p._nuncaVoltou ? '<span class="tag vermelho">Nunca voltou depois de criar conta</span>' : p._parado ? '<span class="tag vermelho">Parado há mais de 30 dias</span>' : p._emRisco ? '<span class="tag laranja">Em risco (14 a 30 dias sem entrar)</span>' : p._ultimo ? '<span class="tag verde">Ativo</span>' : "";
  painel.insertAdjacentHTML("beforeend", `
    <div class="seccao"><h3>Atividade</h3><p>Última vez no site: <b>${p._ultimo ? ha(p._ultimo) : "sem registo"}</b> ${estadoAtiv}</p>
      ${(p._suspeito || []).length ? `<p class="nota" style="color:var(--red)">Atenção: ${esc(p._suspeito.join(", "))}.</p>` : ""}
      ${wa ? `<button class="btn peq verde" id="fSeqD2" style="margin-top:8px">WhatsApp "completar o perfil" + seguimento em 4 dias</button>` : ""}</div>
    <div class="seccao"><h3>Tarefas</h3>${minhas.length ? `<ul class="lista">${minhas.map(t => `<li><div class="info"><b style="white-space:normal">${esc(t.title)}</b><small>${t.due_date ? fdata(t.due_date) : "sem data"}</small></div></li>`).join("")}</ul>` : '<p class="nota">Sem tarefas abertas.</p>'}
      <button class="btn peq linha" id="fNovaTarefa" style="margin-top:8px">Nova tarefa para esta pessoa</button></div>
    <div class="seccao"><h3>Consentimento para promoções</h3>
      <p>${cons ? `<span class="tag ${cons.status === "dado" ? "verde" : "vermelho"}">${cons.status === "dado" ? "Consentiu" : "Recusou ou retirou"}</span> ${fdata(cons.date)} · ${esc(cons.channel || "")}${cons.source ? " · " + esc(cons.source) : ""}` : "Sem registo. Sem consentimento, não lhe envies promoções (planos pagos, campanhas)."}</p>
      <div class="acoes" style="margin-top:8px"><button class="btn peq linha" data-cons="dado">Registar consentimento</button><button class="btn peq linha" data-cons="retirado">Registar recusa</button></div></div>
    ${dono() ? `<div class="seccao"><h3>Pagamentos</h3><p class="nota">Plano ${esc(p.plan || "free")}${p.plan_expires_at ? " · expira " + fdata(p.plan_expires_at) : ""}${p.stripe_subscription_id ? " · com assinatura Stripe ativa" : ""}.</p><button class="btn peq linha" id="fPagamentos" style="margin-top:8px">Ver pagamentos e reembolsos</button><div id="fCobrancas" style="margin-top:10px"></div></div>` : ""}
    <div class="seccao"><h3>Histórico de ações</h3>${hist.length ? `<ul class="lista">${hist.map(r => `<li><div class="info"><b style="white-space:normal">${esc(r.summary || r.action)}</b><small>${new Date(r.at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })} · ${esc(r.actor_email || "sistema")}</small></div></li>`).join("")}</ul>` : '<p class="nota">Sem ações registadas.</p>'}</div>`);
  const sq = $("#fSeqD2");
  if (sq) sq.onclick = async () => {
    window.open(flinkoWhatsApp.link(p._tel, preencher(MODELOS.find(m => m.id === "completar").texto, p)), "_blank", "noopener");
    await comecarSequencia("pro", id, "d2");
    await guardarCrm(id, { stage: "contactado", next_contact: diaMais(4) });
    aviso("Mensagem aberta no WhatsApp e seguimento marcado para daqui a 4 dias.");
  };
  $("#fNovaTarefa").onclick = async () => {
    const t = (prompt("Tarefa para " + p.name + ":") || "").trim(); if (!t) return;
    await guardarTarefa({ id: uid(), title: t, status: "todo", priority: "media", due_date: null, profile_id: id, created_at: new Date().toISOString() });
    aviso("Tarefa criada."); fichaPro(id);
  };
  painel.querySelectorAll("[data-cons]").forEach(b => b.onclick = async () => {
    const canal = (prompt("Por que canal? (WhatsApp, Email, Telefone, Todos)", "WhatsApp") || "").trim(); if (!canal) return;
    const origem = (prompt("Como foi dado ou recusado? (ex.: respondeu SIM no WhatsApp)", "") || "").trim();
    await guardarItem("consent", { ref: id, name: p.name, status: b.dataset.cons, channel: canal, date: hoje(), source: origem, at: new Date().toISOString(), by: (session.user && session.user.email) || "" });
    aviso("Registado."); fichaPro(id);
  });
  const pg = $("#fPagamentos");
  if (pg) pg.onclick = () => mostrarCobrancas(p);
};
const euros = (c, moeda) => ((c || 0) / 100).toLocaleString("pt-PT", { style: "currency", currency: (moeda || "eur").toUpperCase() });
async function mostrarCobrancas(p) {
  const box = $("#fCobrancas"); box.innerHTML = '<p class="nota">A ler a Stripe…</p>';
  try {
    const c = (await fn("admin-refund", { action: "list", targetProfileId: p.id })).charges || [];
    box.innerHTML = c.length ? `<ul class="lista">${c.map(x => { const resta = (x.amount || 0) - (x.amount_refunded || 0); return `<li><div class="info"><b>${euros(x.amount, x.currency)} · ${fdata((x.created || 0) * 1000)}</b><small>${x.amount_refunded ? "reembolsado " + euros(x.amount_refunded, x.currency) : x.paid ? "pago" : "não pago"}</small></div>${x.paid && resta > 0 ? `<button class="btn peq perigo" data-reemb="${esc(x.id)}" data-max="${resta}" data-moeda="${esc(x.currency || "eur")}">Reembolsar</button>` : ""}</li>`; }).join("")}</ul>` : '<p class="nota">Sem pagamentos na Stripe.</p>';
    box.querySelectorAll("[data-reemb]").forEach(b => b.onclick = async () => {
      const max = Number(b.dataset.max);
      const v = prompt(`Quanto devolver em euros? (vazio = tudo, máximo ${(max / 100).toFixed(2)})`, ""); if (v == null) return;
      const cent = v.trim() ? Math.round(parseFloat(v.replace(",", ".")) * 100) : undefined;
      if (cent !== undefined && (!(cent > 0) || cent > max)) return aviso("Valor inválido.", true);
      if (!confirm(`Devolver ${euros(cent || max, b.dataset.moeda)} a ${p.name}? O dinheiro sai da conta Stripe e não dá para desfazer.`)) return;
      await fn("admin-refund", { action: "refund", targetProfileId: p.id, chargeId: b.dataset.reemb, amount: cent, reason: "requested_by_customer" });
      aviso("Reembolso feito."); mostrarCobrancas(p);
    });
  } catch (e) { box.innerHTML = `<p class="nota" style="color:var(--red)">Não consegui ler a Stripe: ${esc(e.message)}</p>`; }
}

/* ---- Clientes e pedidos: separadores e ficha do cliente ---- */
const FILTROS_CLI = [["todos", "Todos", () => true], ["compedido", "Com pedidos", c => c._pedidos > 0], ["parados", "Sem atividade", c => !c._pedidos && !c._conversas], ["suspensos", "Suspensos", c => !!c.suspended]];
let filtroCli = { f: "todos", q: "" };
const VISTA_CLI_BASE = VISTAS.clientes;
VISTAS.clientes = async main => {
  const aba = location.hash.split("/")[1] === "clientes" ? "clientes" : "pedidos";
  const tabs = `<div class="tabs" role="tablist"><button role="tab" data-cli="" aria-selected="${aba === "pedidos"}">Pedidos</button><button role="tab" data-cli="clientes" aria-selected="${aba === "clientes"}">Clientes</button></div>`;
  if (aba === "pedidos") {
    await VISTA_CLI_BASE(main);
    main.querySelector(".topo").insertAdjacentHTML("afterend", tabs);
  } else {
    const [reqs] = await Promise.all([pedidos(true), profissionais()]);
    await atividade();
    const convs = await todas("conversations?select=id,client_id,is_flinko&order=id").catch(() => []);
    const nPed = reqs.reduce((m, r) => (m[r.client_id] = (m[r.client_id] || 0) + 1, m), {});
    const nConv = convs.filter(c => !c.is_flinko).reduce((m, c) => (m[c.client_id] = (m[c.client_id] || 0) + 1, m), {});
    const cli = (C.clientes || []).map(c => Object.assign(c, { _pedidos: nPed[c.id] || 0, _conversas: nConv[c.id] || 0 }));
    main.innerHTML = topo("Clientes e pedidos", `${num(cli.length)} clientes com conta`, '<button class="btn linha" id="bCsvCli">Exportar para Excel</button>') + tabs + `
      <div class="grelha g4" style="margin-bottom:16px">
        <div class="cartao kpi"><strong>${num(cli.length)}</strong><span>clientes com conta</span></div>
        <div class="cartao kpi"><strong>${num(cli.filter(c => c._pedidos).length)}</strong><span>já publicaram um pedido</span></div>
        <div class="cartao kpi"><strong>${num(cli.filter(c => c._conversas).length)}</strong><span>falaram com um profissional</span></div>
        <div class="cartao kpi"><strong>${num(cli.filter(c => Date.now() - new Date(c.created_at) < 30 * DIA).length)}</strong><span>novos nos últimos 30 dias</span></div></div>
      <div class="chips">${FILTROS_CLI.map(([k, n, f]) => `<button type="button" data-fcli="${k}" aria-pressed="${filtroCli.f === k}">${n}<span>${cli.filter(f).length}</span></button>`).join("")}</div>
      <div class="barra-pesq"><input class="campo" id="pesqCli" type="search" placeholder="Procurar cliente pelo nome" value="${esc(filtroCli.q)}" aria-label="Procurar clientes"/></div>
      <div class="cartao" style="padding:6px 18px"><ul class="lista" id="listaCli"></ul></div>`;
    main.querySelectorAll("[data-cli]").forEach(b => b.onclick = () => { location.hash = "#clientes" + (b.dataset.cli ? "/" + b.dataset.cli : ""); });
    const desenhar = () => {
      const f = (FILTROS_CLI.find(x => x[0] === filtroCli.f) || FILTROS_CLI[0])[2], q = filtroCli.q.trim().toLowerCase();
      const L = cli.filter(f).filter(c => !q || String(c.name || "").toLowerCase().includes(q));
      $("#listaCli").innerHTML = L.length ? L.map(c => `<li style="cursor:pointer" data-ficha-cli="${esc(c.id)}">${av(c)}<div class="info"><b>${esc(c.name || "Sem nome")}</b><small>conta criada ${ha(c.created_at)} · ${c._pedidos} pedido(s) · ${c._conversas} conversa(s)${c._ultimo ? " · última visita " + ha(c._ultimo) : ""}</small></div>${c.suspended ? '<span class="tag vermelho">Suspenso</span>' : ""}</li>`).join("") : '<li class="vazio">Ninguém neste grupo.</li>';
    };
    desenhar();
    $("#pesqCli").oninput = e => { filtroCli.q = e.target.value; desenhar(); };
    main.querySelectorAll("[data-fcli]").forEach(b => b.onclick = () => { filtroCli.f = b.dataset.fcli; main.querySelectorAll("[data-fcli]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); desenhar(); });
    $("#bCsvCli").onclick = () => { csv("flinko-clientes-" + hoje() + ".csv", [["Nome", "Conta criada", "Pedidos", "Conversas", "Última visita", "Suspenso"]].concat(cli.map(c => [c.name, fdata(c.created_at), c._pedidos, c._conversas, c._ultimo ? fdata(c._ultimo) : "nunca", c.suspended ? "sim" : "não"]))); aviso("Ficheiro descarregado."); };
  }
};
document.addEventListener("click", e => { const a = e.target.closest("[data-ficha-cli]"); if (a) fichaCliente(a.dataset.fichaCli); });

async function fichaCliente(id) {
  const [reqs, mod] = await Promise.all([pedidos(), dadosModeracao().catch(() => ({ rgpd: [] }))]);
  const c = (C.clientes || []).find(x => x.id === id); if (!c) return aviso("Cliente não encontrado.", true);
  const meus = reqs.filter(r => r.client_id === id), rgpd = mod.rgpd.filter(g => g.profile_id === id);
  abrirFicha(`<div class="cab">${av(c)}<div><h2>${esc(c.name || "Sem nome")}</h2><small style="color:var(--muted)">Cliente · conta criada ${fdata(c.created_at)}</small></div><button class="fechar" aria-label="Fechar">×</button></div>
    ${c.suspended ? '<span class="tag vermelho">Suspenso</span>' : ""}
    <div class="seccao"><h3>Contacto</h3><div class="acoes"><button class="btn peq linha" id="cEmail">Ver email</button><a class="btn peq" href="#mensagens/enviar/${esc(id)}" data-fechar-cli>Mensagem da Flinko</a></div><p class="nota" id="cEmailTxt"></p></div>
    <div class="seccao"><h3>Pedidos (${meus.length})</h3>${meus.length ? `<ul class="lista">${meus.map(r => `<li><div class="info"><b style="white-space:normal">${esc(r.title)}</b><small>${esc(r.category || "")} · ${esc(r.location || "")} · ${ha(r.created_at)} · ${r.status === "resolved" ? "resolvido" : "aberto"}</small></div><span class="tag ${r._propostas ? "verde" : "laranja"}">${r._propostas} propostas</span></li>`).join("")}</ul>` : '<p class="nota">Ainda não publicou pedidos.</p>'}</div>
    ${rgpd.length ? `<div class="seccao"><h3>Pedidos RGPD</h3><ul class="lista">${rgpd.map(g => `<li><div class="info"><b>${g.request_type === "delete" ? "Apagar a conta" : "Cópia dos dados"}</b><small>${fdata(g.created_at)} · ${esc(g.status)}</small></div><a class="btn peq linha" href="#moderacao/rgpd" data-fechar-cli>Abrir</a></li>`).join("")}</ul></div>` : ""}
    <div class="seccao"><h3>Ações</h3><button class="btn peq perigo" id="cSusp">${c.suspended ? "Reativar conta" : "Suspender"}</button></div>`);
  $("#cEmail").onclick = async () => { const e = (await emails())[id]; $("#cEmailTxt").innerHTML = e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : "Sem email."; };
  $("#ficha").querySelectorAll("[data-fechar-cli]").forEach(a => a.addEventListener("click", fecharFicha));
  $("#cSusp").onclick = async () => {
    if (!confirm((c.suspended ? "Reativar a conta de " : "Suspender ") + (c.name || "este cliente") + "?")) return;
    await api("profiles?id=eq." + encodeURIComponent(id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { suspended: !c.suspended } });
    c.suspended = !c.suspended; aviso(c.suspended ? "Conta suspensa." : "Conta reativada."); fichaCliente(id); if (parte === "clientes") ir();
  };
}
