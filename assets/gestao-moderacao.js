// Painel de gestão: parte "Moderação e apoio" (fase 1 do painel único, out/2026).
// Junta o que estava em 4 secções do painel antigo (Moderação, Qualidade e
// risco, Apoio a clientes, Operações): denúncias, pedidos de apoio, avaliações,
// conversas suspeitas, verificações com documentos e pedidos RGPD.
// Usa as peças de assets/gestao.js (api, todas, rpc, fn, esc, aviso, VISTAS…).
"use strict";

const PALAVRAS_MAS = /(fuder|foder|merda|puta|caralho|porra|cabr[aã]o|idiota|burro|estúpido|estupido|filho da|vigarist|burl[aã])/i;
const LIGACAO = /(https?:\/\/|www\.)/i;
const TELEFONE = /(\+?351)?\s?9\d[\s.-]?\d{3}[\s.-]?\d{3}/;
const ESTADO_TICKET = { aberto: "Aberto", curso: "Em curso", resolvido: "Resolvido" };
const ESTADO_RGPD = { pending: "Por tratar", in_progress: "Em curso", completed: "Concluído", cancelled: "Cancelado" };

function nomeDe(id) {
  const todos = (C.pros || []).concat(C.clientes || [], C.admins || []);
  const p = todos.find(x => x.id === id);
  return p ? p.name : "—";
}
function sinaisTexto(txt) {
  const f = [], t = String(txt || "");
  if (PALAVRAS_MAS.test(t)) f.push("linguagem ofensiva ou acusação");
  if (LIGACAO.test(t)) f.push("tem um link");
  if (TELEFONE.test(t)) f.push("tem um número de telefone");
  return f;
}
async function dadosModeracao(forcar) {
  if (C.mod && !forcar) return C.mod;
  await profissionais();
  const [tickets, manuais, avs, convs, verif, rgpd] = await Promise.all([
    todas("support_tickets?select=*&order=created_at.desc,id").catch(() => []),
    todas("admin_items?select=id,kind,data&kind=eq.ticket&order=id").catch(() => []),
    todas("reviews?select=id,professional_id,client_id,reviewer_name,rating,comment,created_at&order=created_at.desc,id").catch(() => []),
    todas("conversations?select=id,professional_id,client_id,last_message,last_message_at,is_flinko&order=last_message_at.desc.nullslast,id").catch(() => []),
    todas("verification_requests?select=id,profile_id,status,documents,notes,admin_notes,created_at,resolved_at&order=created_at.desc,id").catch(() => []),
    todas("gdpr_requests?select=id,profile_id,request_type,status,notes,admin_notes,created_at,resolved_at&order=created_at.desc,id").catch(() => [])
  ]);
  C.mod = {
    denuncias: tickets.filter(t => t.kind === "denuncia"),
    apoio: tickets.filter(t => t.kind !== "denuncia").map(t => Object.assign({ origem: "site" }, t))
      .concat(manuais.map(m => Object.assign({ origem: "manual", id: m.id }, m.data || {}))),
    avaliacoes: avs.map(r => Object.assign(r, { _sinais: sinaisTexto(r.comment + " " + r.reviewer_name).concat(r.rating <= 2 ? ["nota baixa"] : []) })),
    conversas: convs.filter(c => !c.is_flinko).map(c => Object.assign(c, { _sinais: sinaisTexto(c.last_message) })).filter(c => c._sinais.length),
    verificacoes: verif,
    rgpd
  };
  return C.mod;
}

let abaMod = "denuncias";
VISTAS.moderacao = async main => {
  const M = await dadosModeracao(true);
  const abertos = t => (t.status || "aberto") !== "resolvido";
  const contas = {
    denuncias: M.denuncias.filter(abertos).length,
    apoio: M.apoio.filter(abertos).length,
    avaliacoes: M.avaliacoes.filter(r => r._sinais.length).length,
    conversas: M.conversas.length,
    verificacoes: M.verificacoes.filter(v => v.status === "pending").length,
    rgpd: M.rgpd.filter(g => ["pending", "in_progress"].includes(g.status)).length
  };
  const ABAS = [["denuncias", "Denúncias"], ["apoio", "Pedidos de apoio"], ["avaliacoes", "Avaliações"], ["conversas", "Conversas suspeitas"], ["verificacoes", "Verificações"], ["rgpd", "RGPD"]];
  const sub = location.hash.split("/")[1]; if (ABAS.some(a => a[0] === sub)) abaMod = sub;
  main.innerHTML = topo("Moderação e apoio", "Denúncias, pedidos de ajuda, avaliações, verificações e pedidos de dados (RGPD).") + `
    <div class="tabs" role="tablist" style="flex-wrap:wrap">${ABAS.map(([id, n]) => `<button role="tab" data-mod="${id}" aria-selected="${abaMod === id}">${n}${contas[id] ? ` <span class="tag laranja">${contas[id]}</span>` : ""}</button>`).join("")}</div><div id="abaMod"></div>`;
  main.querySelectorAll("[data-mod]").forEach(b => b.onclick = () => { location.hash = "#moderacao/" + b.dataset.mod; });
  const box = $("#abaMod");
  ({ denuncias: abaDenuncias, apoio: abaApoio, avaliacoes: abaAvaliacoes, conversas: abaConversas, verificacoes: abaVerificacoes, rgpd: abaRgpd })[abaMod](box, M);
};

/* ---- Denúncias e pedidos de apoio (support_tickets) ---- */
function linhaTicket(t, denuncia) {
  const manual = t.origem === "manual";
  const estado = t.status || "aberto";
  const atrasado = estado !== "resolvido" && Date.now() - new Date(t.created_at || t.created) > 2 * DIA;
  return `<li style="align-items:flex-start;flex-wrap:wrap"><div class="info" style="min-width:220px"><b>${esc(t.subject || t.assunto || "(sem assunto)")}</b>
      <small>${esc(t.name || "—")}${t.email ? " · " + esc(t.email) : ""}${t.contact ? " · " + esc(t.contact) : ""} · ${ha(t.created_at || t.created)}${manual ? " · registado à mão" : ""}</small>
      <p style="margin-top:6px;white-space:pre-wrap">${esc(t.message || t.text || "")}</p>
      ${t.admin_notes ? `<p class="nota">Notas: ${esc(t.admin_notes)}</p>` : ""}
      ${denuncia && t.target_profile_id ? `<p class="nota">Perfil denunciado: <button type="button" class="btn peq linha" data-ficha="${esc(t.target_profile_id)}">${esc(nomeDe(t.target_profile_id))}</button></p>` : ""}</div>
    <div class="acoes">${atrasado ? '<span class="tag vermelho">Mais de 48 h</span>' : ""}
      <select class="campo" style="width:auto" data-tk-estado="${esc(t.id)}" data-tk-manual="${manual ? 1 : ""}" aria-label="Estado">${Object.entries(ESTADO_TICKET).map(([k, v]) => `<option value="${k}"${estado === k ? " selected" : ""}>${v}</option>`).join("")}</select>
      ${!manual ? `<button class="btn peq linha" data-tk-nota="${esc(t.id)}">Notas</button>` : ""}
      ${t.email ? `<a class="btn peq linha" href="mailto:${esc(t.email)}?subject=${encodeURIComponent("Re: " + (t.subject || "o teu pedido"))}">Responder por email</a>` : ""}
      ${denuncia && t.target_profile_id ? `<button class="btn peq perigo" data-tk-suspender="${esc(t.target_profile_id)}">Suspender o perfil</button>` : ""}</div></li>`;
}
function ligarTickets(box, M) {
  box.querySelectorAll("[data-tk-estado]").forEach(s => s.onchange = async () => {
    const id = s.dataset.tkEstado, estado = s.value;
    if (s.dataset.tkManual) {
      const t = M.apoio.find(x => x.id === id); const data = Object.assign({}, t, { status: estado }); delete data.id; delete data.origem;
      await api("admin_items", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { id, kind: "ticket", data } });
    } else {
      await api("support_tickets?id=eq." + encodeURIComponent(id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { status: estado, resolved_at: estado === "resolvido" ? new Date().toISOString() : null } });
    }
    aviso("Estado atualizado."); ir();
  });
  box.querySelectorAll("[data-tk-nota]").forEach(b => b.onclick = async () => {
    const t = M.denuncias.concat(M.apoio).find(x => x.id === b.dataset.tkNota);
    const nota = prompt("Notas internas (só a equipa vê):", t.admin_notes || ""); if (nota == null) return;
    await api("support_tickets?id=eq." + encodeURIComponent(t.id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { admin_notes: nota } });
    aviso("Notas guardadas."); ir();
  });
  box.querySelectorAll("[data-tk-suspender]").forEach(b => b.onclick = async () => {
    const id = b.dataset.tkSuspender;
    if (!confirm("Suspender o perfil de " + nomeDe(id) + "? Deixa de aparecer no site.")) return;
    await api("profiles?id=eq." + encodeURIComponent(id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { suspended: true } });
    C.pros = null; aviso("Perfil suspenso."); ir();
  });
}
function abaDenuncias(box, M) {
  box.innerHTML = `<div class="cartao"><h2>Denúncias de perfis</h2><p class="sub">Feitas pelos visitantes no site. Responde em menos de 48 horas.</p>
    ${M.denuncias.length ? `<ul class="lista">${M.denuncias.map(t => linhaTicket(t, true)).join("")}</ul>` : '<p class="vazio">Não há denúncias. Quando alguém denunciar um perfil no site, aparece aqui.</p>'}</div>`;
  ligarTickets(box, M);
}
function abaApoio(box, M) {
  box.innerHTML = `<div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h2>Pedidos de apoio</h2><p class="sub">Mensagens do formulário de contacto e pedidos que registaste à mão (telefone, WhatsApp).</p></div><button class="btn laranja" id="novoTicket">Registar pedido</button></div>
    ${M.apoio.length ? `<ul class="lista">${M.apoio.sort((a, b) => String(b.created_at || b.created).localeCompare(String(a.created_at || a.created))).map(t => linhaTicket(t, false)).join("")}</ul>` : '<p class="vazio">Não há pedidos de apoio.</p>'}</div>`;
  ligarTickets(box, M);
  $("#novoTicket").onclick = () => {
    abrirFicha(`<div class="cab"><div><h2>Registar pedido de apoio</h2></div><button class="fechar" aria-label="Fechar">×</button></div>
      <form id="fTicket"><label class="rot" for="tkNome">Quem</label><input class="campo" id="tkNome" required/>
      <label class="rot" for="tkCont">Contacto (telefone ou email)</label><input class="campo" id="tkCont"/>
      <label class="rot" for="tkAss">Assunto</label><input class="campo" id="tkAss" required/>
      <label class="rot" for="tkTxt">O que precisa</label><textarea class="campo" id="tkTxt"></textarea>
      <button class="btn laranja" type="submit" style="margin-top:14px">Guardar</button></form>`);
    $("#fTicket").onsubmit = async e => {
      e.preventDefault();
      const data = { name: $("#tkNome").value.trim(), contact: $("#tkCont").value.trim(), subject: $("#tkAss").value.trim(), text: $("#tkTxt").value, status: "aberto", created: new Date().toISOString() };
      await api("admin_items", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { id: uid(), kind: "ticket", data } });
      fecharFicha(); aviso("Pedido registado."); ir();
    };
  };
}

/* ---- Avaliações ---- */
let filtroAv = "sinalizadas";
function abaAvaliacoes(box, M) {
  const L = M.avaliacoes.filter(r => filtroAv === "todas" ? true : r._sinais.length);
  box.innerHTML = `<div class="cartao"><h2>Avaliações</h2><p class="sub">Apaga só as abusivas ou falsas. As negativas verdadeiras ficam: avaliações só boas parecem falsas.</p>
    <div class="chips"><button type="button" data-fav="sinalizadas" aria-pressed="${filtroAv === "sinalizadas"}">A rever<span>${M.avaliacoes.filter(r => r._sinais.length).length}</span></button><button type="button" data-fav="todas" aria-pressed="${filtroAv === "todas"}">Todas<span>${M.avaliacoes.length}</span></button></div>
    ${L.length ? `<ul class="lista">${L.map(r => `<li style="align-items:flex-start"><div class="info"><b>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)} · ${esc(r.reviewer_name || "Anónimo")} sobre ${esc(nomeDe(r.professional_id))}</b><small>${ha(r.created_at)}${r._sinais.length ? " · " + esc(r._sinais.join(", ")) : ""}</small><p style="margin-top:6px">${esc(r.comment || "(sem comentário)")}</p></div>
      <button class="btn peq perigo" data-av-apagar="${esc(r.id)}">Apagar</button></li>`).join("")}</ul>` : '<p class="vazio">Nada para rever.</p>'}</div>`;
  box.querySelectorAll("[data-fav]").forEach(b => b.onclick = () => { filtroAv = b.dataset.fav; abaAvaliacoes(box, M); });
  box.querySelectorAll("[data-av-apagar]").forEach(b => b.onclick = async () => {
    if (!confirm("Apagar esta avaliação? Não dá para desfazer.")) return;
    await api("reviews?id=eq." + encodeURIComponent(b.dataset.avApagar), { method: "DELETE", headers: { Prefer: "return=minimal" } });
    aviso("Avaliação apagada."); ir();
  });
}

/* ---- Conversas suspeitas ---- */
function abaConversas(box, M) {
  box.innerHTML = `<div class="cartao"><h2>Conversas suspeitas</h2><p class="sub">Última mensagem com linguagem ofensiva, links ou números de telefone (quem tenta levar o negócio para fora, ou burlas).</p>
    ${M.conversas.length ? `<ul class="lista">${M.conversas.map(c => `<li style="align-items:flex-start"><div class="info"><b>${esc(nomeDe(c.client_id))} ↔ ${esc(nomeDe(c.professional_id))}</b><small>${ha(c.last_message_at)} · ${esc(c._sinais.join(", "))}</small><p style="margin-top:6px">${esc(c.last_message || "")}</p></div>
      <button class="btn peq linha" data-ficha="${esc(c.professional_id)}">Ficha do profissional</button></li>`).join("")}</ul>` : '<p class="vazio">Nada suspeito nas últimas mensagens.</p>'}</div>`;
}

/* ---- Verificações (documentos) ---- */
async function abrirDocumento(path) {
  const pedir = () => fetch(SB_URL + "/storage/v1/object/sign/verification-docs/" + String(path).split("/").map(encodeURIComponent).join("/"), { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }) });
  let r = await pedir(); if (r.status === 401) { await renovar(); r = await pedir(); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !(j.signedURL || j.signedUrl)) return aviso("Não consegui abrir o documento: " + (j.message || j.error || "erro " + r.status), true);
  window.open(SB_URL + "/storage/v1" + (j.signedURL || j.signedUrl), "_blank", "noopener");
}
function abaVerificacoes(box, M) {
  const pend = M.verificacoes.filter(v => v.status === "pending"), outras = M.verificacoes.filter(v => v.status !== "pending");
  const linha = v => `<li style="align-items:flex-start;flex-wrap:wrap"><div class="info" style="min-width:220px"><b>${esc(nomeDe(v.profile_id))}</b><small>pedido ${ha(v.created_at)}${v.status !== "pending" ? " · " + (v.status === "approved" ? "aprovado" : "rejeitado") : ""}</small>
      ${v.notes ? `<p style="margin-top:6px">${esc(v.notes)}</p>` : ""}${v.admin_notes ? `<p class="nota">Nota: ${esc(v.admin_notes)}</p>` : ""}
      <div class="acoes" style="margin-top:6px">${(v.documents || []).map(d => `<button class="btn peq linha" data-doc="${esc(d.path)}">${esc(d.name || "Documento")}</button>`).join("")}</div></div>
    ${v.status === "pending" ? `<div class="acoes"><button class="btn peq verde" data-verif="${esc(v.id)}" data-ok="1">Aprovar</button><button class="btn peq perigo" data-verif="${esc(v.id)}" data-ok="">Rejeitar</button></div>` : ""}</li>`;
  box.innerHTML = `<div class="cartao"><h2>Pedidos de verificação</h2><p class="sub">Profissionais que enviaram documentos. Abre o documento, confirma e aprova. Os documentos abrem por 5 minutos.</p>
    ${pend.length ? `<ul class="lista">${pend.map(linha).join("")}</ul>` : '<p class="vazio">Nenhum pedido por tratar. Para verificar alguém sem documentos, usa a ficha em Profissionais.</p>'}
    ${outras.length ? `<details style="margin-top:12px"><summary class="nota">Já tratados (${outras.length})</summary><ul class="lista">${outras.map(linha).join("")}</ul></details>` : ""}</div>`;
  box.querySelectorAll("[data-doc]").forEach(b => b.onclick = () => abrirDocumento(b.dataset.doc));
  box.querySelectorAll("[data-verif]").forEach(b => b.onclick = async () => {
    const aprovar = !!b.dataset.ok;
    const nota = prompt(aprovar ? "Nota interna (opcional):" : "Motivo da rejeição (fica guardado; diz-lho também por mensagem):", "");
    if (nota == null || (!aprovar && !nota.trim())) return;
    await rpc("admin_resolve_verification", { p_request: b.dataset.verif, p_approve: aprovar, p_note: nota.trim() || null });
    C.pros = null; aviso(aprovar ? "Aprovado e marcado como verificado." : "Pedido rejeitado."); ir();
  });
}

/* ---- RGPD ---- */
function abaRgpd(box, M) {
  const linha = g => {
    const dias = 30 - Math.floor((Date.now() - new Date(g.created_at)) / DIA);
    const aberto = ["pending", "in_progress"].includes(g.status);
    return `<li style="align-items:flex-start;flex-wrap:wrap"><div class="info" style="min-width:220px"><b>${g.request_type === "delete" ? "Apagar a conta" : g.request_type === "export" ? "Cópia dos dados" : esc(g.request_type)} · ${esc(nomeDe(g.profile_id))}</b>
      <small>pedido ${fdata(g.created_at)}${aberto ? ` · ${dias > 0 ? "faltam " + dias + " dias (a lei dá 30)" : "PRAZO ULTRAPASSADO"}` : ""}</small>${g.notes ? `<p style="margin-top:6px">${esc(g.notes)}</p>` : ""}</div>
      <div class="acoes">${aberto && dias <= 10 ? '<span class="tag vermelho">Urgente</span>' : ""}
        <select class="campo" style="width:auto" data-gd="${esc(g.id)}" aria-label="Estado">${Object.entries(ESTADO_RGPD).map(([k, v]) => `<option value="${k}"${g.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
        ${dono() ? `<button class="btn peq linha" data-gd-exp="${esc(g.id)}">Exportar dados</button>${g.request_type === "delete" ? `<button class="btn peq perigo" data-gd-del="${esc(g.id)}">Apagar a conta</button>` : ""}` : ""}</div></li>`;
  };
  box.innerHTML = `<div class="cartao"><h2>Pedidos de dados (RGPD)</h2><p class="sub">A lei dá 30 dias para responder. Exportar gera um ficheiro com os dados da pessoa; apagar remove a conta e os ficheiros.</p>
    ${M.rgpd.length ? `<ul class="lista">${M.rgpd.map(linha).join("")}</ul>` : '<p class="vazio">Não há pedidos de dados.</p>'}</div>`;
  box.querySelectorAll("[data-gd]").forEach(s => s.onchange = async () => {
    await api("gdpr_requests?id=eq." + encodeURIComponent(s.dataset.gd), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { status: s.value, resolved_at: ["completed", "cancelled"].includes(s.value) ? new Date().toISOString() : null } });
    aviso("Estado atualizado."); ir();
  });
  box.querySelectorAll("[data-gd-exp]").forEach(b => b.onclick = async () => {
    const j = await fn("admin-gdpr", { action: "export", requestId: b.dataset.gdExp });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }));
    a.download = "flinko-dados-" + b.dataset.gdExp + ".json"; document.body.appendChild(a); a.click(); a.remove();
    aviso("Ficheiro descarregado.");
  });
  box.querySelectorAll("[data-gd-del]").forEach(b => b.onclick = async () => {
    const g = M.rgpd.find(x => x.id === b.dataset.gdDel), nome = nomeDe(g.profile_id);
    const conf = prompt(`Isto apaga a conta de ${nome} e os ficheiros, e não dá para desfazer.\nEscreve o nome exato para confirmar:`);
    if (conf == null) return;
    if (conf.trim() !== nome) return aviso("O nome não corresponde. Nada foi apagado.", true);
    const j = await fn("admin-gdpr", { action: "delete", requestId: g.id, confirmName: conf.trim() });
    C.pros = null; aviso(`Conta apagada (${j.filesRemoved || 0} ficheiros removidos).`); ir();
  });
}
