// Painel de gestão: pesquisa global (Ctrl+K ou o botão "Procurar" no menu).
// Encontra profissionais, clientes, contactos de angariação, pedidos de
// clientes e pedidos de apoio, e abre o sítio certo. Fase 1 do painel único.
"use strict";

function abrirPesquisa() {
  abrirFicha(`<div class="cab"><div style="flex:1"><label class="hidden" for="pq">Procurar</label><input class="campo" id="pq" type="search" placeholder="Procurar pessoas, pedidos, contactos…" autocomplete="off"/></div><button class="fechar" aria-label="Fechar">×</button></div>
    <p class="nota">Nome, ofício, zona, telefone, email ou título de um pedido. Pelo menos 2 letras.</p><ul class="lista" id="pqRes" style="margin-top:10px"></ul>`);
  const input = $("#pq"); input.focus();
  let fontes = null;
  const carregar = async () => {
    if (fontes) return fontes;
    const [pros, reqs, lds, mod, mails] = await Promise.all([profissionais(), pedidos().catch(() => []), leads().catch(() => []), (window.dadosModeracao ? dadosModeracao() : Promise.resolve({ apoio: [], denuncias: [] })).catch(() => ({ apoio: [], denuncias: [] })), emails().catch(() => ({}))]);
    fontes = { pros, clientes: C.clientes || [], reqs, lds, tickets: (mod.apoio || []).concat(mod.denuncias || []), mails };
    return fontes;
  };
  const resultados = (F, q) => {
    const tem = (...v) => v.join(" ").toLowerCase().includes(q);
    const r = [];
    F.pros.forEach(p => { if (tem(p.name, p.category, p.location, p._tel, F.mails[p.id])) r.push({ tipo: "Profissional", nome: p.name, sub: [p.category, p.location].filter(Boolean).join(" · "), abrir: () => fichaPro(p.id), p }); });
    F.clientes.forEach(c => { if (tem(c.name, F.mails[c.id])) r.push({ tipo: "Cliente", nome: c.name || "Sem nome", sub: F.mails[c.id] || "cliente", abrir: () => { fecharFicha(); location.hash = "#mensagens/enviar/" + c.id; }, p: c }); });
    F.lds.forEach(l => { if (tem(l.name, l.phone, l.category, l.zone)) r.push({ tipo: "Angariação", nome: l.name, sub: [l.category, l.zone, l.phone].filter(Boolean).join(" · "), abrir: () => { fecharFicha(); location.hash = "#angariacao"; setTimeout(() => fichaLead(l), 400); } }); });
    F.reqs.forEach(x => { if (tem(x.title, x.category, x.location, x.description)) r.push({ tipo: "Pedido", nome: x.title, sub: [x.category, x.location].filter(Boolean).join(" · "), abrir: () => { fecharFicha(); location.hash = "#clientes"; } }); });
    F.tickets.forEach(t => { if (tem(t.subject, t.name, t.email, t.message, t.text)) r.push({ tipo: t.kind === "denuncia" ? "Denúncia" : "Apoio", nome: t.subject || "(sem assunto)", sub: t.name || "", abrir: () => { fecharFicha(); location.hash = "#moderacao/" + (t.kind === "denuncia" ? "denuncias" : "apoio"); } }); });
    return r.slice(0, 30);
  };
  let atual = [];
  input.addEventListener("input", async () => {
    const q = input.value.trim().toLowerCase(), res = $("#pqRes");
    if (q.length < 2) { res.innerHTML = ""; return; }
    res.innerHTML = '<li class="vazio">A procurar…</li>';
    const F = await carregar();
    if (input.value.trim().toLowerCase() !== q) return;
    atual = resultados(F, q);
    res.innerHTML = atual.length ? atual.map((x, i) => `<li><button type="button" class="pq-item" data-i="${i}">${x.p ? av(x.p) : `<span class="av">${esc(iniciais(x.nome))}</span>`}<span class="info"><b>${esc(x.nome)}</b><small>${esc(x.tipo)}${x.sub ? " · " + esc(x.sub) : ""}</small></span></button></li>`).join("") : '<li class="vazio">Nada encontrado.</li>';
    res.querySelectorAll(".pq-item").forEach(b => b.onclick = () => atual[Number(b.dataset.i)].abrir());
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && atual[0]) { e.preventDefault(); atual[0].abrir(); } });
}
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !$("#app").classList.contains("hidden")) { e.preventDefault(); abrirPesquisa(); }
});
(function () {
  const b = document.createElement("button");
  b.type = "button"; b.className = "procurar"; b.id = "bProcurar";
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Procurar</span><kbd>Ctrl K</kbd>';
  b.onclick = abrirPesquisa;
  const marca = document.querySelector(".marca"); if (marca) marca.after(b);
})();
