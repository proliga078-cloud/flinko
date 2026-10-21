// Painel de gestão: parte "Hoje" completa (fase 2 do painel único, out/2026).
// Traz do painel antigo os Avisos (16 regras, adiar 7 dias, escolher regras),
// os seguimentos automáticos por WhatsApp, as Tarefas e o Calendário, tudo
// arrumado em três separadores: Hoje, Tarefas e Calendário.
// Usa os mesmos dados do antigo (admin_tasks, admin_items, admin_settings).
"use strict";

/* ---- guardar e ler (admin_items, admin_tasks, admin_settings) ---- */
async function itens(kind, forcar) {
  C.itens = C.itens || {};
  if (C.itens[kind] && !forcar) return C.itens[kind];
  const rows = await todas("admin_items?select=id,kind,data&kind=eq." + encodeURIComponent(kind) + "&order=id").catch(() => []);
  C.itens[kind] = rows.map(r => Object.assign({}, r.data || {}, { id: r.id }));
  return C.itens[kind];
}
async function guardarItem(kind, obj) {
  const id = obj.id || uid(), data = Object.assign({}, obj); delete data.id;
  await api("admin_items", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { id, kind, data } });
  if (C.itens && C.itens[kind]) { const i = C.itens[kind].findIndex(x => x.id === id); const novo = Object.assign({}, data, { id }); if (i >= 0) C.itens[kind][i] = novo; else C.itens[kind].push(novo); }
  return id;
}
async function tarefas(forcar) {
  if (C.tarefas && !forcar) return C.tarefas;
  C.tarefas = await todas("admin_tasks?select=*&order=created_at.desc,id").catch(() => []);
  return C.tarefas;
}
async function guardarTarefa(t) {
  await api("admin_tasks", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: t });
  C.tarefas = null;
}
async function definicoes(forcar) {
  if (C.def && !forcar) return C.def;
  const rows = await todas("admin_settings?select=key,value&order=key").catch(() => []);
  C.def = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return C.def;
}
async function guardarDefinicao(key, value) {
  await api("admin_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { key, value } });
  (C.def = C.def || {})[key] = value;
}
const diaMais = n => new Date(Date.now() + n * DIA).toISOString().slice(0, 10);

/* ---- seguimentos automáticos (as mesmas sequências do painel antigo) ---- */
const SEQS = { d1: [[3, "d6"], [7, "d7"]], d2: [[4, "d8"]], d9: [[7, "d10"], [13, "d11"]] };
const SEQ_NOME = { d1: "Primeiro contacto → 3 dias → 7 dias", d2: "Completar perfil → 4 dias", d9: "Pagamento falhado → dia 7 → aviso final" };
const SEG_TEXTOS = {
  d6: "Olá {nome}! Só para saber se chegaste a ver a minha mensagem sobre o Flinko. Se preferires, ligo-te 5 minutos e tratamos do perfil juntos. Qual é a melhor hora?",
  d7: "Olá {nome}, não quero insistir: fica só o link para quando te der jeito, flinko.pt. O perfil é grátis e sem comissões. Bom trabalho!",
  d8: "Olá {nome}! O teu perfil no Flinko ainda não aparece bem nas pesquisas porque falta: {falta}. Queres ajuda agora? Demora 5 minutos.",
  d10: "Olá {nome}, o pagamento do teu plano ainda está por regularizar. Se não for resolvido nos próximos dias, o plano volta ao grátis e perdes o destaque. Consegues atualizar hoje?",
  d11: "Olá {nome}, este é o último aviso: sem pagamento nos próximos dias o teu plano passa para grátis. O perfil e os dados ficam, só perdes o destaque. Se já resolveste, ignora esta mensagem."
};
async function alvoSeguimento(f) {
  if (f.target === "lead") { const l = (await leads()).find(x => x.id === f.ref); return l && { nome: l.name, tel: l.phone, pessoa: { name: l.name, category: l.category }, parar: ["registado", "perdido"].includes(l.stage) }; }
  const p = (await profissionais()).find(x => x.id === f.ref); if (!p) return null;
  return { nome: p.name, tel: p._tel, pessoa: p, parar: p.suspended || (f.seq === "d2" && p._pontos >= 80) || (f.seq === "d9" && (!p.plan || p.plan === "free")) };
}
async function seguimentosPorFazer() {
  const fs = (await itens("followup")).filter(f => !f.done);
  const out = [];
  for (const f of fs) { const a = await alvoSeguimento(f); if (a && !a.parar) out.push(Object.assign({ _a: a }, f)); }
  return out.sort((a, b) => String(a.due).localeCompare(String(b.due)));
}
async function agendarPasso(target, ref, seq, passo, desde = Date.now()) {
  const s = SEQS[seq]; if (!s || !s[passo]) return;
  const gap = s[passo][0] - (passo ? s[passo - 1][0] : 0);
  await guardarItem("followup", { target, ref, seq, step: passo, tpl: s[passo][1], due: new Date(desde + gap * DIA).toISOString().slice(0, 10), created: new Date().toISOString() });
}
// Começa uma sequência (substitui a que houver em curso para a mesma pessoa).
async function comecarSequencia(target, ref, seq) {
  for (const f of (await itens("followup")).filter(f => f.ref === ref && !f.done)) await guardarItem("followup", Object.assign({}, f, { done: "substituído", doneAt: new Date().toISOString() }));
  if (SEQS[seq]) await agendarPasso(target, ref, seq, 0);
}
async function enviarSeguimento(f) {
  const texto = SEG_TEXTOS[f.tpl]; if (!texto) return aviso("Este seguimento não tem texto.", true);
  if (!window.flinkoWhatsApp || !flinkoWhatsApp.numero(f._a.tel)) return aviso("Sem telemóvel válido para " + f._a.nome + ".", true);
  window.open(flinkoWhatsApp.link(f._a.tel, preencher(texto, f._a.pessoa)), "_blank", "noopener");
  await guardarItem("followup", Object.assign({}, f, { _a: undefined, done: "enviado", doneAt: new Date().toISOString() }));
  await guardarItem("contact", { profile_id: f.target === "lead" ? null : f.ref, ref: f.ref, at: new Date().toISOString(), channel: "WhatsApp", tpl: "Seguimento " + f.tpl });
  await agendarPasso(f.target, f.ref, f.seq, (f.step || 0) + 1);
}

/* ---- avisos (as 16 regras do painel antigo) ---- */
const REGRAS = [["gdpr", "Pedidos RGPD em aberto"], ["regmeio", "Registos a meio"], ["verif", "Verificações com documentos por tratar"], ["unver", "Profissionais por verificar"], ["nocat", "Profissionais sem categoria"], ["notif", "Notificações que falharam"], ["req", "Pedidos sem proposta há mais de 24 h"], ["exp", "Planos a expirar"], ["ticket", "Apoio há mais de 48 h"], ["den", "Denúncias por resolver"], ["inv", "Faturas vencidas"], ["task", "Tarefas atrasadas"], ["lead", "Contactos de angariação para hoje"], ["seg", "Seguimentos para enviar"], ["crm", "Profissionais com contacto marcado"], ["reg", "Nenhum registo novo em 7 dias"]];
async function avisos(todos) {
  const [pros, reqs, mod, def, snz, tks, segs, lds, faturas, notif] = await Promise.all([
    profissionais(), pedidos().catch(() => []), dadosModeracao().catch(() => ({ rgpd: [], verificacoes: [], apoio: [], denuncias: [] })), definicoes().catch(() => ({})),
    itens("snooze").catch(() => []), tarefas().catch(() => []), seguimentosPorFazer().catch(() => []), leads().catch(() => []), itens("invoice").catch(() => []),
    todas("notification_queue?select=id,status&status=eq.failed&order=id").catch(() => [])
  ]);
  const off = new Set(((def.alertrules || {}).off) || []), td = hoje(), t = Date.now();
  const adiados = new Set(snz.filter(s => s.until >= td).map(s => s.key));
  const A = [];
  const add = (regra, chave, nivel, texto, ir) => { if (!off.has(regra)) A.push({ regra, chave: regra + ":" + chave, nivel, texto, ir }); };
  mod.rgpd.filter(g => ["pending", "in_progress"].includes(g.status)).forEach(g => { const d = Math.floor((t - new Date(g.created_at)) / DIA); add("gdpr", g.id, d > 20 ? "mau" : "atencao", `Pedido RGPD em aberto há ${d} dias (a lei dá 30)`, "#moderacao/rgpd"); });
  const vp = mod.verificacoes.filter(v => v.status === "pending");
  if (vp.length) add("verif", "all", vp.some(v => t - new Date(v.created_at) > 3 * DIA) ? "mau" : "atencao", `${vp.length} pedido(s) de verificação com documentos por tratar`, "#moderacao/verificacoes");
  if (C.meio && C.meio.porConvidar) add("regmeio", "all", "atencao", `${C.meio.porConvidar} pessoa(s) criaram conta mas o registo ficou a meio`, "#mensagens/outros");
  const nv = pros.filter(p => !p.verified && !p.suspended).length; if (nv) add("unver", "all", "atencao", `${nv} profissional(is) por verificar`, "#profissionais/verificar");
  const nc = pros.filter(p => !p.category && !p.suspended).length; if (nc) add("nocat", "all", "atencao", `${nc} profissional(is) sem categoria (não aparecem nas pesquisas)`, "#profissionais/incompleto");
  if (notif.length) add("notif", "all", "mau", `${notif.length} notificação(ões) falharam o envio`, "#empresa/registo");
  const rq = reqs.filter(r => r.status !== "resolved" && !r._propostas && t - new Date(r.created_at) > DIA); if (rq.length) add("req", "all", "mau", `${rq.length} pedido(s) de clientes sem nenhuma proposta há mais de 24 h`, "#clientes");
  pros.filter(p => p.plan && p.plan !== "free" && p.plan_expires_at && new Date(p.plan_expires_at) < t + 7 * DIA).forEach(p => { const d = Math.ceil((new Date(p.plan_expires_at) - t) / DIA); add("exp", p.id, d <= 2 ? "mau" : "atencao", `Plano ${p.plan} de ${p.name} expira ${d <= 0 ? "hoje" : "em " + d + " dia(s)"}`, "ficha:" + p.id); });
  const tk = mod.apoio.filter(x => (x.status || "aberto") !== "resolvido" && t - new Date(x.created_at || x.created) > 2 * DIA).length; if (tk) add("ticket", "all", "mau", `${tk} pedido(s) de apoio há mais de 48 h sem resolução`, "#moderacao/apoio");
  const dn = mod.denuncias.filter(x => (x.status || "aberto") !== "resolvido"); if (dn.length) add("den", "all", dn.some(x => t - new Date(x.created_at) > 2 * DIA) ? "mau" : "atencao", `${dn.length} denúncia(s) de perfis por resolver`, "#moderacao/denuncias");
  const iv = faturas.filter(i => i.status === "emitida" && i.due && i.due < td); if (iv.length) add("inv", "all", "mau", `${iv.length} fatura(s) vencida(s) por cobrar`, "#dinheiro/faturas");
  const ta = tks.filter(x => x.status !== "done" && x.due_date && x.due_date < td); if (ta.length) add("task", "all", "atencao", `${ta.length} tarefa(s) atrasada(s)`, "#hoje/tarefas");
  const ld = lds.filter(l => l.next && l.next <= td && !["registado", "perdido"].includes(l.stage)).length; if (ld) add("lead", "all", "atencao", `${ld} contacto(s) de angariação para hoje ou atrasados`, "#angariacao");
  const sg = segs.filter(f => f.due <= td).length; if (sg) add("seg", "all", "atencao", `${sg} seguimento(s) para enviar hoje`, "#hoje");
  const cr = pros.filter(p => C.crm[p.id] && C.crm[p.id].next_contact && String(C.crm[p.id].next_contact).slice(0, 10) <= td && !["ativo", "inativo"].includes(C.crm[p.id].stage)).length; if (cr) add("crm", "all", "atencao", `${cr} profissional(is) com contacto marcado para hoje ou atrasado`, "#hoje");
  if (pros.length && !pros.some(p => t - new Date(p.created_at) < 7 * DIA)) add("reg", "all", "atencao", "Nenhum registo novo de profissionais nos últimos 7 dias", "#estrategia");
  return todos ? A : A.filter(a => !adiados.has(a.chave));
}
function irPara(destino) {
  if (destino.startsWith("ficha:")) return fichaPro(destino.slice(6));
  if (destino.startsWith("/")) { location.href = destino; return; }
  location.hash = destino;
}
function escolherRegras() {
  definicoes().then(def => {
    const off = new Set(((def.alertrules || {}).off) || []);
    abrirFicha(`<div class="cab"><div><h2>Que avisos aparecem</h2></div><button class="fechar" aria-label="Fechar">×</button></div>
      <form id="fRegras"><div class="destinos" style="max-height:none">${REGRAS.map(([k, n]) => `<label><input type="checkbox" value="${k}"${off.has(k) ? "" : " checked"}/> ${esc(n)}</label>`).join("")}</div>
      <button class="btn laranja" type="submit" style="margin-top:14px">Guardar</button></form>`);
    $("#fRegras").onsubmit = async e => {
      e.preventDefault();
      const fora = [...e.target.querySelectorAll("input")].filter(i => !i.checked).map(i => i.value);
      await guardarDefinicao("alertrules", { off: fora }); fecharFicha(); aviso("Guardado."); ir();
    };
  });
}

/* ---- parte "Hoje" com 3 separadores ---- */
const VISTA_HOJE_SIMPLES = VISTAS.hoje;
VISTAS.hoje = async main => {
  const aba = (location.hash.split("/")[1] || "");
  const tabs = `<div class="tabs" role="tablist"><button role="tab" data-hoje="" aria-selected="${!aba}">Hoje</button><button role="tab" data-hoje="tarefas" aria-selected="${aba === "tarefas"}">Tarefas</button><button role="tab" data-hoje="calendario" aria-selected="${aba === "calendario"}">Calendário</button></div>`;
  if (aba === "tarefas") return vistaTarefas(main, tabs);
  if (aba === "calendario") return vistaCalendario(main, tabs);
  if (dono() && !C.meio) C.meio = await fn("admin-registos-a-meio", { action: "preview" }).catch(() => ({}));
  await VISTA_HOJE_SIMPLES(main);
  const [A, segs, tks] = await Promise.all([avisos(), seguimentosPorFazer(), tarefas()]);
  const segHoje = segs.filter(f => f.due <= hoje());
  const tarefasHoje = tks.filter(t => t.status !== "done" && (!t.due_date || t.due_date <= hoje())).slice(0, 6);
  main.querySelector(".topo").insertAdjacentHTML("afterend", tabs);
  const grelha = main.querySelector(".grelha.g2");
  grelha.insertAdjacentHTML("beforebegin", `<div class="cartao" id="cAvisos" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h2>Avisos</h2><p class="sub">O que precisa de atenção, do mais urgente para o resto.</p></div><button class="btn peq linha" id="bRegras">Escolher avisos</button></div>
    ${A.length ? `<ul class="lista">${A.sort((a, b) => (a.nivel === "mau" ? 0 : 1) - (b.nivel === "mau" ? 0 : 1)).map(a => `<li><span class="tag ${a.nivel === "mau" ? "vermelho" : "laranja"}">${a.nivel === "mau" ? "Urgente" : "Atenção"}</span><div class="info"><b style="white-space:normal">${esc(a.texto)}</b></div><button class="btn peq" data-av-ir="${esc(a.ir)}">Ver</button><button class="btn peq linha" data-av-adiar="${esc(a.chave)}">Adiar 7 dias</button></li>`).join("")}</ul>` : '<p class="vazio">Nada urgente. Bom trabalho.</p>'}</div>`);
  grelha.insertAdjacentHTML("beforeend", `<div class="cartao"><h2>Seguimentos automáticos</h2><p class="sub">Mensagens de seguimento por WhatsApp marcadas para hoje (por exemplo, 3 e 7 dias depois do primeiro contacto).</p>
      ${segHoje.length ? `<ul class="lista">${segHoje.map(f => `<li><span class="av">${esc(iniciais(f._a.nome))}</span><div class="info"><b>${esc(f._a.nome)}</b><small>${f.due < hoje() ? "atrasado · " : ""}${esc(SEQ_NOME[f.seq] || "")}</small></div><button class="btn peq verde" data-seg="${esc(f.id)}">Enviar</button><button class="btn peq linha" data-seg-parar="${esc(f.id)}">Parar</button></li>`).join("")}</ul>` : `<p class="vazio">Nenhum seguimento para hoje.${segs.length ? " Próximo: " + fdata(segs[0].due) + "." : " Começam quando envias o primeiro contacto por WhatsApp na Angariação."}</p>`}</div>
    <div class="cartao"><h2>Tarefas para hoje</h2><p class="sub">Sem data ou com data até hoje.</p>
      ${tarefasHoje.length ? `<ul class="lista">${tarefasHoje.map(t => `<li><div class="info"><b>${esc(t.title)}</b><small>${t.due_date ? (t.due_date < hoje() ? "atrasada · " : "") + fdata(t.due_date) : "sem data"}${t.profile_id ? " · " + esc((C.pros || []).concat(C.clientes || []).find(p => p.id === t.profile_id)?.name || "") : ""}</small></div><button class="btn peq linha" data-tk-feita="${esc(t.id)}">Feita</button></li>`).join("")}</ul>` : '<p class="vazio">Sem tarefas para hoje.</p>'}<a class="btn peq linha" href="#hoje/tarefas" style="margin-top:8px">Todas as tarefas</a></div>`);
  main.querySelectorAll("[data-hoje]").forEach(b => b.onclick = () => { location.hash = "#hoje" + (b.dataset.hoje ? "/" + b.dataset.hoje : ""); });
  $("#bRegras").onclick = escolherRegras;
  main.querySelectorAll("[data-av-ir]").forEach(b => b.onclick = () => irPara(b.dataset.avIr));
  main.querySelectorAll("[data-av-adiar]").forEach(b => b.onclick = async () => { await guardarItem("snooze", { key: b.dataset.avAdiar, until: diaMais(7) }); aviso("Adiado por 7 dias."); ir(); });
  main.querySelectorAll("[data-seg]").forEach(b => b.onclick = async () => { await enviarSeguimento(segs.find(f => f.id === b.dataset.seg)); aviso("Seguimento enviado e o próximo marcado."); ir(); });
  main.querySelectorAll("[data-seg-parar]").forEach(b => b.onclick = async () => { const f = segs.find(x => x.id === b.dataset.segParar); await guardarItem("followup", Object.assign({}, f, { _a: undefined, done: "parado", doneAt: new Date().toISOString() })); aviso("Seguimento parado."); ir(); });
  main.querySelectorAll("[data-tk-feita]").forEach(b => b.onclick = async () => { const t = tks.find(x => x.id === b.dataset.tkFeita); await guardarTarefa(Object.assign({}, t, { status: "done" })); aviso("Tarefa feita."); ir(); });
};

/* ---- Tarefas ---- */
async function vistaTarefas(main, tabs) {
  const [tks, pros] = await Promise.all([tarefas(true), profissionais()]);
  const nome = id => (pros.concat(C.clientes || []).find(p => p.id === id) || {}).name || "";
  const COLS = [["todo", "Por fazer"], ["doing", "Em curso"], ["done", "Feitas"]];
  const PRI = { alta: "Alta", media: "Média", baixa: "Baixa" };
  const sugestoes = [];
  const nv = pros.filter(p => !p.verified && !p.suspended).length; if (nv) sugestoes.push(`Verificar os ${nv} profissionais que faltam`);
  const inc = pros.filter(p => p._pontos < 60 && !p.suspended).length; if (inc) sugestoes.push(`Ligar aos ${inc} profissionais com o perfil incompleto`);
  if (!(await pedidos().catch(() => [])).length) sugestoes.push("Publicar o link dos pedidos em 5 grupos de Facebook do distrito escolhido");
  sugestoes.push("Ver os números da Estratégia e escolher a ação da semana");
  main.innerHTML = topo("Tarefas", `${tks.filter(t => t.status !== "done").length} em aberto`) + tabs + `
    <div class="cartao" style="margin-bottom:16px"><h2>Nova tarefa</h2><form id="fTarefa" class="barra-pesq" style="margin:10px 0 0">
      <label class="hidden" for="tTit">Tarefa</label><input class="campo" id="tTit" placeholder="O que tens de fazer?" required/>
      <label class="hidden" for="tData">Data</label><input class="campo" id="tData" type="date" style="flex:0 1 170px;min-width:150px"/>
      <label class="hidden" for="tPri">Prioridade</label><select class="campo" id="tPri" style="flex:0 1 130px;min-width:120px">${Object.entries(PRI).map(([k, v]) => `<option value="${k}"${k === "media" ? " selected" : ""}>${v}</option>`).join("")}</select>
      <button class="btn laranja" type="submit">Juntar</button></form></div>
    <div class="grelha" style="grid-template-columns:repeat(3,minmax(0,1fr))" id="kanban">${COLS.map(([k, n]) => `<div class="cartao"><h2>${n} (${tks.filter(t => t.status === k).length})</h2><ul class="lista">${tks.filter(t => t.status === k).sort((a, b) => String(a.due_date || "9").localeCompare(String(b.due_date || "9"))).map(t => `<li style="flex-wrap:wrap"><div class="info" style="min-width:150px"><b style="white-space:normal">${esc(t.title)}</b><small>${t.due_date ? (t.due_date < hoje() && k !== "done" ? "atrasada · " : "") + fdata(t.due_date) : "sem data"} · ${PRI[t.priority] || "Média"}${t.profile_id ? " · " + esc(nome(t.profile_id)) : ""}</small></div>
        <div class="acoes">${COLS.filter(c => c[0] !== k).map(c => `<button class="btn peq linha" data-mover="${esc(t.id)}" data-para="${c[0]}">${c[0] === "done" ? "Feita" : c[1]}</button>`).join("")}<button class="btn peq perigo" data-apagar-tk="${esc(t.id)}" aria-label="Apagar tarefa">×</button></div></li>`).join("") || '<li class="vazio">Nada.</li>'}</ul></div>`).join("")}</div>
    ${sugestoes.length ? `<div class="cartao" style="margin-top:16px"><h2>Sugestões a partir dos teus números</h2><ul class="lista">${sugestoes.map((s, i) => `<li><div class="info"><b style="white-space:normal">${esc(s)}</b></div><button class="btn peq linha" data-sug="${i}">Criar tarefa</button></li>`).join("")}</ul></div>` : ""}`;
  main.querySelectorAll("[data-hoje]").forEach(b => b.onclick = () => { location.hash = "#hoje" + (b.dataset.hoje ? "/" + b.dataset.hoje : ""); });
  $("#fTarefa").onsubmit = async e => { e.preventDefault(); await guardarTarefa({ id: uid(), title: $("#tTit").value.trim(), status: "todo", priority: $("#tPri").value, due_date: $("#tData").value || null, profile_id: null, created_at: new Date().toISOString() }); aviso("Tarefa juntada."); ir(); };
  main.querySelectorAll("[data-mover]").forEach(b => b.onclick = async () => { const t = tks.find(x => x.id === b.dataset.mover); await guardarTarefa(Object.assign({}, t, { status: b.dataset.para })); ir(); });
  main.querySelectorAll("[data-apagar-tk]").forEach(b => b.onclick = async () => { if (!confirm("Apagar esta tarefa?")) return; await api("admin_tasks?id=eq." + encodeURIComponent(b.dataset.apagarTk), { method: "DELETE", headers: { Prefer: "return=minimal" } }); C.tarefas = null; ir(); });
  main.querySelectorAll("[data-sug]").forEach(b => b.onclick = async () => { await guardarTarefa({ id: uid(), title: sugestoes[Number(b.dataset.sug)], status: "todo", priority: "media", due_date: null, profile_id: null, created_at: new Date().toISOString() }); aviso("Tarefa criada."); ir(); });
}

/* ---- Calendário ---- */
let mesCal = null;
async function eventos() {
  const [tks, lds, pros, mod, segs, faturas, posts] = await Promise.all([tarefas(), leads().catch(() => []), profissionais(), dadosModeracao().catch(() => ({ rgpd: [], apoio: [], denuncias: [] })), seguimentosPorFazer().catch(() => []), itens("invoice").catch(() => []), itens("post").catch(() => [])]);
  const E = [], d10 = d => String(d || "").slice(0, 10);
  tks.filter(t => t.status !== "done" && t.due_date).forEach(t => E.push({ dia: d10(t.due_date), tipo: "Tarefa", texto: t.title, ir: "#hoje/tarefas" }));
  lds.filter(l => l.next && !["registado", "perdido"].includes(l.stage)).forEach(l => E.push({ dia: d10(l.next), tipo: "Angariação", texto: "Contactar " + l.name, ir: "#angariacao" }));
  pros.filter(p => C.crm[p.id] && C.crm[p.id].next_contact).forEach(p => E.push({ dia: d10(C.crm[p.id].next_contact), tipo: "Profissional", texto: "Contactar " + p.name, ir: "ficha:" + p.id }));
  pros.filter(p => p.plan && p.plan !== "free" && p.plan_expires_at).forEach(p => E.push({ dia: d10(p.plan_expires_at), tipo: "Plano", texto: "Plano de " + p.name + " expira", ir: "ficha:" + p.id }));
  mod.rgpd.filter(g => ["pending", "in_progress"].includes(g.status)).forEach(g => E.push({ dia: d10(new Date(new Date(g.created_at).getTime() + 30 * DIA).toISOString()), tipo: "RGPD", texto: "Prazo do pedido RGPD", ir: "#moderacao/rgpd" }));
  mod.apoio.concat(mod.denuncias).filter(x => (x.status || "aberto") !== "resolvido").forEach(x => E.push({ dia: d10(new Date(new Date(x.created_at || x.created).getTime() + 2 * DIA).toISOString()), tipo: "Apoio", texto: "Responder: " + (x.subject || x.assunto || "pedido"), ir: "#moderacao/" + (x.kind === "denuncia" ? "denuncias" : "apoio") }));
  segs.forEach(f => E.push({ dia: d10(f.due), tipo: "Seguimento", texto: "Seguimento a " + f._a.nome, ir: "#hoje" }));
  faturas.filter(i => i.status === "emitida" && i.due).forEach(i => E.push({ dia: d10(i.due), tipo: "Fatura", texto: "Fatura " + (i.number || "") + " vence", ir: "#dinheiro/faturas" }));
  posts.filter(p => p.date && p.status !== "publicado").forEach(p => E.push({ dia: d10(p.date), tipo: "Publicação", texto: p.title || p.text || "Publicação", ir: "#angariacao/marketing" }));
  return E;
}
async function vistaCalendario(main, tabs) {
  const E = await eventos();
  const base = mesCal || new Date(); const ano = base.getFullYear(), mes = base.getMonth();
  const prim = new Date(ano, mes, 1), dias = new Date(ano, mes + 1, 0).getDate(), desloc = (prim.getDay() + 6) % 7;
  const chave = d => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const por = E.reduce((m, e) => ((m[e.dia] = m[e.dia] || []).push(e), m), {});
  const atrasados = E.filter(e => e.dia < hoje()).sort((a, b) => a.dia.localeCompare(b.dia));
  const proximos = E.filter(e => e.dia >= hoje() && e.dia <= diaMais(14)).sort((a, b) => a.dia.localeCompare(b.dia));
  const linhaEv = e => `<li><span class="tag">${esc(e.tipo)}</span><div class="info"><b style="white-space:normal">${esc(e.texto)}</b><small>${fdata(e.dia)}</small></div><button class="btn peq linha" data-ev-ir="${esc(e.ir)}">Abrir</button></li>`;
  main.innerHTML = topo("Calendário", "Tudo o que tem data: tarefas, contactos, prazos, planos e seguimentos.") + tabs + `
    <div class="cartao"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><button class="btn peq linha" id="mAnt" aria-label="Mês anterior">◀</button><h2 style="flex:1;text-align:center">${(t => t.charAt(0).toUpperCase() + t.slice(1))(prim.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }))}</h2><button class="btn peq linha" id="mHoje">Hoje</button><button class="btn peq linha" id="mSeg" aria-label="Mês seguinte">▶</button></div>
      <div class="cal">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => `<div class="cal-dia-sem">${d}</div>`).join("")}${Array(desloc).fill('<div class="cal-vazio"></div>').join("")}${Array.from({ length: dias }, (_, i) => { const k = chave(i + 1), ev = por[k] || []; return `<button type="button" class="cal-dia${k === hoje() ? " hoje" : ""}${ev.length ? " tem" : ""}" data-dia="${k}" aria-label="${i + 1}: ${ev.length} evento(s)"><b>${i + 1}</b>${ev.slice(0, 2).map(e => `<span>${esc(e.tipo)}</span>`).join("")}${ev.length > 2 ? `<span>+${ev.length - 2}</span>` : ""}</button>`; }).join("")}</div>
      <div id="calDia" style="margin-top:12px"></div></div>
    <div class="grelha g2" style="margin-top:16px"><div class="cartao"><h2>Em atraso</h2>${atrasados.length ? `<ul class="lista">${atrasados.map(linhaEv).join("")}</ul>` : '<p class="vazio">Nada em atraso.</p>'}</div>
      <div class="cartao"><h2>Próximos 14 dias</h2>${proximos.length ? `<ul class="lista">${proximos.map(linhaEv).join("")}</ul>` : '<p class="vazio">Nada marcado.</p>'}</div></div>`;
  main.querySelectorAll("[data-hoje]").forEach(b => b.onclick = () => { location.hash = "#hoje" + (b.dataset.hoje ? "/" + b.dataset.hoje : ""); });
  $("#mAnt").onclick = () => { mesCal = new Date(ano, mes - 1, 1); ir(); };
  $("#mSeg").onclick = () => { mesCal = new Date(ano, mes + 1, 1); ir(); };
  $("#mHoje").onclick = () => { mesCal = null; ir(); };
  const ligar = el => el.querySelectorAll("[data-ev-ir]").forEach(b => b.onclick = () => irPara(b.dataset.evIr));
  ligar(main);
  main.querySelectorAll("[data-dia]").forEach(b => b.onclick = () => { const ev = por[b.dataset.dia] || []; $("#calDia").innerHTML = `<h3 style="margin-bottom:6px">${fdata(b.dataset.dia)}</h3>${ev.length ? `<ul class="lista">${ev.map(linhaEv).join("")}</ul>` : '<p class="vazio">Nada neste dia.</p>'}`; ligar($("#calDia")); });
}
