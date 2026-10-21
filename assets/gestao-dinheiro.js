// Painel de gestão: "Dinheiro e equipa" completo (fase 3 do painel único).
// Traz do painel antigo Finanças e Faturação, arrumados em 4 separadores:
// Resumo (Stripe, caixa, quanto tempo a caixa aguenta, valor por cliente),
// Movimentos (o livro de receitas e despesas), Faturas e Preços e projeção.
// Os dados são os mesmos do antigo: admin_items (ledger, invoice) e
// admin_settings (prices, costs, proj, cash0, churn).
"use strict";

/* ---- formulário genérico numa ficha lateral (também usado no marketing) ---- */
function formulario(titulo, campos, valores = {}) {
  return new Promise(resolve => {
    abrirFicha(`<div class="cab"><div><h2>${esc(titulo)}</h2></div><button class="fechar" aria-label="Fechar">×</button></div>
      <form id="fGen">${campos.map(c => {
        const v = valores[c.k] != null ? valores[c.k] : (c.def != null ? c.def : "");
        const id = "g_" + c.k;
        const campo = c.type === "select"
          ? `<select class="campo" id="${id}">${c.opts.map(o => { const [k, n] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}"${String(v) === String(k) ? " selected" : ""}>${esc(n)}</option>`; }).join("")}</select>`
          : c.type === "textarea" ? `<textarea class="campo" id="${id}"${c.req ? " required" : ""}>${esc(v)}</textarea>`
          : `<input class="campo" id="${id}" type="${c.type || "text"}"${c.type === "number" ? ' step="0.01"' : ""}${c.req ? " required" : ""} value="${esc(v)}"${c.ph ? ` placeholder="${esc(c.ph)}"` : ""}/>`;
        return `<label class="rot" for="${id}">${esc(c.label)}${c.req ? " *" : ""}</label>${campo}`;
      }).join("")}<button class="btn laranja" type="submit" style="margin-top:14px">Guardar</button></form>`);
    const f = $("#ficha");
    const fechar = () => { obs.disconnect(); resolve(null); };
    const obs = new MutationObserver(() => { if (f.classList.contains("hidden")) fechar(); });
    obs.observe(f, { attributes: true, attributeFilter: ["class"] });
    $("#fGen").onsubmit = e => {
      e.preventDefault(); obs.disconnect();
      const r = {}; campos.forEach(c => { const el = $("#g_" + c.k); r[c.k] = c.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value; });
      fecharFicha(); resolve(r);
    };
  });
}
const euro = v => (Number(v) || 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

const PRECOS_BASE = { starter: 9.99, pro: 19.99, premium: 29.99 };
const PROJ_BASE = { newPros: 10, conv: 5, growth: 5, avgPrice: 19.99 };
const CATS_MOV = ["Subscrições", "Construtor IA", "Anúncios (receita)", "Marketing", "Software / infraestrutura", "Legal e contabilidade", "Deslocações", "Impostos", "Outros"];
const CAMPOS_MOV = [{ k: "date", label: "Data", type: "date", req: 1, def: hoje() }, { k: "type", label: "Tipo", type: "select", opts: [["despesa", "Despesa"], ["receita", "Receita"]] }, { k: "category", label: "Categoria", type: "select", opts: CATS_MOV }, { k: "desc", label: "Descrição", req: 1 }, { k: "amount", label: "Valor (€)", type: "number", req: 1 }, { k: "ref", label: "Nº fatura / referência" }];
const CAMPOS_FAT = () => [{ k: "number", label: "Número", req: 1 }, { k: "date", label: "Data de emissão", type: "date", def: hoje() }, { k: "due", label: "Vencimento", type: "date", def: diaMais(15) }, { k: "client", label: "Cliente", req: 1 }, { k: "description", label: "Descrição", req: 1 }, { k: "net", label: "Valor sem IVA (€)", type: "number", req: 1 }, { k: "vat", label: "IVA (%)", type: "number", def: 23 }, { k: "status", label: "Estado", type: "select", opts: [["rascunho", "Rascunho"], ["emitida", "Emitida"], ["paga", "Paga"], ["anulada", "Anulada"]] }];
const comIva = i => (+i.net || 0) * (1 + (+i.vat || 0) / 100);

async function contas() {
  const [L, def, pros] = await Promise.all([itens("ledger", true), definicoes(true), profissionais()]);
  const mes = (d, off = 0) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth() + off, 1); };
  const chave = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); };
  const por = {}; L.forEach(e => { const k = String(e.date).slice(0, 7); por[k] = por[k] || { r: 0, d: 0 }; if (e.type === "receita") por[k].r += +e.amount || 0; else por[k].d += +e.amount || 0; });
  const meses = Array.from({ length: 6 }, (_, i) => chave(mes(Date.now(), i - 5)));
  const caixa0 = +def.cash0 || 0, caixa = caixa0 + L.reduce((s, e) => s + (e.type === "receita" ? 1 : -1) * (+e.amount || 0), 0);
  const ult3 = Array.from({ length: 3 }, (_, i) => chave(mes(Date.now(), -i - 1)));
  const consumo = ult3.reduce((s, k) => s + ((por[k] || {}).d || 0) - ((por[k] || {}).r || 0), 0) / 3;
  const mkt90 = L.filter(e => e.type === "despesa" && /marketing|anúnc|anunc/i.test(e.category) && Date.now() - new Date(e.date) < 90 * DIA).reduce((s, e) => s + (+e.amount || 0), 0);
  const novos90 = pros.filter(p => Date.now() - new Date(p.created_at) < 90 * DIA).length;
  const precos = Object.assign({}, PRECOS_BASE, def.prices || {});
  const pagos = pros.filter(p => p.plan && p.plan !== "free" && !p.suspended);
  const mrrEst = pagos.reduce((s, p) => s + (+precos[p.plan] || 0), 0);
  const churn = (+def.churn || 5) / 100, arpu = pagos.length ? mrrEst / pagos.length : Object.assign({}, PROJ_BASE, def.proj || {}).avgPrice;
  const custos = (def.costs || []).reduce((s, c) => s + (+c.amount || 0), 0);
  return { L, def, por, meses, caixa0, caixa, consumo, runway: consumo > 0 ? caixa / consumo : null, cac: novos90 ? mkt90 / novos90 : 0, mkt90, novos90, precos, pagos, mrrEst, churn, ltv: churn ? arpu / churn : 0, arpu, custos };
}
function colunasEuro(meses, valor, nome) {
  const vals = meses.map(valor), m = Math.max(1, ...vals);
  return `<div class="colunas" role="img" aria-label="${esc(nome)}: ${meses.map((k, i) => k + " " + euro(vals[i])).join(", ")}">${meses.map((k, i) => `<div class="col" title="${k}: ${euro(vals[i])}"><span style="height:${Math.max(3, vals[i] / m * 100)}%"></span><small>${k.slice(5)}/${k.slice(2, 4)}</small></div>`).join("")}</div>`;
}

const VISTA_DINHEIRO_BASE = VISTAS.dinheiro;
VISTAS.dinheiro = async main => {
  const aba = location.hash.split("/")[1] || "";
  const ABAS = [["", "Resumo"], ["movimentos", "Movimentos"], ["faturas", "Faturas"], ["precos", "Preços e projeção"]];
  const tabs = `<div class="tabs" role="tablist" style="flex-wrap:wrap">${ABAS.map(([k, n]) => `<button role="tab" data-din="${k}" aria-selected="${aba === k}">${n}</button>`).join("")}</div>`;
  const ligarTabs = () => main.querySelectorAll("[data-din]").forEach(b => b.onclick = () => { location.hash = "#dinheiro" + (b.dataset.din ? "/" + b.dataset.din : ""); });
  if (aba === "movimentos") { await vistaMovimentos(main, tabs); return ligarTabs(); }
  if (aba === "faturas") { await vistaFaturas(main, tabs); return ligarTabs(); }
  if (aba === "precos") { await vistaPrecos(main, tabs); return ligarTabs(); }
  await VISTA_DINHEIRO_BASE(main);
  main.querySelector(".topo").insertAdjacentHTML("afterend", tabs); ligarTabs();
  const K = await contas();
  const kpi = (v, t, s) => `<div class="cartao kpi"><strong>${v}</strong><span>${t}</span>${s ? `<div class="nota">${s}</div>` : ""}</div>`;
  main.querySelector(".grelha.g2").insertAdjacentHTML("beforebegin", `
    <h2 class="tit-sec">Caixa e saúde financeira</h2><p class="intro-sec">A partir dos movimentos que registas (separador Movimentos) e do saldo inicial.</p>
    <div class="grelha g4">
      ${kpi(euro(K.caixa), "caixa atual", "saldo inicial " + euro(K.caixa0) + " + movimentos")}
      ${kpi(K.consumo > 0 ? euro(K.consumo) : "—", "gasto líquido por mês (média de 3 meses)", K.consumo > 0 ? "despesas menos receitas" : "sem consumo de caixa")}
      ${kpi(K.runway ? K.runway.toFixed(1) + " meses" : K.L.length ? "sem risco" : "—", "quanto tempo a caixa aguenta", "ao ritmo de gasto atual")}
      ${kpi(euro(K.mrrEst), "por mês em planos (estimativa)", K.pagos.length + " profissionais com plano pago")}
      ${kpi(K.cac ? euro(K.cac) : "—", "custo por profissional novo (CAC)", euro(K.mkt90) + " de marketing ÷ " + K.novos90 + " novos em 90 dias")}
      ${kpi(euro(K.ltv), "valor de um cliente pagante (LTV)", euro(K.arpu) + "/mês ÷ " + (K.churn * 100).toFixed(0) + "% que desistem por mês")}
      ${kpi(K.cac ? (K.ltv / K.cac).toFixed(1) + "×" : "—", "LTV ÷ CAC", "acima de 3× é saudável")}
      ${kpi(euro(K.custos), "custos fixos por mês", "editar em Preços e projeção")}
    </div>
    <div class="grelha g2" style="margin-top:16px"><div class="cartao"><h2>Receitas por mês</h2>${colunasEuro(K.meses, k => (K.por[k] || {}).r || 0, "Receitas")}</div><div class="cartao"><h2>Despesas por mês</h2>${colunasEuro(K.meses, k => (K.por[k] || {}).d || 0, "Despesas")}</div></div>
    <h2 class="tit-sec">Planos e equipa</h2>`);
  if (dono()) {
    try {
      const s = await fn("admin-stripe-summary", {});
      const mais = `<div class="grelha g4" style="margin-top:16px">${kpi(euro((s.last30 && s.last30.refunds || 0) / 100), "reembolsos (30 dias)")}${kpi(euro((s.last30 && s.last30.fees || 0) / 100), "comissões da Stripe (30 dias)")}${kpi(euro((s.balance && s.balance.available || 0) / 100), "saldo disponível na Stripe", "a caminho: " + euro((s.balance && s.balance.pending || 0) / 100))}${kpi(num((s.churned30 || []).length), "cancelamentos (30 dias)")}</div>
        ${(s.pastDue || []).length ? `<div class="cartao" style="margin-top:16px"><h2>Pagamentos em atraso</h2><ul class="lista">${s.pastDue.map(x => { const p = (C.pros || []).find(y => y.id === (x.customer || {}).profile_id); const wa = p && window.flinkoWhatsApp && flinkoWhatsApp.numero(p._tel); return `<li><div class="info"><b>${esc((x.customer || {}).name || "Cliente")}</b><small>${euro((x.monthly || 0) / 100)}/mês</small></div>${wa ? `<a class="btn peq verde" target="_blank" rel="noopener" href="${esc(flinkoWhatsApp.link(p._tel, SEG_TEXTOS.d10.replace("{nome}", primeiro(p.name))))}">WhatsApp</a>` : ""}${p ? `<button class="btn peq linha" data-ficha="${esc(p.id)}">Ficha</button>` : ""}</li>`; }).join("")}</ul></div>` : ""}`;
      $("#stripe").insertAdjacentHTML("afterend", mais);
    } catch (e) { }
  }
};

/* ---- Movimentos ---- */
async function vistaMovimentos(main, tabs) {
  const K = await contas();
  const L = K.L.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  main.innerHTML = topo("Dinheiro e equipa", "O livro de receitas e despesas do Flinko.", '<button class="btn laranja" id="novoMov">Novo movimento</button>') + tabs + `
    <div class="grelha g2" style="margin-bottom:16px"><div class="cartao"><h2>Pressupostos</h2>
      <label class="rot" for="cx0">Saldo inicial da conta (€)</label><input class="campo" id="cx0" type="number" step="0.01" value="${K.caixa0}"/>
      <label class="rot" for="churn">Percentagem de clientes pagantes que desistem por mês (%)</label><input class="campo" id="churn" type="number" step="0.1" min="0" value="${(K.churn * 100).toFixed(1)}"/>
      <button class="btn peq" id="gPress" style="margin-top:10px">Guardar</button></div>
      <div class="cartao kpi"><strong>${euro(K.caixa)}</strong><span>caixa atual</span></div></div>
    <div class="cartao">${L.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th></th></tr></thead><tbody>${L.map(e => `<tr><td>${fdata(e.date)}</td><td><span class="tag ${e.type === "receita" ? "verde" : "laranja"}">${e.type === "receita" ? "Receita" : "Despesa"}</span></td><td>${esc(e.category || "")}</td><td>${esc(e.desc || "")}${e.ref ? `<br/><small class="nota">${esc(e.ref)}</small>` : ""}</td><td><b>${e.type === "receita" ? "" : "−"}${euro(e.amount)}</b></td><td style="white-space:nowrap"><button class="btn peq linha" data-ed-mov="${esc(e.id)}">Editar</button> <button class="btn peq perigo" data-ap-mov="${esc(e.id)}" aria-label="Apagar">×</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Ainda não há movimentos. Regista as despesas (domínio, anúncios, contabilista) e as receitas para veres a caixa e quanto tempo aguenta.</p>'}</div>`;
  $("#novoMov").onclick = async () => { const r = await formulario("Novo movimento", CAMPOS_MOV); if (r) { await guardarItem("ledger", r); aviso("Movimento registado."); ir(); } };
  main.querySelectorAll("[data-ed-mov]").forEach(b => b.onclick = async () => { const e = L.find(x => x.id === b.dataset.edMov); const r = await formulario("Editar movimento", CAMPOS_MOV, e); if (r) { await guardarItem("ledger", Object.assign({}, e, r)); aviso("Guardado."); ir(); } });
  main.querySelectorAll("[data-ap-mov]").forEach(b => b.onclick = async () => { if (!confirm("Apagar este movimento?")) return; await api("admin_items?id=eq." + encodeURIComponent(b.dataset.apMov), { method: "DELETE", headers: { Prefer: "return=minimal" } }); C.itens.ledger = null; ir(); });
  $("#gPress").onclick = async () => { await guardarDefinicao("cash0", Number($("#cx0").value) || 0); await guardarDefinicao("churn", Number($("#churn").value) || 0); aviso("Guardado."); ir(); };
}

/* ---- Faturas ---- */
async function vistaFaturas(main, tabs) {
  const I = (await itens("invoice", true)).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const td = hoje(), vivas = I.filter(i => !["anulada", "rascunho"].includes(i.status)), porReceber = vivas.filter(i => i.status === "emitida"), atrasadas = porReceber.filter(i => i.due && i.due < td);
  const tri = Math.floor(new Date().getMonth() / 3), noTri = i => { const d = new Date(i.date); return d.getFullYear() === new Date().getFullYear() && Math.floor(d.getMonth() / 3) === tri; };
  const proximoNumero = () => { const y = new Date().getFullYear(); return `FT ${y}/${String(I.filter(i => String(i.number).includes(y + "/")).length + 1).padStart(3, "0")}`; };
  const ESTADO = { rascunho: ["Rascunho", ""], emitida: ["Emitida", "laranja"], paga: ["Paga", "verde"], anulada: ["Anulada", "vermelho"] };
  main.innerHTML = topo("Dinheiro e equipa", "Controlo das faturas que emites e do IVA.", '<button class="btn laranja" id="novaFat">Nova fatura</button>') + tabs + `
    <p class="nota" style="margin-bottom:12px">Isto é um controlo interno. As faturas legais têm de ser emitidas num programa certificado pela Autoridade Tributária. Confirma o IVA e os prazos com o teu contabilista.</p>
    <div class="grelha g4" style="margin-bottom:16px">
      <div class="cartao kpi"><strong>${euro(vivas.filter(i => String(i.date).slice(0, 7) === td.slice(0, 7)).reduce((s, i) => s + (+i.net || 0), 0))}</strong><span>emitido este mês (sem IVA)</span></div>
      <div class="cartao kpi"><strong>${euro(porReceber.reduce((s, i) => s + comIva(i), 0))}</strong><span>por receber (${porReceber.length} faturas)</span></div>
      <div class="cartao kpi"><strong>${atrasadas.length}</strong><span>em atraso (${euro(atrasadas.reduce((s, i) => s + comIva(i), 0))})</span></div>
      <div class="cartao kpi"><strong>${euro(vivas.filter(noTri).reduce((s, i) => s + (+i.net || 0) * (+i.vat || 0) / 100, 0))}</strong><span>IVA deste trimestre</span></div></div>
    <div class="cartao">${I.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Descrição</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${I.map(i => `<tr><td><b>${esc(i.number)}</b></td><td>${fdata(i.date)}<br/><small class="nota">vence ${fdata(i.due)}</small></td><td>${esc(i.client)}</td><td>${esc(i.description)}</td><td><b>${euro(comIva(i))}</b><br/><small class="nota">${euro(i.net)} + IVA ${+i.vat || 0}%</small></td><td><span class="tag ${(ESTADO[i.status] || ["", ""])[1]}">${(ESTADO[i.status] || [i.status])[0]}</span>${i.status === "emitida" && i.due && i.due < td ? ' <span class="tag vermelho">Atrasada</span>' : ""}</td>
      <td style="white-space:nowrap">${i.status === "emitida" ? `<button class="btn peq verde" data-paga="${esc(i.id)}">Paga</button> ` : ""}<button class="btn peq linha" data-ed-fat="${esc(i.id)}">Editar</button> <button class="btn peq perigo" data-ap-fat="${esc(i.id)}" aria-label="Apagar">×</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Ainda não há faturas registadas.</p>'}</div>`;
  $("#novaFat").onclick = async () => { const r = await formulario("Nova fatura", CAMPOS_FAT(), { number: proximoNumero(), status: "emitida", vat: 23 }); if (r) { await guardarItem("invoice", r); aviso("Fatura registada."); ir(); } };
  main.querySelectorAll("[data-ed-fat]").forEach(b => b.onclick = async () => { const i = I.find(x => x.id === b.dataset.edFat); const r = await formulario("Editar fatura", CAMPOS_FAT(), i); if (r) { await guardarItem("invoice", Object.assign({}, i, r)); aviso("Guardado."); ir(); } });
  main.querySelectorAll("[data-ap-fat]").forEach(b => b.onclick = async () => { if (!confirm("Apagar esta fatura do controlo?")) return; await api("admin_items?id=eq." + encodeURIComponent(b.dataset.apFat), { method: "DELETE", headers: { Prefer: "return=minimal" } }); C.itens.invoice = null; ir(); });
  main.querySelectorAll("[data-paga]").forEach(b => b.onclick = async () => {
    const i = I.find(x => x.id === b.dataset.paga);
    if (!confirm(`${i.number} passa a paga e entra uma receita de ${euro(i.net)} (sem IVA) nos movimentos. Continuar?`)) return;
    await guardarItem("invoice", Object.assign({}, i, { status: "paga", paid_at: hoje() }));
    await guardarItem("ledger", { date: hoje(), type: "receita", category: "Subscrições", desc: `${i.number} · ${i.client}`, amount: +i.net, ref: i.number });
    aviso("Marcada como paga."); ir();
  });
}

/* ---- Preços e projeção ---- */
async function vistaPrecos(main, tabs) {
  const K = await contas();
  const pj = Object.assign({}, PROJ_BASE, K.def.proj || {}), custos = K.def.costs || [];
  let pros = (C.pros || []).filter(p => !p.suspended).length, pagantes = K.pagos.length, acum = 0;
  const linhas = [];
  for (let m = 1; m <= 12; m++) {
    const novos = pj.newPros * Math.pow(1 + pj.growth / 100, m - 1);
    pros += novos; pagantes += novos * pj.conv / 100;
    const rec = pagantes * pj.avgPrice, liq = rec - K.custos; acum += liq;
    linhas.push({ m, pros: Math.round(pros), pagantes: Math.round(pagantes * 10) / 10, rec, liq, acum });
  }
  const equilibrio = linhas.find(l => l.liq >= 0);
  main.innerHTML = topo("Dinheiro e equipa", "Preços dos planos, custos fixos e projeção a 12 meses.") + tabs + `
    <div class="grelha g2">
      <div class="cartao"><h2>Preços dos planos (€/mês)</h2><p class="sub">Usados para estimar a receita. Os preços cobrados são os da Stripe.</p>
        ${["starter", "pro", "premium"].map(k => `<label class="rot" for="pr_${k}">${k[0].toUpperCase() + k.slice(1)}</label><input class="campo" id="pr_${k}" type="number" step="0.01" value="${K.precos[k]}"/>`).join("")}
        <button class="btn peq" id="gPrecos" style="margin-top:10px">Guardar preços</button></div>
      <div class="cartao"><h2>Custos fixos por mês</h2><p class="sub">Domínio, Supabase, Netlify, contabilista…</p>
        <ul class="lista" id="listaCustos">${custos.map((c, i) => `<li><div class="info"><b>${esc(c.name)}</b></div><b>${euro(c.amount)}</b><button class="btn peq perigo" data-ap-custo="${i}" aria-label="Apagar">×</button></li>`).join("") || '<li class="vazio">Sem custos registados.</li>'}</ul>
        <div class="barra-pesq" style="margin-top:10px"><label class="hidden" for="cNome">Custo</label><input class="campo" id="cNome" placeholder="Ex.: Supabase"/><label class="hidden" for="cValor">Valor</label><input class="campo" id="cValor" type="number" step="0.01" placeholder="€/mês" style="flex:0 1 120px;min-width:100px"/><button class="btn peq" id="jCusto">Juntar</button></div>
        <p class="nota">Total: <b>${euro(K.custos)}</b> por mês.</p></div></div>
    <div class="cartao" style="margin-top:16px"><h2>Projeção a 12 meses</h2><p class="sub">Muda os pressupostos e vê quando o Flinko começa a pagar os custos.</p>
      <div class="grelha g4">
        <div><label class="rot" for="pj_newPros">Profissionais novos por mês</label><input class="campo" id="pj_newPros" type="number" value="${pj.newPros}"/></div>
        <div><label class="rot" for="pj_growth">Crescimento mensal (%)</label><input class="campo" id="pj_growth" type="number" step="0.1" value="${pj.growth}"/></div>
        <div><label class="rot" for="pj_conv">Passam a plano pago (%)</label><input class="campo" id="pj_conv" type="number" step="0.1" value="${pj.conv}"/></div>
        <div><label class="rot" for="pj_avgPrice">Preço médio (€/mês)</label><input class="campo" id="pj_avgPrice" type="number" step="0.01" value="${pj.avgPrice}"/></div></div>
      <button class="btn peq" id="gProj" style="margin-top:10px">Recalcular</button>
      <p style="margin-top:12px">${equilibrio ? `Ao fim de <b>${equilibrio.m} ${equilibrio.m === 1 ? "mês" : "meses"}</b> as receitas passam a pagar os custos fixos.` : "Com estes números, as receitas ainda não pagam os custos em 12 meses."}</p>
      <div class="tabela-wrap" style="margin-top:10px"><table class="tabela"><thead><tr><th>Mês</th><th>Profissionais</th><th>Pagantes</th><th>Receita</th><th>Resultado</th><th>Acumulado</th></tr></thead><tbody>${linhas.map(l => `<tr><td>${l.m}</td><td>${l.pros}</td><td>${l.pagantes}</td><td>${euro(l.rec)}</td><td style="color:${l.liq < 0 ? "var(--red)" : "var(--mint-dark)"}">${euro(l.liq)}</td><td>${euro(l.acum)}</td></tr>`).join("")}</tbody></table></div></div>`;
  $("#gPrecos").onclick = async () => { await guardarDefinicao("prices", { starter: +$("#pr_starter").value || 0, pro: +$("#pr_pro").value || 0, premium: +$("#pr_premium").value || 0 }); aviso("Preços guardados."); ir(); };
  $("#jCusto").onclick = async () => { const n = $("#cNome").value.trim(), v = Number($("#cValor").value); if (!n) return aviso("Escreve o nome do custo.", true); await guardarDefinicao("costs", custos.concat([{ name: n, amount: v || 0 }])); aviso("Custo juntado."); ir(); };
  main.querySelectorAll("[data-ap-custo]").forEach(b => b.onclick = async () => { await guardarDefinicao("costs", custos.filter((_, i) => i !== Number(b.dataset.apCusto))); ir(); });
  $("#gProj").onclick = async () => { await guardarDefinicao("proj", { newPros: +$("#pj_newPros").value || 0, growth: +$("#pj_growth").value || 0, conv: +$("#pj_conv").value || 0, avgPrice: +$("#pj_avgPrice").value || 0 }); ir(); };
}
