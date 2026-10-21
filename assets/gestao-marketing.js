// Painel de gestão: "Angariação e marketing" completo (fase 3 do painel único).
// Traz do painel antigo: importar uma lista de contactos, o guia de angariação
// e cobrança com os textos prontos, campanhas (gasto e custo por registo),
// calendário de publicações e o gerador de links com UTM (para saber de onde
// vêm as visitas). Dados: admin_items (lead, template, campaign, post).
"use strict";

const CANAIS = ["Instagram", "Facebook", "Google Ads", "Cartazes / flyers", "Presencial", "WhatsApp", "Email", "Parceria", "Outro"];
const CAMPOS_CAMP = [{ k: "name", label: "Campanha", req: 1 }, { k: "channel", label: "Canal", type: "select", opts: CANAIS }, { k: "start", label: "Início", type: "date", def: hoje() }, { k: "end", label: "Fim", type: "date" }, { k: "spend", label: "Gasto (€)", type: "number" }, { k: "signups", label: "Registos que trouxe", type: "number" }, { k: "status", label: "Estado", type: "select", opts: [["planeada", "Planeada"], ["ativa", "Ativa"], ["terminada", "Terminada"]] }, { k: "notes", label: "Notas", type: "textarea" }];
const CAMPOS_POST = [{ k: "date", label: "Data", type: "date", def: hoje() }, { k: "channel", label: "Canal", type: "select", opts: CANAIS }, { k: "text", label: "Texto ou ideia", type: "textarea", req: 1 }, { k: "status", label: "Estado", type: "select", opts: [["ideia", "Ideia"], ["agendado", "Agendado"], ["publicado", "Publicado"]] }];

const VISTA_ANGARIACAO_BASE = VISTAS.angariacao;
VISTAS.angariacao = async main => {
  const aba = location.hash.split("/")[1] || "";
  const ABAS = [["", "Contactos"], ["guias", "Guias e textos"], ["marketing", "Campanhas e publicações"]];
  const tabs = `<div class="tabs" role="tablist" style="flex-wrap:wrap">${ABAS.map(([k, n]) => `<button role="tab" data-ang="${k}" aria-selected="${aba === k}">${n}</button>`).join("")}</div>`;
  const ligar = () => main.querySelectorAll("[data-ang]").forEach(b => b.onclick = () => { location.hash = "#angariacao" + (b.dataset.ang ? "/" + b.dataset.ang : ""); });
  if (aba === "guias") { await vistaGuias(main, tabs); return ligar(); }
  if (aba === "marketing") { await vistaMarketing(main, tabs); return ligar(); }
  await VISTA_ANGARIACAO_BASE(main);
  const t = main.querySelector(".topo");
  t.insertAdjacentHTML("afterend", tabs); ligar();
  t.lastElementChild.insertAdjacentHTML("beforebegin", '<button class="btn linha" id="bImportar">Importar lista</button>');
  $("#bImportar").onclick = importarLista;
};

/* ---- importar contactos (colar texto) ---- */
function importarLista() {
  abrirFicha(`<div class="cab"><div><h2>Importar lista de contactos</h2></div><button class="fechar" aria-label="Fechar">×</button></div>
    <p class="nota">Cola uma linha por pessoa: <b>nome; telemóvel; ofício; zona</b>. Também serve copiar de uma folha de Excel (colunas separadas por tabulação).</p>
    <label class="rot" for="impTxt">Contactos</label><textarea class="campo" id="impTxt" style="min-height:200px" placeholder="Carlos Pinto; 912 000 111; Canalizador; Braga"></textarea>
    <label class="rot" for="impOrig">Onde os encontraste</label><input class="campo" id="impOrig" placeholder="Ex.: Facebook, OLX"/>
    <p class="nota" id="impPrev"></p><button class="btn laranja" id="impOk" style="margin-top:10px">Importar</button>`);
  const ler = () => $("#impTxt").value.split(/\n+/).map(l => l.split(/;|\t/).map(x => x.trim())).filter(c => c[0]);
  $("#impTxt").oninput = () => { const L = ler(); $("#impPrev").textContent = L.length ? L.length + " contacto(s) prontos a importar." : ""; };
  $("#impOk").onclick = async () => {
    const L = ler(); if (!L.length) return aviso("Cola pelo menos uma linha.", true);
    const existentes = new Set((await leads(true)).map(l => String(l.phone || "").replace(/\D/g, "").slice(-9)).filter(Boolean));
    let novos = 0, repetidos = 0;
    for (const [name, phone, category, zone] of L) {
      const k = String(phone || "").replace(/\D/g, "").slice(-9);
      if (k && existentes.has(k)) { repetidos++; continue; }
      existentes.add(k);
      await guardarLead({ id: uid(), name, phone: phone || "", category: category || "", zone: zone || "", source: $("#impOrig").value.trim(), stage: "novo", next: "", notes: "", created: new Date().toISOString(), log: [] });
      novos++;
    }
    C.leads = null; fecharFicha();
    aviso(`${novos} contacto(s) importados${repetidos ? `, ${repetidos} já existiam (mesmo telemóvel)` : ""}.`); ir();
  };
}

/* ---- guias e textos prontos ---- */
let guiaAtual = "atrair";
async function vistaGuias(main, tabs) {
  const G = (window.FlinkoGuias || []).filter(g => g.id !== "resultados");
  const g = G.find(x => x.id === guiaAtual) || G[0];
  const contactos = (await itens("contact").catch(() => [])).filter(c => c.tpl);
  const porModelo = contactos.reduce((m, c) => { const k = c.tpl || "—"; m[k] = (m[k] || 0) + 1; return m; }, {});
  main.innerHTML = topo("Angariação", "Como angariar profissionais e clientes, ativá-los e fazê-los pagar, com textos prontos.") + tabs + `
    <div class="chips">${G.map(x => `<button type="button" data-guia="${esc(x.id)}" aria-pressed="${x.id === g.id}">${esc(x.title)}</button>`).join("")}</div>
    <div class="cartao"><h2>${esc(g.title)}</h2><p style="margin:6px 0 12px;max-width:70em">${esc(g.intro || "")}</p>
      ${(g.blocks || []).map((b, i) => b.t ? `<div class="cartao texto-pronto" style="margin-top:10px;background:var(--bg)"><b>${esc(b.t.name)}</b>${b.t.promo ? ' <span class="tag laranja">Só a quem consentiu</span>' : ""}<p style="white-space:pre-wrap;margin:6px 0">${esc(b.t.text)}</p>${b.t.tip ? `<p class="nota">${esc(b.t.tip)}</p>` : ""}<div class="acoes"><button class="btn peq linha" data-copiar="${esc(b.t.text)}">Copiar</button><button class="btn peq linha" data-guardar-guia="${i}">Guardar como modelo</button></div></div>`
        : `${b.h ? `<h3 style="margin:16px 0 6px">${esc(b.h)}</h3>` : ""}${b.p ? `<p>${esc(b.p)}</p>` : ""}${b.ul ? `<ul style="padding-left:20px;display:grid;gap:6px">${b.ul.map(li => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}${b.note ? `<p class="nota">${esc(b.note)}</p>` : ""}`).join("")}
      <p class="nota" style="margin-top:14px">Os textos usam {nome}, {categoria} e {falta}: em Mensagens, cada pessoa recebe o seu. Os outros ({data}, {valor}, {link}) preenches tu.</p></div>
    <div class="cartao" style="margin-top:16px"><h2>Que textos já usaste</h2><p class="sub">Contactos registados por texto (WhatsApp, email, seguimentos).</p>
      ${Object.keys(porModelo).length ? `<ul class="lista">${Object.entries(porModelo).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li><div class="info"><b>${esc(k)}</b></div><span class="tag">${n}</span></li>`).join("")}</ul>` : '<p class="vazio">Ainda não há contactos registados.</p>'}</div>`;
  main.querySelectorAll("[data-guia]").forEach(b => b.onclick = () => { guiaAtual = b.dataset.guia; ir(); });
  main.querySelectorAll("[data-guardar-guia]").forEach(b => b.onclick = async () => {
    const t = g.blocks[Number(b.dataset.guardarGuia)].t;
    await api("admin_items", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { id: uid(), kind: "template", data: { name: t.name, text: t.text, publico: g.id === "clientes" ? "clientes" : "pros", promo: t.promo ? 1 : 0 } } });
    C.modelos = null; aviso("Guardado nos teus modelos (Mensagens).");
  });
}

/* ---- campanhas, publicações e links UTM ---- */
async function vistaMarketing(main, tabs) {
  const [camps, posts] = await Promise.all([itens("campaign", true), itens("post", true)]);
  const gasto = camps.reduce((s, c) => s + (+c.spend || 0), 0), registos = camps.reduce((s, c) => s + (+c.signups || 0), 0);
  const porCanal = {}; camps.forEach(c => { const k = c.channel || "Outro"; porCanal[k] = porCanal[k] || { gasto: 0, reg: 0, n: 0 }; porCanal[k].gasto += +c.spend || 0; porCanal[k].reg += +c.signups || 0; porCanal[k].n++; });
  const melhor = Object.entries(porCanal).filter(([, v]) => v.reg && v.gasto).sort((a, b) => a[1].gasto / a[1].reg - b[1].gasto / b[1].reg)[0];
  const P = posts.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ESTP = { ideia: "Ideia", agendado: "Agendado", publicado: "Publicado" };
  main.innerHTML = topo("Angariação", "Campanhas, quanto custa cada registo, e o que vais publicar.") + tabs + `
    <div class="grelha g4" style="margin-bottom:16px">
      <div class="cartao kpi"><strong>${camps.length}</strong><span>campanhas (${camps.filter(c => c.status === "ativa").length} ativas)</span></div>
      <div class="cartao kpi"><strong>${euro(gasto)}</strong><span>gasto total</span></div>
      <div class="cartao kpi"><strong>${registos}</strong><span>registos que trouxeram</span></div>
      <div class="cartao kpi"><strong>${registos ? euro(gasto / registos) : "—"}</strong><span>custo por registo${melhor ? " · melhor canal: " + esc(melhor[0]) : ""}</span></div></div>
    <div class="grelha g2">
      <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2>Campanhas</h2><button class="btn peq laranja" id="novaCamp">Nova campanha</button></div>
        ${camps.length ? `<ul class="lista">${camps.map(c => `<li style="flex-wrap:wrap"><div class="info" style="min-width:180px"><b>${esc(c.name)}</b><small>${esc(c.channel || "")} · ${esc(c.status || "")} · desde ${fdata(c.start)}</small></div><span class="tag">${euro(c.spend)} · ${+c.signups || 0} registos${+c.signups ? " · " + euro((+c.spend || 0) / c.signups) + "/registo" : ""}</span><button class="btn peq linha" data-ed-camp="${esc(c.id)}">Editar</button><button class="btn peq perigo" data-ap="${esc(c.id)}" data-kind="campaign" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Sem campanhas. Regista cada ação paga ou feita à mão (anúncios, cartazes, parcerias) com o gasto e os registos que trouxe, para saberes o que compensa.</p>'}
        ${Object.keys(porCanal).length ? `<h3 style="margin-top:14px">Por canal</h3><ul class="lista">${Object.entries(porCanal).map(([k, v]) => `<li><div class="info"><b>${esc(k)}</b><small>${v.n} campanha(s)</small></div><span class="tag">${euro(v.gasto)} · ${v.reg} registos${v.reg ? " · " + euro(v.gasto / v.reg) + "/registo" : ""}</span></li>`).join("")}</ul>` : ""}</div>
      <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2>Publicações</h2><button class="btn peq laranja" id="novoPost">Nova publicação</button></div>
        ${P.length ? `<ul class="lista">${P.map(p => `<li style="flex-wrap:wrap"><div class="info" style="min-width:180px"><b>${fdata(p.date)} · ${esc(p.channel || "")}</b><small style="white-space:normal">${esc(p.text)}</small></div><select class="campo" style="width:auto" data-est-post="${esc(p.id)}" aria-label="Estado">${Object.entries(ESTP).map(([k, v]) => `<option value="${k}"${p.status === k ? " selected" : ""}>${v}</option>`).join("")}</select><button class="btn peq perigo" data-ap="${esc(p.id)}" data-kind="post" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Sem publicações planeadas. Planeia 3 por semana: trabalhos reais dos profissionais, dicas de preços, pedidos que chegaram.</p>'}</div></div>
    <div class="cartao" style="margin-top:16px"><h2>Link de campanha (UTM)</h2><p class="sub">Usa um link diferente em cada canal para saberes de onde vêm as visitas. A origem aparece depois na Estratégia.</p>
      <div class="grelha g4"><div><label class="rot" for="u_base">Endereço</label><input class="campo" id="u_base" value="https://flinko.pt"/></div><div><label class="rot" for="u_source">Origem</label><input class="campo" id="u_source" placeholder="facebook"/></div><div><label class="rot" for="u_medium">Meio</label><input class="campo" id="u_medium" placeholder="grupo"/></div><div><label class="rot" for="u_campaign">Campanha</label><input class="campo" id="u_campaign" placeholder="braga-outubro"/></div></div>
      <div class="barra-pesq" style="margin-top:10px"><label class="hidden" for="u_out">Link</label><input class="campo" id="u_out" readonly/><button class="btn peq" id="uCopiar">Copiar</button></div></div>`;
  const utm = () => { const g = id => encodeURIComponent(($("#u_" + id).value || "").trim().toLowerCase().replace(/\s+/g, "-")); const b = ($("#u_base").value || "https://flinko.pt").trim(); const p = ["source", "medium", "campaign"].filter(k => g(k)).map(k => "utm_" + k + "=" + g(k)); $("#u_out").value = b + (p.length ? (b.includes("?") ? "&" : "?") + p.join("&") : ""); };
  ["base", "source", "medium", "campaign"].forEach(k => $("#u_" + k).addEventListener("input", utm)); utm();
  $("#uCopiar").onclick = () => navigator.clipboard.writeText($("#u_out").value).then(() => aviso("Link copiado."), () => aviso("Não consegui copiar.", true));
  $("#novaCamp").onclick = async () => { const r = await formulario("Nova campanha", CAMPOS_CAMP, { status: "ativa" }); if (r) { await guardarItem("campaign", r); aviso("Campanha registada."); ir(); } };
  main.querySelectorAll("[data-ed-camp]").forEach(b => b.onclick = async () => { const c = camps.find(x => x.id === b.dataset.edCamp); const r = await formulario("Editar campanha", CAMPOS_CAMP, c); if (r) { await guardarItem("campaign", Object.assign({}, c, r)); aviso("Guardado."); ir(); } });
  $("#novoPost").onclick = async () => { const r = await formulario("Nova publicação", CAMPOS_POST, { status: "ideia" }); if (r) { await guardarItem("post", r); aviso("Publicação planeada."); ir(); } };
  main.querySelectorAll("[data-est-post]").forEach(s => s.onchange = async () => { const p = posts.find(x => x.id === s.dataset.estPost); await guardarItem("post", Object.assign({}, p, { status: s.value })); aviso("Estado atualizado."); });
  main.querySelectorAll("[data-ap]").forEach(b => b.onclick = async () => { if (!confirm("Apagar?")) return; await api("admin_items?id=eq." + encodeURIComponent(b.dataset.ap), { method: "DELETE", headers: { Prefer: "return=minimal" } }); C.itens[b.dataset.kind] = null; ir(); });
}
