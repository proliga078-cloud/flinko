// Painel de gestão (gestao.html), out/2026.
//
// Substitui o painel antigo (admin.html, 29 secções) por 6 partes: Hoje,
// Profissionais, Mensagens, Clientes e pedidos, Angariação, Dinheiro. Cada
// parte só carrega o que mostra (o antigo lia 20 tabelas ao abrir).
//
// Envios: a grupos vão aos poucos (10 de cada vez), com barra de progresso e
// a lista de quem recebeu e de quem falhou. Cada pedido ao servidor fica bem
// abaixo do limite de 10 segundos do Netlify. As respostas às conversas da
// Flinko vão pelo servidor, em nome da Flinko, seja qual for o admin.
"use strict";

const SB_URL = "https://cdwinidhtfxfxowflize.supabase.co";
const SB_KEY = "sb_publishable_G1U9iSJLR2JkhD9gvfyY3Q_qaqnMaUk"; // chave pública (anon)
const DIA = 864e5;
const LOTE = 10;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => (v || 0).toLocaleString("pt-PT");
const eur = c => ((c || 0) / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const hoje = () => new Date().toISOString().slice(0, 10);
const fdata = d => d ? new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const ha = d => { if (!d) return "nunca"; const n = Math.floor((Date.now() - new Date(d)) / DIA); return n <= 0 ? "hoje" : n === 1 ? "ontem" : "há " + n + " dias"; };
const primeiro = n => String(n || "").trim().split(/\s+/)[0] || "";
const iniciais = n => String(n || "?").trim().split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
const ls = { get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

/* ================= sessão e acesso aos dados ================= */
let session = ls.get("fk_session", null);
let EU = null, PAPEL = "owner";
const dono = () => PAPEL === "owner";

async function authFetch(path, body) {
  const r = await fetch(SB_URL + "/auth/v1/" + path, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "Não foi possível entrar.");
  return j;
}
async function renovar() {
  if (!session || !session.refresh_token) throw new Error("A sessão expirou. Entra outra vez.");
  const j = await authFetch("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
  session = { access_token: j.access_token, refresh_token: j.refresh_token, user: j.user };
  ls.set("fk_session", session);
}
async function api(path, opt = {}, outraVez = true) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    method: opt.method || "GET",
    headers: Object.assign({ apikey: SB_KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json", Prefer: "return=representation" }, opt.headers || {}),
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  if (r.status === 401 && outraVez) { await renovar(); return api(path, opt, false); }
  const t = await r.text();
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message || t; } catch (e) { } const e = new Error(m || "Erro " + r.status); e.status = r.status; throw e; }
  return t ? JSON.parse(t) : [];
}
// Todas as linhas, 1000 de cada vez (a consulta tem de ter ordem estável).
async function todas(path) {
  const out = [], sep = path.includes("?") ? "&" : "?";
  for (let off = 0; ;) {
    const rows = await api(path + sep + "limit=1000&offset=" + off);
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows); off += rows.length;
    if (out.length > 100000) break;
  }
  return out;
}
const rpc = (nome, body = {}) => api("rpc/" + nome, { method: "POST", body });
async function fn(nome, body, outraVez = true) {
  const r = await fetch("/.netlify/functions/" + nome, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token }, body: JSON.stringify(body) });
  if (r.status === 401 && outraVez) { await renovar(); return fn(nome, body, false); }
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { }
  if (!r.ok) throw new Error(j.error || (r.status === 502 || r.status === 504 ? "O servidor demorou demasiado. Tenta outra vez." : "Erro " + r.status));
  return j;
}

/* ================= avisos e ficha ================= */
let avisoT = null;
function aviso(txt, mau) {
  const a = $("#aviso"); a.textContent = txt; a.className = mau ? "mau" : ""; clearTimeout(avisoT);
  avisoT = setTimeout(() => a.classList.add("hidden"), mau ? 7000 : 3500);
}
// Nenhum erro fica escondido: aparece com o que aconteceu.
window.addEventListener("unhandledrejection", e => { const m = e.reason && e.reason.message || String(e.reason || ""); if (m) aviso("Algo correu mal: " + m, true); });
function abrirFicha(html) { const f = $("#ficha"); f.innerHTML = '<div class="painel">' + html + "</div>"; f.classList.remove("hidden"); const b = f.querySelector(".fechar"); if (b) b.focus(); }
function fecharFicha() { $("#ficha").classList.add("hidden"); $("#ficha").innerHTML = ""; }
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#ficha").classList.contains("hidden")) fecharFicha(); });
$("#ficha").addEventListener("click", e => { if (e.target.id === "ficha" || e.target.closest(".fechar")) fecharFicha(); });

/* ================= dados (carregados só quando são precisos) ================= */
const C = {};
const PESOS = [["Categoria", p => !!p.category, 15], ["Localização", p => !!p.location, 10], ["Descrição", p => !!String(p.bio || "").trim(), 15], ["Foto", p => !!p.photo_url, 15], ["Capa", p => !!p.cover_url, 5], ["Serviço", p => p._servicos > 0, 15], ["Portfólio", p => p._portfolio > 0, 10], ["Verificado", p => !!p.verified, 10], ["Telemóvel", p => !!p._tel, 5]];

async function profissionais(forcar) {
  if (C.pros && !forcar) return C.pros;
  const [perfis, privados, tels, servicos, portfolio, crm, convs] = await Promise.all([
    todas("profiles?select=id,name,category,location,plan,verified,approved,suspended,is_demo,created_at,account_type,bio,photo_url,cover_url,slug,avg_response_minutes&order=created_at.desc,id"),
    todas("rpc/admin_profiles_private?order=id").catch(() => []),
    todas("profile_private?select=profile_id,phone&order=profile_id").catch(() => []),
    todas("services?select=id,professional_id&order=id").catch(() => []),
    todas("portfolio_items?select=id,professional_id&order=id").catch(() => []),
    todas("admin_crm?select=profile_id,stage,notes,next_contact,updated_at&order=profile_id").catch(() => []),
    todas("conversations?select=id,professional_id,is_flinko,created_at&order=id").catch(() => [])
  ]);
  const priv = Object.fromEntries(privados.map(x => [x.id, x]));
  const tel = Object.fromEntries(tels.map(x => [x.profile_id, x.phone]));
  const conta = (rows, k) => rows.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {});
  const nServ = conta(servicos, "professional_id"), nPort = conta(portfolio, "professional_id");
  const nConv = conta(convs.filter(c => !c.is_flinko), "professional_id");
  C.crm = Object.fromEntries(crm.map(x => [x.profile_id, x]));
  C.admins = perfis.filter(p => priv[p.id] && priv[p.id].is_admin).map(p => Object.assign({}, p, priv[p.id]));
  C.clientes = perfis.filter(p => p.account_type === "client" && !(priv[p.id] && priv[p.id].is_admin));
  C.pros = perfis.filter(p => p.account_type !== "client" && !p.is_demo && !(priv[p.id] && priv[p.id].is_admin)).map(p => {
    const x = Object.assign({}, p, priv[p.id] || {}, { _tel: tel[p.id] || "", _servicos: nServ[p.id] || 0, _portfolio: nPort[p.id] || 0, _conversas: nConv[p.id] || 0 });
    x._pontos = PESOS.reduce((s, [, ok, w]) => s + (ok(x) ? w : 0), 0);
    x._falta = PESOS.filter(([, ok]) => !ok(x)).map(([n]) => n);
    return x;
  });
  return C.pros;
}
async function pedidos(forcar) {
  if (C.pedidos && !forcar) return C.pedidos;
  const [reqs, ofertas] = await Promise.all([
    todas("requests?select=id,client_id,title,description,category,location,status,is_urgent,created_at&order=created_at.desc,id"),
    todas("request_offers?select=id,request_id&order=id").catch(() => [])
  ]);
  const n = ofertas.reduce((m, o) => (m[o.request_id] = (m[o.request_id] || 0) + 1, m), {});
  C.pedidos = reqs.map(r => Object.assign(r, { _propostas: n[r.id] || 0 }));
  return C.pedidos;
}
async function leads(forcar) {
  if (C.leads && !forcar) return C.leads;
  const rows = await todas("admin_items?select=id,kind,data&kind=eq.lead&order=id").catch(() => []);
  C.leads = rows.map(r => Object.assign({ log: [] }, r.data || {}, { id: r.id }));
  return C.leads;
}
async function caixa(forcar) {
  if (C.caixa && !forcar) return C.caixa;
  C.caixa = (await fn("admin-flinko-message", { action: "inbox" })).conversations || [];
  return C.caixa;
}
async function emails() {
  if (C.emails) return C.emails;
  const rows = await rpc("admin_pro_emails").catch(() => []);
  C.emails = Object.fromEntries((rows || []).map(r => [r.profile_id, r.email]));
  return C.emails;
}
async function guardarCrm(id, alt) {
  const atual = (C.crm && C.crm[id]) || { profile_id: id, stage: "novo" };
  const novo = Object.assign({}, atual, alt, { profile_id: id, updated_at: new Date().toISOString() });
  await api("admin_crm", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: novo });
  C.crm[id] = novo;
}
async function guardarLead(l) {
  const data = Object.assign({}, l); delete data.id;
  await api("admin_items", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { id: l.id, kind: "lead", data } });
}

/* ================= grupos de profissionais ================= */
const GRUPOS = [
  ["todos", "Todos", p => !p.suspended],
  ["verificar", "Por verificar", p => !p.verified && !p.suspended],
  ["incompleto", "Perfil incompleto", p => p._pontos < 60 && !p.suspended],
  ["novos", "Novos (7 dias)", p => Date.now() - new Date(p.created_at) < 7 * DIA],
  ["parados", "Parados", p => !p.suspended && p._conversas === 0 && Date.now() - new Date(p.created_at) > 30 * DIA],
  ["pago", "Plano pago", p => p.plan && p.plan !== "free"],
  ["suspensos", "Suspensos", p => !!p.suspended]
];
const ETAPAS = { novo: "Por contactar", contactado: "Contactado", a_completar: "A completar o perfil", ativo: "Ativo", inativo: "Inativo" };
const LEAD_ETAPAS = { novo: "Por contactar", contactado: "Contactado", interessado: "Interessado", registado: "Registou-se", perdido: "Não quis" };
const MODELOS = [
  { id: "livre", nome: "Escrever do zero", texto: "" },
  { id: "completar", nome: "Completar o perfil", texto: "Olá {nome}! Para o teu perfil aparecer nas pesquisas de {categoria} falta: {falta}. Demora 5 minutos em flinko.pt/dashboard. Se precisares de ajuda, responde a esta mensagem." },
  { id: "avaliacoes", nome: "Pedir avaliações", texto: "Olá {nome}! Quem procura {categoria} escolhe primeiro quem tem avaliações. No teu painel (menu Avaliações) crias um link e envias aos teus clientes pelo WhatsApp. Eles avaliam em 10 segundos, sem criar conta. Começa pelos 3 que ficaram mais contentes." },
  { id: "link", nome: "Link e QR para divulgar", texto: "Olá {nome}! O teu perfil já pode ter um link com o teu nome (flinko.pt/o-teu-nome) e um código QR, grátis. Escolhe-o no teu painel, em Perfil. Partilha-o com os teus clientes no WhatsApp: quanto mais gente vir o teu perfil, mais pedidos recebes." },
  { id: "reativar", nome: "Voltar ao Flinko", texto: "Olá {nome}! Há algum tempo que não te vemos no Flinko. Queres ajuda para atualizar o perfil e ver os pedidos da tua zona?" },
  { id: "primeiro", nome: "Primeiro contacto (angariação)", texto: "Olá {nome}! Somos do Flinko (flinko.pt), uma plataforma portuguesa onde os clientes encontram profissionais. O perfil é grátis e não cobramos comissão. Queres que te explique em 2 minutos como criar o teu perfil de {categoria}?" }
];
const preencher = (txt, p) => String(txt || "")
  .replace(/\{nome\}/g, primeiro(p.name))
  .replace(/\{categoria\}/g, String(p.category || "a tua área").toLowerCase())
  .replace(/\{falta\}/g, (p._falta || []).slice(0, 3).join(", ").toLowerCase() || "pouca coisa");

/* ================= navegação ================= */
const ICONES = {
  estrategia: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  hoje: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  profissionais: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M22 21c0-3-2-5-5-5.5"/>',
  mensagens: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
  clientes: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>',
  angariacao: '<path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M16 8a5 5 0 0 1 0 8"/>',
  dinheiro: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.1-1.6M12 6v2M12 16v2"/>'
};
const PARTES = [["hoje", "Hoje"], ["estrategia", "Estratégia"], ["profissionais", "Profissionais"], ["mensagens", "Mensagens"], ["clientes", "Clientes e pedidos"], ["angariacao", "Angariação"], ["dinheiro", "Dinheiro e equipa"]];
let parte = "hoje";
function desenharNav(contas = {}) {
  $("#nav").innerHTML = PARTES.map(([id, nome]) => `<a href="#${id}"${id === parte ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id]}</svg><span>${esc(nome)}</span>${contas[id] ? `<span class="conta" aria-label="${contas[id]} por tratar">${contas[id]}</span>` : ""}</a>`).join("");
}
// As partes desenham-se uma de cada vez, por ordem: se mudas de parte enquanto
// a anterior ainda carrega, a anterior não escreve por cima da nova.
let fila = Promise.resolve();
function ir() { fila = fila.then(desenharParte, desenharParte); return fila; }
async function desenharParte() {
  const h = (location.hash || "#hoje").slice(1).split("/")[0];
  parte = PARTES.some(([id]) => id === h) ? h : "hoje";
  desenharNav(C.contas);
  const main = $("#main");
  main.innerHTML = '<p class="vazio">A carregar…</p>';
  try { await VISTAS[parte](main); } catch (e) { main.innerHTML = `<div class="cartao"><h2>Não foi possível carregar esta parte</h2><p class="sub">${esc(e.message)}</p><button class="btn linha" onclick="location.reload()">Tentar outra vez</button></div>`; }
}
window.addEventListener("hashchange", ir);
const topo = (titulo, sub, extra = "") => `<div class="topo"><div><h1>${esc(titulo)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${extra}</div>`;
const av = p => `<span class="av">${p && (p.photo_url || p.photo) ? `<img src="${esc(p.photo_url || p.photo)}" alt="" loading="lazy"/>` : esc(iniciais(p && p.name))}</span>`;
const perfilUrl = p => p.slug ? "/" + encodeURIComponent(p.slug) : "/profile.html?id=" + encodeURIComponent(p.id);

/* ================= 1. Hoje ================= */
const VISTAS = {};
VISTAS.hoje = async main => {
  const [pros, reqs, conv, visitas, verif] = await Promise.all([
    profissionais(), pedidos(), caixa().catch(() => []),
    todas("rpc/admin_visit_rows?p_days=7&order=day,visitor_id").catch(() => null),
    todas("verification_requests?select=id,profile_id,status,created_at&status=eq.pending&order=created_at,id").catch(() => [])
  ]);
  const porVerificar = pros.filter(p => !p.verified && !p.suspended);
  const porResponder = conv.filter(c => c.porResponder);
  const novosPedidos = reqs.filter(r => r.status !== "resolved" && Date.now() - new Date(r.created_at) < 14 * DIA);
  const seguir = pros.filter(p => C.crm[p.id] && C.crm[p.id].next_contact && C.crm[p.id].next_contact <= hoje());
  const ld = await leads().catch(() => []);
  const leadsHoje = ld.filter(l => l.next && l.next <= hoje() && !["registado", "perdido"].includes(l.stage));
  const visit = visitas ? new Set(visitas.map(v => v.visitor_id)).size : null;
  C.contas = { profissionais: porVerificar.length, mensagens: porResponder.length, angariacao: leadsHoje.length };
  desenharNav(C.contas);
  const pedidos7 = reqs.filter(r => Date.now() - new Date(r.created_at) < 7 * DIA).length;
  const item = (p, sub, botao) => `<li>${av(p)}<div class="info"><b>${esc(p.name)}</b><small>${sub}</small></div>${botao}</li>`;
  main.innerHTML = topo("Hoje", new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })) + `
  <div class="grelha g4">
    <div class="cartao kpi"><strong>${num(pros.filter(p => !p.suspended).length)}</strong><span>profissionais ativos</span></div>
    <div class="cartao kpi"><strong>${num(pedidos7)}</strong><span>pedidos de clientes (7 dias)</span></div>
    <div class="cartao kpi"><strong>${visit == null ? "—" : num(visit)}</strong><span>visitantes no site (7 dias)</span></div>
    <div class="cartao kpi"><strong>${num(porResponder.length)}</strong><span>mensagens por responder</span></div>
  </div>
  <h2 style="margin:28px 0 12px">Para fazer hoje</h2>
  <div class="grelha g2">
    <div class="cartao"><h2>Mensagens por responder</h2><p class="sub">Profissionais que escreveram à Flinko e esperam resposta.</p>
      ${porResponder.length ? `<ul class="lista">${porResponder.slice(0, 5).map(c => `<li>${av(c)}<div class="info"><b>${esc(c.name)}</b><small>${esc(c.lastMessage)}</small></div><a class="btn peq" href="#mensagens/${esc(c.id)}">Responder</a></li>`).join("")}</ul>` : `<p class="vazio">Não há mensagens à espera.</p>`}</div>
    <div class="cartao"><h2>Profissionais por verificar</h2><p class="sub">O selo de verificado é o que mais dá confiança aos clientes.${verif.length ? ` ${verif.length} enviaram documentos.` : ""}</p>
      ${porVerificar.length ? `<ul class="lista">${porVerificar.slice(0, 5).map(p => item(p, esc((p.category || "Sem categoria") + " · perfil " + p._pontos + "%"), `<button class="btn peq linha" data-ficha="${esc(p.id)}">Ver</button>`)).join("")}</ul>${porVerificar.length > 5 ? `<a class="btn peq linha" href="#profissionais/verificar">Ver os ${porVerificar.length}</a>` : ""}` : `<p class="vazio">Todos verificados.</p>`}</div>
    <div class="cartao"><h2>Seguimentos marcados para hoje</h2><p class="sub">Profissionais e contactos de angariação com data para hoje ou atrasada.</p>
      ${seguir.length || leadsHoje.length ? `<ul class="lista">${seguir.map(p => item(p, "Profissional · " + esc(ETAPAS[C.crm[p.id].stage] || ""), `<button class="btn peq linha" data-ficha="${esc(p.id)}">Abrir</button>`)).join("")}${leadsHoje.map(l => `<li><span class="av">${esc(iniciais(l.name))}</span><div class="info"><b>${esc(l.name)}</b><small>Angariação · ${esc(LEAD_ETAPAS[l.stage] || "")}</small></div><a class="btn peq linha" href="#angariacao">Abrir</a></li>`).join("")}</ul>` : `<p class="vazio">Nada marcado para hoje. Quando contactares alguém, marca a data do próximo contacto e aparece aqui.</p>`}</div>
    <div class="cartao"><h2>Pedidos de clientes</h2><p class="sub">Pedidos abertos nos últimos 14 dias.</p>
      ${novosPedidos.length ? `<ul class="lista">${novosPedidos.slice(0, 5).map(r => `<li><div class="info"><b>${esc(r.title)}</b><small>${esc(r.category || "")} · ${esc(r.location || "")} · ${ha(r.created_at)}</small></div><span class="tag ${r._propostas ? "verde" : "laranja"}">${r._propostas} propostas</span></li>`).join("")}</ul>` : `<div class="vazio">Ainda não chegaram pedidos. Partilha o link para publicar um pedido nos grupos de Facebook da tua zona.<br/><button class="btn peq linha" data-copiar="https://flinko.pt/pedidos?publicar=1">Copiar o link</button></div>`}</div>
  </div>`;
};

/* ================= 2. Profissionais ================= */
let filtroPros = { grupo: "todos", q: "" };
VISTAS.profissionais = async main => {
  const pros = await profissionais();
  const sub = (location.hash.split("/")[1] || "");
  if (GRUPOS.some(g => g[0] === sub)) filtroPros.grupo = sub;
  main.innerHTML = topo("Profissionais", `${num(pros.length)} contas profissionais. Toca num nome para ver a ficha.`) + `
  <div class="chips" role="group" aria-label="Filtrar">${GRUPOS.map(([id, nome, f]) => `<button type="button" data-grupo="${id}" aria-pressed="${filtroPros.grupo === id}">${esc(nome)}<span>${pros.filter(f).length}</span></button>`).join("")}</div>
  <div class="barra-pesq"><input class="campo" id="pesqPros" type="search" placeholder="Procurar por nome, categoria ou zona" value="${esc(filtroPros.q)}" aria-label="Procurar profissionais"/></div>
  <div class="cartao" style="padding:6px 18px"><ul class="lista" id="listaPros"></ul></div>`;
  const desenhar = () => {
    const g = GRUPOS.find(x => x[0] === filtroPros.grupo) || GRUPOS[0];
    const q = filtroPros.q.trim().toLowerCase();
    const L = pros.filter(g[2]).filter(p => !q || [p.name, p.category, p.location].join(" ").toLowerCase().includes(q));
    $("#listaPros").innerHTML = L.length ? L.map(p => {
      const crm = C.crm[p.id];
      return `<li style="cursor:pointer" data-ficha="${esc(p.id)}">${av(p)}<div class="info"><b>${esc(p.name)}</b><small>${esc(p.category || "Sem categoria")} · ${esc(p.location || "sem zona")}${crm && crm.stage && crm.stage !== "novo" ? " · " + esc(ETAPAS[crm.stage] || crm.stage) : ""}</small></div>
        ${p.verified ? '<span class="tag verde">Verificado</span>' : '<span class="tag laranja">Por verificar</span>'}
        ${p.plan && p.plan !== "free" ? `<span class="tag">${esc(p.plan)}</span>` : ""}
        <span class="pontos${p._pontos < 60 ? " baixo" : ""}" title="Perfil ${p._pontos}%" aria-label="Perfil ${p._pontos}%"><i style="width:${p._pontos}%"></i></span></li>`;
    }).join("") : `<li class="vazio">Ninguém neste grupo${q ? " com essa pesquisa" : ""}.</li>`;
  };
  desenhar();
  $("#pesqPros").addEventListener("input", e => { filtroPros.q = e.target.value; desenhar(); });
  main.querySelectorAll("[data-grupo]").forEach(b => b.addEventListener("click", () => { filtroPros.grupo = b.dataset.grupo; main.querySelectorAll("[data-grupo]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); desenhar(); }));
};

async function fichaPro(id) {
  const pros = await profissionais();
  const p = pros.find(x => x.id === id);
  if (!p) return aviso("Não encontrei este profissional.", true);
  const crm = C.crm[id] || {};
  const wa = window.flinkoWhatsApp && flinkoWhatsApp.numero(p._tel);
  abrirFicha(`
    <div class="cab">${av(p)}<div><h2>${esc(p.name)}</h2><small style="color:var(--muted)">${esc(p.category || "Sem categoria")} · ${esc(p.location || "sem zona")} · desde ${fdata(p.created_at)}</small></div><button class="fechar" aria-label="Fechar">×</button></div>
    <div class="acoes"><a class="btn peq linha" href="${perfilUrl(p)}" target="_blank" rel="noopener">Ver perfil público</a>
      ${p.verified ? '<span class="tag verde">Verificado</span>' : '<span class="tag laranja">Por verificar</span>'} ${p.suspended ? '<span class="tag vermelho">Suspenso</span>' : ""} <span class="tag">${esc(p.plan || "free")}</span></div>
    <div class="seccao"><h3>Contacto</h3>
      <p>${p._tel ? esc(p._tel) : "Sem telemóvel no perfil."}</p>
      <div class="acoes" style="margin-top:8px">
        ${wa ? `<a class="btn peq verde" target="_blank" rel="noopener" href="${esc(flinkoWhatsApp.link(p._tel, "Olá " + primeiro(p.name) + "! "))}">WhatsApp</a>` : ""}
        ${p._tel ? `<a class="btn peq linha" href="tel:${esc(p._tel)}">Ligar</a>` : ""}
        <button class="btn peq linha" data-acao="email">Ver email</button>
        <button class="btn peq" data-acao="mensagem">Mensagem da Flinko</button>
      </div><p class="nota" id="fEmail"></p></div>
    <div class="seccao"><h3>Perfil a ${p._pontos}%</h3>
      <p>${p._falta.length ? "Falta: " + esc(p._falta.join(", ")) + "." : "Perfil completo."}</p>
      <p class="nota">${p._servicos} serviços · ${p._portfolio} fotos de trabalhos · ${p._conversas} conversas com clientes</p></div>
    <div class="seccao"><h3>Ações</h3><div class="acoes">
      <button class="btn peq ${p.verified ? "linha" : "verde"}" data-acao="verificar">${p.verified ? "Retirar verificação" : "Verificar"}</button>
      <button class="btn peq perigo" data-acao="suspender">${p.suspended ? "Reativar conta" : "Suspender"}</button>
      ${dono() ? `<select class="campo" style="width:auto" data-acao="plano" aria-label="Plano">${["free", "starter", "pro", "premium"].map(x => `<option value="${x}"${(p.plan || "free") === x ? " selected" : ""}>Plano ${x}</option>`).join("")}</select>` : ""}
    </div></div>
    <div class="seccao"><h3>Notas e seguimento</h3>
      <label class="rot" for="fEtapa">Estado</label><select class="campo" id="fEtapa">${Object.entries(ETAPAS).map(([k, v]) => `<option value="${k}"${(crm.stage || "novo") === k ? " selected" : ""}>${v}</option>`).join("")}</select>
      <label class="rot" for="fProx">Próximo contacto</label><input class="campo" id="fProx" type="date" value="${esc(crm.next_contact || "")}"/>
      <label class="rot" for="fNotas">Notas</label><textarea class="campo" id="fNotas" placeholder="O que falaram, o que ficou combinado…">${esc(crm.notes || "")}</textarea>
      <button class="btn peq" style="margin-top:10px" data-acao="guardar">Guardar notas</button></div>`);
  const f = $("#ficha");
  f.querySelector('[data-acao="email"]').onclick = async () => { const e = (await emails())[id]; $("#fEmail").innerHTML = e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : "Sem email."; };
  f.querySelector('[data-acao="mensagem"]').onclick = () => { fecharFicha(); location.hash = "#mensagens/enviar/" + id; };
  f.querySelector('[data-acao="verificar"]').onclick = async () => {
    await rpc("admin_set_verified", { p_profile: id, p_value: !p.verified });
    p.verified = !p.verified; aviso(p.verified ? "Verificado." : "Verificação retirada."); fichaPro(id); if (parte === "profissionais" || parte === "hoje") ir();
  };
  f.querySelector('[data-acao="suspender"]').onclick = async () => {
    if (!confirm(p.suspended ? "Reativar a conta de " + p.name + "?" : "Suspender " + p.name + "? O perfil deixa de aparecer no site.")) return;
    await api("profiles?id=eq." + encodeURIComponent(id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { suspended: !p.suspended } });
    p.suspended = !p.suspended; aviso(p.suspended ? "Conta suspensa." : "Conta reativada."); fichaPro(id); ir();
  };
  const pl = f.querySelector('[data-acao="plano"]');
  if (pl) pl.onchange = async () => {
    if (!confirm("Mudar o plano de " + p.name + " para " + pl.value + "?")) { pl.value = p.plan || "free"; return; }
    await fn("admin-set-plan", { targetProfileId: id, plan: pl.value }); p.plan = pl.value; aviso("Plano mudado.");
  };
  f.querySelector('[data-acao="guardar"]').onclick = async () => {
    await guardarCrm(id, { stage: $("#fEtapa").value, next_contact: $("#fProx").value || null, notes: $("#fNotas").value });
    aviso("Notas guardadas.");
  };
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-ficha]"); if (a) { fichaPro(a.dataset.ficha); return; }
  const c = e.target.closest("[data-copiar]"); if (c) { navigator.clipboard.writeText(c.dataset.copiar).then(() => aviso("Link copiado."), () => aviso("Não consegui copiar.", true)); }
});

/* ================= 3. Mensagens ================= */
VISTAS.mensagens = async main => {
  const partes = location.hash.split("/");
  const aba = partes[1] === "enviar" ? "enviar" : "conversas";
  main.innerHTML = topo("Mensagens", "Conversas da Flinko com os profissionais, e envios a um grupo.") + `
  <div class="tabs" role="tablist"><button role="tab" aria-selected="${aba === "conversas"}" data-aba="conversas">Conversas</button><button role="tab" aria-selected="${aba === "enviar"}" data-aba="enviar">Enviar a um grupo</button></div><div id="abaMsg"></div>`;
  main.querySelectorAll("[data-aba]").forEach(b => b.onclick = () => { location.hash = b.dataset.aba === "enviar" ? "#mensagens/enviar" : "#mensagens"; });
  if (aba === "enviar") return enviarGrupo($("#abaMsg"), partes[2]);
  return conversas($("#abaMsg"), partes[1]);
};

async function conversas(box, abrir) {
  const lista = await caixa(true);
  box.innerHTML = `<div class="cartao inbox${abrir ? " a-ler" : ""}" id="inbox"><div class="conversas" id="convs"></div><div class="fio" id="fio"><p class="vazio" style="padding:20px">Escolhe uma conversa.</p></div></div>`;
  if (!lista.length) { box.innerHTML = `<div class="cartao"><p class="vazio">Ainda não há conversas da Flinko. Quando enviares uma mensagem a um profissional, a conversa aparece aqui e as respostas também.</p><a class="btn" href="#mensagens/enviar">Enviar a um grupo</a></div>`; return; }
  $("#convs").innerHTML = lista.map(c => `<button type="button" data-conv="${esc(c.id)}"${c.id === abrir ? ' aria-current="true"' : ""}>${av(c)}<span class="info"><b>${esc(c.name)}</b><small>${esc(c.lastMessage || "")}</small></span>${c.porResponder ? '<span class="tag laranja">Responder</span>' : ""}</button>`).join("");
  $("#convs").querySelectorAll("[data-conv]").forEach(b => b.onclick = () => { location.hash = "#mensagens/" + b.dataset.conv; });
  if (abrir) await fio(lista.find(c => c.id === abrir));
}
async function fio(c) {
  const box = $("#fio");
  if (!c) { box.innerHTML = '<p class="vazio" style="padding:20px">Conversa não encontrada.</p>'; return; }
  box.innerHTML = '<p class="vazio" style="padding:20px">A carregar…</p>';
  const { messages } = await fn("admin-flinko-message", { action: "thread", conversationId: c.id });
  box.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)"><a class="btn peq linha" href="#mensagens" aria-label="Voltar às conversas">←</a>${av(c)}<b>${esc(c.name)}</b><button class="btn peq linha" style="margin-left:auto" data-ficha="${esc(c.professionalId)}">Ficha</button></div>
    <div class="msgs" id="msgs">${messages.map(m => `<div class="bolha ${m.deFlinko ? "eu" : "ele"}">${esc(m.content)}<small>${m.deFlinko ? "Flinko" : esc(primeiro(c.name))} · ${new Date(m.createdAt).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></div>`).join("") || '<p class="vazio">Sem mensagens.</p>'}</div>
    <form id="fResp"><label class="hidden" for="tResp">Resposta</label><textarea class="campo" id="tResp" placeholder="Escreve a resposta. Sai em nome da Flinko." required></textarea><button class="btn laranja" type="submit">Enviar</button></form>`;
  const msgs = $("#msgs"); msgs.scrollTop = msgs.scrollHeight;
  $("#fResp").onsubmit = async e => {
    e.preventDefault();
    const t = $("#tResp").value.trim(); if (!t) return;
    const b = e.target.querySelector("button"); b.disabled = true; b.textContent = "A enviar…";
    try {
      await fn("admin-flinko-message", { action: "reply", conversationId: c.id, message: t });
      aviso("Resposta enviada."); c.porResponder = false; await fio(c);
      C.caixa = null;
    } catch (err) { aviso("Não foi enviada: " + err.message, true); b.disabled = false; b.textContent = "Enviar"; }
  };
}

async function enviarGrupo(box, umId) {
  const pros = await profissionais();
  let escolhidos = new Set(umId ? [umId] : []);
  let grupo = umId ? null : "todos";
  box.innerHTML = `<div class="grelha g2">
    <div class="cartao"><h2>1. Para quem</h2><p class="sub">Escolhe um grupo e tira quem não quiseres.</p>
      <div class="chips" id="gEnv">${GRUPOS.filter(g => g[0] !== "suspensos").map(([id, nome, f]) => `<button type="button" data-g="${id}" aria-pressed="${grupo === id}">${esc(nome)}<span>${pros.filter(f).length}</span></button>`).join("")}</div>
      <div class="destinos" id="destinos"></div><p class="nota" id="nDest"></p></div>
    <div class="cartao"><h2>2. A mensagem</h2>
      <label class="rot" for="canal">Como enviar</label>
      <select class="campo" id="canal"><option value="flinko">Mensagem no Flinko (com aviso por email)</option>${dono() ? '<option value="email">Só email</option>' : ""}</select>
      <div id="assuntoBox" class="hidden"><label class="rot" for="assunto">Assunto do email</label><input class="campo" id="assunto" value="Novidades do Flinko para ti"/></div>
      <label class="rot" for="modelo">Texto pronto</label><select class="campo" id="modelo">${MODELOS.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join("")}</select>
      <label class="rot" for="texto">Mensagem</label><textarea class="campo" id="texto" style="min-height:170px"></textarea>
      <p class="nota">Podes usar {nome}, {categoria} e {falta}: cada pessoa recebe o seu.</p>
      <div id="previa" class="nota"></div>
      <button class="btn laranja" id="bEnviar" style="margin-top:14px;width:100%">Enviar</button>
      <div id="resultado"></div></div></div>`;
  const desenhar = () => {
    const base = grupo ? pros.filter((GRUPOS.find(g => g[0] === grupo) || GRUPOS[0])[2]) : pros.filter(p => escolhidos.has(p.id));
    if (grupo) escolhidos = new Set(base.map(p => p.id));
    $("#destinos").innerHTML = base.map(p => `<label><input type="checkbox" data-id="${esc(p.id)}"${escolhidos.has(p.id) ? " checked" : ""}/> ${esc(p.name)} <small style="color:var(--muted)">${esc(p.category || "")}</small></label>`).join("") || '<p class="vazio">Ninguém neste grupo.</p>';
    $("#destinos").querySelectorAll("input").forEach(i => i.onchange = () => { i.checked ? escolhidos.add(i.dataset.id) : escolhidos.delete(i.dataset.id); conta(); });
    conta();
  };
  const conta = () => { $("#nDest").textContent = escolhidos.size + " selecionado(s)"; $("#bEnviar").textContent = "Enviar a " + escolhidos.size; previa(); };
  const previa = () => { const p = pros.find(x => escolhidos.has(x.id)); const t = $("#texto").value; $("#previa").innerHTML = p && t.trim() ? `<b>Como ${esc(primeiro(p.name))} vai ler:</b><br/>${esc(preencher(t, p))}` : ""; };
  box.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { grupo = b.dataset.g; box.querySelectorAll("[data-g]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); desenhar(); });
  $("#modelo").onchange = () => { const m = MODELOS.find(x => x.id === $("#modelo").value); $("#texto").value = m ? m.texto : ""; previa(); };
  $("#texto").oninput = previa;
  $("#canal").onchange = () => $("#assuntoBox").classList.toggle("hidden", $("#canal").value !== "email");
  desenhar();
  $("#bEnviar").onclick = async () => {
    const texto = $("#texto").value.trim();
    const lista = pros.filter(p => escolhidos.has(p.id));
    if (!lista.length) return aviso("Escolhe pelo menos uma pessoa.", true);
    if (texto.length < 2) return aviso("Escreve a mensagem.", true);
    const canal = $("#canal").value;
    if (!confirm(`Enviar a ${lista.length} profissional(is) ${canal === "email" ? "por email" : "no Flinko, com aviso por email"}? Não dá para desfazer.`)) return;
    await enviarAosPoucos(lista, texto, canal, $("#assunto").value.trim());
  };
}

// Envia em lotes pequenos: cada pedido ao servidor demora poucos segundos,
// longe do limite de 10 s do Netlify. Quem falhar fica na lista para repetir.
async function enviarAosPoucos(lista, texto, canal, assunto) {
  const res = $("#resultado"), b = $("#bEnviar");
  b.disabled = true;
  const ok = [], falhou = [], fora = [];
  res.innerHTML = `<div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="${lista.length}"><i style="width:0"></i></div><p class="nota" id="estado">A enviar…</p>`;
  for (let i = 0; i < lista.length; i += LOTE) {
    const parte = lista.slice(i, i + LOTE);
    const messages = Object.fromEntries(parte.map(p => [p.id, preencher(texto, p)]));
    try {
      const j = canal === "email"
        ? await fn("admin-send-campaign", { action: "send", profileIds: parte.map(p => p.id), subject: assunto || "Novidades do Flinko", message: texto, messages })
        : await fn("admin-flinko-message", { action: "send", profileIds: parte.map(p => p.id), message: texto, messages });
      const enviados = new Set(j.sentIds || []);
      (j.skipped || []).forEach(s => fora.push({ p: parte.find(x => x.id === s.id), motivo: s.reason }));
      (j.failed || []).forEach(s => falhou.push({ p: parte.find(x => x.id === s.id), motivo: s.reason }));
      parte.filter(p => enviados.has(p.id)).forEach(p => ok.push(p));
    } catch (e) { parte.forEach(p => falhou.push({ p, motivo: e.message })); }
    const feito = Math.min(i + LOTE, lista.length);
    res.querySelector(".progresso i").style.width = Math.round(feito / lista.length * 100) + "%";
    res.querySelector(".progresso").setAttribute("aria-valuenow", feito);
    $("#estado").textContent = `A enviar… ${feito} de ${lista.length}`;
  }
  C.caixa = null;
  const linha = x => `<li><div class="info"><b>${esc(x.p ? x.p.name : "?")}</b><small>${esc(x.motivo || "")}</small></div></li>`;
  res.innerHTML = `<div class="cartao" style="margin-top:14px;background:${falhou.length ? "var(--red-soft)" : "var(--mint-soft)"}">
    <h2>${ok.length} enviada(s)${falhou.length ? `, ${falhou.length} falharam` : ""}${fora.length ? `, ${fora.length} ficaram de fora` : ""}</h2>
    ${falhou.length ? `<p class="sub">Falharam:</p><ul class="lista">${falhou.map(linha).join("")}</ul><button class="btn peq" id="repetir">Tentar outra vez só estes</button>` : ""}
    ${fora.length ? `<p class="sub" style="margin-top:10px">Ficaram de fora:</p><ul class="lista">${fora.map(linha).join("")}</ul>` : ""}</div>`;
  b.disabled = false;
  const r = $("#repetir"); if (r) r.onclick = () => enviarAosPoucos(falhou.map(x => x.p).filter(Boolean), texto, canal, assunto);
}

/* ================= 4. Clientes e pedidos ================= */
VISTAS.clientes = async main => {
  const [reqs] = await Promise.all([pedidos(true), profissionais()]);
  const cli = C.clientes || [];
  const nome = Object.fromEntries(cli.map(c => [c.id, c.name]));
  main.innerHTML = topo("Clientes e pedidos", `${num(reqs.length)} pedidos · ${num(cli.length)} clientes com conta`) + `
  <div class="grelha g2">
    <div class="cartao"><h2>Pedidos</h2><p class="sub">O que os clientes pediram e quantas propostas receberam.</p>
      ${reqs.length ? `<ul class="lista">${reqs.map(r => `<li><div class="info"><b>${esc(r.title)}</b><small>${esc(r.category || "")} · ${esc(r.location || "")} · ${esc(nome[r.client_id] || "cliente")} · ${ha(r.created_at)}</small></div>
        <span class="tag ${r._propostas ? "verde" : "laranja"}">${r._propostas} propostas</span>
        <button class="btn peq linha" data-pedido="${esc(r.id)}" data-estado="${r.status === "resolved" ? "open" : "resolved"}">${r.status === "resolved" ? "Reabrir" : "Resolvido"}</button></li>`).join("")}</ul>`
        : `<div class="vazio">Ainda não há pedidos. É o mais importante agora: partilha o link nos grupos de Facebook e com as administradoras de condomínio.<br/><button class="btn peq linha" data-copiar="https://flinko.pt/pedidos?publicar=1">Copiar o link para publicar um pedido</button></div>`}</div>
    <div class="cartao"><h2>Clientes com conta</h2><p class="sub">Quem criou conta para contratar.</p>
      ${cli.length ? `<ul class="lista">${cli.map(c => `<li>${av(c)}<div class="info"><b>${esc(c.name || "Sem nome")}</b><small>conta criada ${ha(c.created_at)}</small></div></li>`).join("")}</ul>` : `<p class="vazio">Ainda não há clientes com conta.</p>`}</div>
  </div>`;
  main.querySelectorAll("[data-pedido]").forEach(b => b.onclick = async () => {
    await api("requests?id=eq." + encodeURIComponent(b.dataset.pedido), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { status: b.dataset.estado } });
    aviso("Pedido atualizado."); ir();
  });
};

/* ================= 5. Angariação ================= */
let filtroLead = "ativos";
VISTAS.angariacao = async main => {
  const L = await leads(true);
  const ativos = l => !["registado", "perdido"].includes(l.stage);
  const vis = L.filter(l => filtroLead === "todos" ? true : filtroLead === "ativos" ? ativos(l) : l.stage === filtroLead).sort((a, b) => String(a.next || "9").localeCompare(String(b.next || "9")));
  main.innerHTML = topo("Angariação", "Profissionais e parceiros que estás a tentar trazer para o Flinko.", '<button class="btn laranja" id="novoLead">Adicionar contacto</button>') + `
  <div class="chips">${[["ativos", "Em curso"], ...Object.entries(LEAD_ETAPAS), ["todos", "Todos"]].map(([k, v]) => `<button type="button" data-fl="${k}" aria-pressed="${filtroLead === k}">${esc(v)}<span>${k === "todos" ? L.length : k === "ativos" ? L.filter(ativos).length : L.filter(l => l.stage === k).length}</span></button>`).join("")}</div>
  <div class="cartao" style="padding:6px 18px">${vis.length ? `<ul class="lista">${vis.map(l => {
    const wa = window.flinkoWhatsApp && flinkoWhatsApp.numero(l.phone);
    const atrasado = l.next && l.next <= hoje();
    return `<li><span class="av">${esc(iniciais(l.name))}</span><div class="info"><b>${esc(l.name)}</b><small>${esc([l.category, l.zone, l.source].filter(Boolean).join(" · "))}${l.next ? ` · próximo contacto ${fdata(l.next)}` : ""}</small></div>
      ${atrasado ? '<span class="tag laranja">Hoje</span>' : ""}<span class="tag">${esc(LEAD_ETAPAS[l.stage] || l.stage || "")}</span>
      ${wa ? `<a class="btn peq verde" target="_blank" rel="noopener" data-wa-lead="${esc(l.id)}" href="${esc(flinkoWhatsApp.link(l.phone, preencher(MODELOS.find(m => m.id === "primeiro").texto, { name: l.name, category: l.category })))}">WhatsApp</a>` : ""}
      <button class="btn peq linha" data-lead="${esc(l.id)}">Abrir</button></li>`;
  }).join("")}</ul>` : `<p class="vazio">Nada aqui. Adiciona os profissionais que encontras (no Facebook, OLX, na rua) e acompanha cada um até se registar.</p>`}</div>`;
  main.querySelectorAll("[data-fl]").forEach(b => b.onclick = () => { filtroLead = b.dataset.fl; ir(); });
  $("#novoLead").onclick = () => fichaLead(null);
  main.querySelectorAll("[data-lead]").forEach(b => b.onclick = () => fichaLead(L.find(l => l.id === b.dataset.lead)));
  main.querySelectorAll("[data-wa-lead]").forEach(a => a.addEventListener("click", async () => {
    const l = L.find(x => x.id === a.dataset.waLead);
    if (l.stage === "novo" || !l.stage) l.stage = "contactado";
    l.log = [{ at: new Date().toISOString(), txt: "WhatsApp · primeiro contacto" }].concat(l.log || []);
    if (!l.next || l.next <= hoje()) l.next = new Date(Date.now() + 3 * DIA).toISOString().slice(0, 10);
    await guardarLead(l).catch(e => aviso("Não guardei o contacto: " + e.message, true));
  }));
};
function fichaLead(l) {
  const novo = !l;
  l = l || { id: uid(), name: "", phone: "", category: "", zone: "", source: "", stage: "novo", next: "", notes: "", created: new Date().toISOString(), log: [] };
  abrirFicha(`<div class="cab"><span class="av">${esc(iniciais(l.name || "+"))}</span><div><h2>${novo ? "Novo contacto" : esc(l.name)}</h2></div><button class="fechar" aria-label="Fechar">×</button></div>
    <form id="fLead">
      <label class="rot" for="lNome">Nome *</label><input class="campo" id="lNome" required value="${esc(l.name)}"/>
      <label class="rot" for="lTel">Telemóvel</label><input class="campo" id="lTel" inputmode="tel" value="${esc(l.phone)}"/>
      <label class="rot" for="lCat">Ofício</label><input class="campo" id="lCat" value="${esc(l.category)}" placeholder="Ex.: Eletricista"/>
      <label class="rot" for="lZona">Zona</label><input class="campo" id="lZona" value="${esc(l.zone)}" placeholder="Ex.: Braga"/>
      <label class="rot" for="lOrig">Onde o encontraste</label><input class="campo" id="lOrig" value="${esc(l.source)}" placeholder="Ex.: Facebook, OLX, indicação"/>
      <label class="rot" for="lEtapa">Estado</label><select class="campo" id="lEtapa">${Object.entries(LEAD_ETAPAS).map(([k, v]) => `<option value="${k}"${l.stage === k ? " selected" : ""}>${v}</option>`).join("")}</select>
      <label class="rot" for="lProx">Próximo contacto</label><input class="campo" id="lProx" type="date" value="${esc(l.next || "")}"/>
      <label class="rot" for="lNotas">Notas</label><textarea class="campo" id="lNotas">${esc(l.notes || "")}</textarea>
      <div class="acoes" style="margin-top:14px"><button class="btn laranja" type="submit">Guardar</button>${novo ? "" : '<button class="btn perigo" type="button" id="apagarLead">Apagar</button>'}</div>
    </form>
    ${(l.log || []).length ? `<div class="seccao"><h3>Histórico</h3><ul class="lista">${l.log.map(x => `<li><div class="info"><b>${esc(x.txt)}</b><small>${fdata(x.at)}</small></div></li>`).join("")}</ul></div>` : ""}`);
  $("#fLead").onsubmit = async e => {
    e.preventDefault();
    Object.assign(l, { name: $("#lNome").value.trim(), phone: $("#lTel").value.trim(), category: $("#lCat").value.trim(), zone: $("#lZona").value.trim(), source: $("#lOrig").value.trim(), stage: $("#lEtapa").value, next: $("#lProx").value, notes: $("#lNotas").value });
    if (!l.name) return aviso("Escreve o nome.", true);
    await guardarLead(l); C.leads = null; fecharFicha(); aviso("Guardado."); ir();
  };
  const ap = $("#apagarLead");
  if (ap) ap.onclick = async () => { if (!confirm("Apagar " + l.name + "?")) return; await api("admin_items?id=eq." + encodeURIComponent(l.id), { method: "DELETE", headers: { Prefer: "return=minimal" } }); C.leads = null; fecharFicha(); ir(); };
}

/* ================= 6. Dinheiro e equipa ================= */
VISTAS.dinheiro = async main => {
  const pros = await profissionais();
  const pagos = pros.filter(p => p.plan && p.plan !== "free");
  main.innerHTML = topo("Dinheiro e equipa", "Planos pagos, recebimentos e quem gere o Flinko.") + `
  <div class="grelha g4" id="stripe">${dono() ? '<div class="cartao"><p class="vazio">A ler a Stripe…</p></div>' : '<div class="cartao"><p class="vazio">Os números da Stripe são só para donos.</p></div>'}</div>
  <div class="grelha g2" style="margin-top:16px">
    <div class="cartao"><h2>Profissionais com plano pago</h2>${pagos.length ? `<ul class="lista">${pagos.map(p => `<li style="cursor:pointer" data-ficha="${esc(p.id)}">${av(p)}<div class="info"><b>${esc(p.name)}</b><small>${esc(p.category || "")}${p.plan_expires_at ? " · até " + fdata(p.plan_expires_at) : ""}</small></div><span class="tag laranja">${esc(p.plan)}</span></li>`).join("")}</ul>` : '<p class="vazio">Ainda ninguém tem plano pago. Quando os perfis tiverem visitas e pedidos, é a altura de propor.</p>'}</div>
    <div class="cartao"><h2>Equipa</h2><p class="sub">Quem tem acesso a este painel.</p><ul class="lista">${(C.admins || []).map(a => `<li>${av(a)}<div class="info"><b>${esc(a.name)}</b><small>${a.admin_role === "support" ? "Apoio (sem dinheiro nem envios em massa)" : "Dono"}</small></div></li>`).join("")}</ul>
      <p class="nota" style="margin-top:12px">RGPD, faturação, registo de ações e o resto continuam no <a href="/admin.html">painel antigo</a>.</p></div>
  </div>`;
  if (!dono()) return;
  try {
    const s = await fn("admin-stripe-summary", {});
    $("#stripe").innerHTML = [[eur(s.last30 && s.last30.net), "recebido nos últimos 30 dias"], [eur(s.mrr), "por mês em assinaturas"], [num(s.subscriptions && s.subscriptions.active), "assinaturas ativas"], [num((s.pastDue || []).length), "pagamentos em atraso"]].map(([v, t]) => `<div class="cartao kpi"><strong>${v}</strong><span>${t}</span></div>`).join("");
  } catch (e) { $("#stripe").innerHTML = `<div class="cartao"><p class="vazio">Não consegui ler a Stripe: ${esc(e.message)}</p></div>`; }
};

/* ================= 7. Estratégia (números e decisões) ================= */
// Junta os números verdadeiros (gestao-numeros.js) com o que dizem os estudos
// (gestao-estrategia.js): situação, porquê, o que fazer e como medir.
let periodo = 30;
const dataMenos = dias => new Date(Date.now() - dias * DIA).toISOString().slice(0, 10);
const variacao = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? 100 : 0);
const seta = v => v > 0 ? `<span class="var sobe">+${v}%</span>` : v < 0 ? `<span class="var desce">${v}%</span>` : '<span class="var">igual</span>';
// Barras horizontais numa tabela: lê-se como gráfico e como tabela (acessível).
function barras(linhas, { rotulo, valor, extra, max } = {}) {
  const m = max || Math.max(1, ...linhas.map(valor));
  return `<table class="barras"><tbody>${linhas.map(l => `<tr><th scope="row">${esc(rotulo(l))}</th><td><span class="barra" style="width:${Math.max(2, valor(l) / m * 100)}%" title="${esc(rotulo(l))}: ${num(valor(l))}"></span></td><td class="v">${num(valor(l))}${extra ? `<small>${extra(l)}</small>` : ""}</td></tr>`).join("")}</tbody></table>`;
}
function colunas(sem, nome) {
  const m = Math.max(1, ...sem.map(s => s.n));
  return `<div class="colunas" role="img" aria-label="${esc(nome)} por semana: ${sem.map(s => fdata(s.desde) + " " + s.n).join(", ")}">${sem.map(s => `<div class="col" title="Semana de ${fdata(s.desde)}: ${s.n}"><span style="height:${Math.max(3, s.n / m * 100)}%"></span><small>${new Date(s.desde).getDate()}/${new Date(s.desde).getMonth() + 1}</small></div>`).join("")}</div>`;
}
VISTAS.estrategia = async main => {
  const N = window.FlinkoNumeros, E = window.FlinkoEstrategia;
  const [pros, reqs, linhas, eventos, wa, avs] = await Promise.all([
    profissionais(), pedidos(),
    todas("rpc/admin_visit_rows?p_days=400&order=day,visitor_id").catch(() => []),
    todas("rpc/admin_event_counts?p_days=" + (periodo * 2) + "&order=day,name").catch(() => []),
    todas("whatsapp_contactos?select=id,professional_id,created_at&order=id").catch(() => []),
    todas("reviews?select=id&order=id").catch(() => [])
  ]);
  const casa = new Set(pros.map(p => p.id).concat((C.admins || []).map(a => a.id)));
  const todos = N.visitantes(linhas, casa);
  const hojeS = hoje(), ini = dataMenos(periodo - 1), iniAnt = dataMenos(periodo * 2 - 1), fimAnt = dataMenos(periodo);
  const vis = todos.filter(v => N.noPeriodo(v, ini, hojeS));
  const visAnt = todos.filter(v => N.noPeriodo(v, iniAnt, fimAnt));
  const ev = (nome, a, b) => eventos.filter(e => e.name === nome && e.day >= a && e.day <= b).reduce((s, e) => s + Number(e.n || 0), 0);
  const reqsP = reqs.filter(r => String(r.created_at).slice(0, 10) >= ini);
  const reqsAnt = reqs.filter(r => { const d = String(r.created_at).slice(0, 10); return d >= iniAnt && d <= fimAnt; });
  const caminho = N.caminho(vis);
  caminho.splice(3, 0, { passo: "Carregaram em contactar", n: ev("perfil_contactar", ini, hojeS) + wa.filter(w => String(w.created_at).slice(0, 10) >= ini).length });
  caminho[4] = { passo: "Publicaram um pedido", n: reqsP.length };
  const caminhoBase = N.caminho(vis);
  const canais = N.porCanal(vis);
  const po = N.procuraOferta(vis, pros, reqsP);
  const distritos = N.porDistrito(pros, reqs);
  const comContacto = new Set(wa.map(w => w.professional_id).concat(pros.filter(p => p._conversas > 0).map(p => p.id)));
  const cpro = N.caminhoPro(pros, comContacto);
  const faltas = {}; pros.forEach(p => (p._falta || []).forEach(f => faltas[f] = (faltas[f] || 0) + 1));
  const faltaMaisComum = Object.entries(faltas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => f.toLowerCase() + " (" + n + ")").join(", ");
  const recs = N.recomendacoes({ dias: periodo, avaliacoes: avs.length, caminho: [caminhoBase[0], caminhoBase[1], caminhoBase[2], { n: reqsP.length }], canais, procuraOferta: po, distritos, caminhoPro: cpro, faltaMaisComum });
  const plano = E.plano(recs);
  const sem = N.semanas(todos, 12, hojeS);
  const semPros = N.contarPorSemana(pros.map(p => p.created_at), sem);
  const semReqs = N.contarPorSemana(reqs.map(r => r.created_at), sem);
  const pctTxt = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
  const kpi = (v, t, delta) => `<div class="cartao kpi"><strong>${v}</strong><span>${t}</span>${delta == null ? "" : `<div>${seta(delta)} <small class="nota">vs. ${periodo} dias antes</small></div>`}</div>`;

  main.innerHTML = topo("Estratégia", "Os teus números, comparados com o que dizem os estudos, e o que fazer a seguir.",
    `<div class="chips" role="group" aria-label="Período" style="margin:0">${[7, 30, 90].map(d => `<button type="button" data-per="${d}" aria-pressed="${periodo === d}">${d} dias</button>`).join("")}</div>`) + `
  <div class="grelha g4">
    ${kpi(num(vis.length), "visitantes reais (sem a equipa nem os profissionais)", variacao(vis.length, visAnt.length))}
    ${kpi(num(reqsP.length), "pedidos publicados", variacao(reqsP.length, reqsAnt.length))}
    ${kpi(pctTxt(caminhoBase[2].n, vis.length), "dos visitantes viram um perfil")}
    ${kpi(pctTxt(cpro[1].n, cpro[0].n), "dos profissionais com o perfil completo (60% ou mais)")}
  </div>

  <h2 class="tit-sec">O que fazer agora</h2>
  <p class="intro-sec">Cada recomendação vem dos teus números deste período. Abre para ver a situação, o que dizem os estudos, os passos e como medir.</p>
  <div class="recs">${recs.map((r, i) => `<details class="cartao rec"${i < 2 ? " open" : ""}><summary><span class="tag ${r.prioridade === 1 ? "vermelho" : r.prioridade === 2 ? "laranja" : ""}">${r.prioridade === 1 ? "Esta semana" : r.prioridade === 2 ? "Este mês" : "Depois"}</span><b>${esc(r.titulo)}</b></summary>
    <div class="rec-corpo"><h4>A situação</h4><p>${esc(r.situacao)}</p><h4>O que dizem os estudos</h4><p>${esc(r.estudo)}</p><h4>O que fazer</h4><ol>${r.passos.map(p => `<li>${esc(p)}</li>`).join("")}</ol><h4>Como medir</h4><p>${esc(r.medir)}</p></div></details>`).join("") || '<p class="vazio">Sem recomendações neste período.</p>'}</div>

  <h2 class="tit-sec">Plano para as próximas 4 semanas</h2>
  <div class="grelha g4">${plano.map(s => `<div class="cartao"><h3>${esc(s.semana)}</h3><ul class="plano">${s.foco.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("")}</div>

  <h2 class="tit-sec">Os números em detalhe</h2>
  <div class="grelha g2">
    <div class="cartao"><h2>Caminho do cliente</h2><p class="sub">Dos visitantes reais deste período, quantos chegaram a cada passo. Onde a barra cai mais é onde se perde gente.</p>
      ${barras(caminho, { rotulo: l => l.passo, valor: l => l.n, max: Math.max(1, caminho[0].n) })}
      <p class="nota">Referência: em sites de serviços, só uma pequena parte de quem visita chega a pedir. Com poucas visitas, os pedidos são 0 ou 1. Por isso a primeira alavanca é trazer mais gente.</p></div>
    <div class="cartao"><h2>De onde vêm os visitantes</h2><p class="sub">Primeira origem de cada visitante real. Ao lado, quantos chegaram a um perfil ou aos pedidos.</p>
      ${canais.length ? barras(canais, { rotulo: l => l.canal, valor: l => l.visitantes, extra: l => ` · ${l.viramPerfil} viram perfis` }) : '<p class="vazio">Sem visitas neste período.</p>'}
      <p class="nota">"Direto" é quem escreveu o endereço ou veio de uma app (WhatsApp, por exemplo).</p></div>
    <div class="cartao"><h2>Semana a semana</h2><p class="sub">Últimas 12 semanas. Cada gráfico tem a sua escala.</p>
      <h4 class="mini">Visitantes reais</h4>${colunas(sem, "Visitantes reais")}
      <h4 class="mini">Profissionais novos</h4>${colunas(semPros, "Profissionais novos")}
      <h4 class="mini">Pedidos publicados</h4>${colunas(semReqs, "Pedidos publicados")}</div>
    <div class="cartao"><h2>Caminho do profissional</h2><p class="sub">Dos profissionais com conta, quantos chegaram a cada passo.</p>
      ${barras(cpro, { rotulo: l => l.passo, valor: l => l.n, max: Math.max(1, cpro[0].n) })}
      <p class="nota">O que mais falta nos perfis: ${esc(faltaMaisComum || "nada")}.</p></div>
  </div>
  <div class="cartao" style="margin-top:16px"><h2>Procura e oferta por ofício</h2><p class="sub">Procura = visitantes que viram a página do ofício + pedidos. Prontos = profissionais com o perfil a 60% ou mais.</p>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Ofício</th><th>Procura</th><th>Pedidos</th><th>Profissionais</th><th>Prontos</th><th>Leitura</th></tr></thead><tbody>${po.map(c => {
      const leitura = (c.procura + c.pedidos) > 0 && c.prontos === 0 ? '<span class="tag vermelho">Falta oferta: angariar</span>' : c.prontos >= 2 && !c.procura && !c.pedidos ? '<span class="tag laranja">Sem procura: divulgar</span>' : (c.procura + c.pedidos) > 0 ? '<span class="tag verde">Equilibrado</span>' : '<span class="tag">Pouco movimento</span>';
      return `<tr><th scope="row">${esc(c.categoria)}</th><td>${c.procura}</td><td>${c.pedidos}</td><td>${c.profissionais}</td><td>${c.prontos}</td><td>${leitura}</td></tr>`;
    }).join("")}</tbody></table></div></div>
  <div class="cartao" style="margin-top:16px"><h2>Por distrito</h2><p class="sub">Onde estão os profissionais e os pedidos (desde sempre). O distrito com mais profissionais é o melhor sítio para concentrar o marketing de clientes.</p>
    ${distritos.length ? barras(distritos.slice(0, 12), { rotulo: l => l.distrito, valor: l => l.profissionais, extra: l => ` · ${l.pedidos} pedidos` }) : '<p class="vazio">Sem dados.</p>'}</div>

  <h2 class="tit-sec">O que dizem os estudos</h2>
  <p class="intro-sec">Boas práticas de quem já fez crescer marketplaces, aplicadas ao Flinko.</p>
  <div class="recs">${E.TEMAS.map(t => `<details class="cartao rec"><summary><b>${esc(t.titulo)}</b></summary><div class="rec-corpo"><p class="lead-rec">${esc(t.resumo)}</p>
    <h4>Estudos e fontes</h4><ul class="fontes">${t.estudos.map(s => `<li><b>${esc(s.fonte)}</b><br/>${esc(s.ideia)}</li>`).join("")}</ul>
    <h4>Aplicado ao Flinko</h4><p class="pre">${esc(t.aplicado)}</p><h4>Passos</h4><ol>${t.passos.map(p => `<li>${esc(p)}</li>`).join("")}</ol></div></details>`).join("")}</div>

  <h2 class="tit-sec">Políticas da plataforma</h2>
  <p class="intro-sec">As regras que dão confiança a clientes e profissionais: o que já tens e o que falta.</p>
  <div class="grelha g2">${E.POLITICAS.map(p => `<div class="cartao"><div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><h2>${esc(p.titulo)}</h2><span class="tag ${p.estado === "tens" ? "verde" : p.estado === "parcial" ? "laranja" : "vermelho"}">${p.estado === "tens" ? "Já tens" : p.estado === "parcial" ? "Em parte" : "Falta"}</span></div>
    <p class="sub" style="margin-top:6px"><b>Agora:</b> ${esc(p.agora)}</p><p><b>Recomendado:</b> ${esc(p.recomendado)}</p><p class="nota">Porquê: ${esc(p.porque)}</p></div>`).join("")}</div>

  <h2 class="tit-sec">Concorrência em Portugal</h2>
  <p class="intro-sec">Como funcionam as alternativas que os teus clientes e profissionais conhecem, e onde o Flinko ganha.</p>
  <div class="tabela-wrap cartao" style="padding:0"><table class="tabela"><thead><tr><th>Quem</th><th>Como funciona</th><th>Ponto forte</th><th>Ponto fraco</th><th>Onde o Flinko ganha</th></tr></thead><tbody>${E.CONCORRENCIA.map(c => `<tr><th scope="row">${esc(c.nome)}</th><td>${esc(c.como)}</td><td>${esc(c.forte)}</td><td>${esc(c.fraco)}</td><td>${esc(c.flinko)}</td></tr>`).join("")}</tbody></table></div>
  <p class="nota" style="margin-top:8px">Informação da concorrência tirada do que os sites mostram publicamente. Confirma antes de usar em público.</p>`;
  main.querySelectorAll("[data-per]").forEach(b => b.onclick = () => { periodo = Number(b.dataset.per); ir(); });
};

/* ================= arranque ================= */
async function quemSou() {
  const eu = (await rpc("get_my_profile"))[0];
  if (!eu || !eu.is_admin) throw new Error("Esta conta não tem acesso ao painel de gestão.");
  EU = eu; PAPEL = eu.admin_role || "owner";
}
async function arrancar() {
  try { await quemSou(); }
  catch (e) { session = null; ls.set("fk_session", null); $("#login").classList.remove("hidden"); if (e.message) $("#lErro").textContent = e.message; return; }
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#quem").textContent = (EU.name || session.user.email) + (dono() ? " · dono" : " · apoio");
  ir();
}
$("#formLogin").addEventListener("submit", async e => {
  e.preventDefault(); $("#lErro").textContent = "";
  try { const j = await authFetch("token?grant_type=password", { email: $("#lEmail").value.trim(), password: $("#lPass").value }); session = { access_token: j.access_token, refresh_token: j.refresh_token, user: j.user }; ls.set("fk_session", session); arrancar(); }
  catch (err) { $("#lErro").textContent = err.message; }
});
$("#sair").onclick = () => { ls.set("fk_session", null); location.reload(); };
if (session) arrancar(); else $("#login").classList.remove("hidden");
