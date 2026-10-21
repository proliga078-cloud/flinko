// Painel de gestão: parte "Empresa" (fase 4 do painel único).
// Traz do painel antigo a Equipa (quem tem acesso e com que papel), o
// Registo de ações (admin_audit, escrito pela base de dados), Conformidade e
// riscos, Contactos e processos, notas de reunião e o estado das notificações.
// Os dados são os mesmos do antigo: rpc admin_team / admin_set_role,
// admin_items (risk, contact, sop, note) e admin_settings (checks).
"use strict";

VISTAS.empresa = async main => {
  const aba = location.hash.split("/")[1] || "";
  const ABAS = [["", "Equipa"], ["registo", "Registo de ações"], ["conformidade", "Conformidade e riscos"], ["contactos", "Contactos e processos"]];
  const tabs = `<div class="tabs" role="tablist" style="flex-wrap:wrap">${ABAS.map(([k, n]) => `<button role="tab" data-emp="${k}" aria-selected="${aba === k}">${n}</button>`).join("")}</div>`;
  await ({ registo: vistaRegisto, conformidade: vistaConformidade, contactos: vistaContactos }[aba] || vistaEquipa)(main, tabs);
  main.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { location.hash = "#empresa" + (b.dataset.emp ? "/" + b.dataset.emp : ""); });
};

/* ---- Equipa ---- */
const PAPEIS = { owner: "Dono (tudo)", support: "Apoio (sem dinheiro nem permissões)" };
async function vistaEquipa(main, tabs) {
  let equipa = null, erro = "";
  try { equipa = await rpc("admin_team"); } catch (e) { erro = "Não foi possível ler a equipa. Tenta outra vez daqui a pouco."; }
  const podeMudar = dono();
  main.innerHTML = topo("Empresa", "Quem gere o Flinko, o que foi feito no painel e as obrigações da empresa.", podeMudar ? '<button class="btn laranja" id="darAcesso">Dar acesso</button>' : "") + tabs + `
    <div class="cartao"><h2>Quem tem acesso ao painel</h2>
      ${erro ? `<p class="vazio">${esc(erro)}</p>` : `<ul class="lista longa">${equipa.map(m => `<li style="flex-wrap:wrap"><div class="info" style="min-width:180px"><b>${esc(m.name || "Sem nome")}</b><small>${esc(m.email || "")}</small></div>
        ${podeMudar ? `<select class="campo" style="width:auto" data-papel="${esc(m.email)}" aria-label="Papel de ${esc(m.name || m.email)}">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}"${m.admin_role === k ? " selected" : ""}>${v}</option>`).join("")}</select><button class="btn peq perigo" data-tirar="${esc(m.email)}">Tirar acesso</button>` : `<span class="tag">${esc(PAPEIS[m.admin_role] || m.admin_role)}</span>`}</li>`).join("")}</ul>`}
      <p class="nota" style="margin-top:12px"><b>Dono</b> faz tudo: planos, reembolsos, Stripe, RGPD, envios em grupo e esta lista. <b>Apoio</b> trata verificações, moderação e pedidos de apoio, mas não mexe em dinheiro nem em acessos. É a base de dados que o impede, não só o botão escondido. Fica sempre pelo menos um dono.</p></div>`;
  if (!podeMudar) return;
  const mudar = async (email, papel) => {
    const msg = papel === "none" ? `${email} deixa de ter acesso ao painel. Continuar?` : `${email} passa a ${PAPEIS[papel]}. Continuar?`;
    if (!confirm(msg)) return ir();
    try { await rpc("admin_set_role", { p_email: email, p_role: papel }); aviso("Acesso atualizado."); }
    catch (e) { aviso(/dono/i.test(e.message) ? "Tem de ficar pelo menos um dono." : /exist|encontr/i.test(e.message) ? "Não há nenhuma conta Flinko com esse email. A pessoa tem de se registar primeiro." : "Não foi possível mudar o acesso. Tenta outra vez.", true); }
    ir();
  };
  main.querySelectorAll("[data-papel]").forEach(s => s.onchange = () => mudar(s.dataset.papel, s.value));
  main.querySelectorAll("[data-tirar]").forEach(b => b.onclick = () => mudar(b.dataset.tirar, "none"));
  $("#darAcesso").onclick = async () => {
    const r = await formulario("Dar acesso ao painel", [{ k: "email", label: "Email da conta Flinko da pessoa (tem de estar registada)", type: "email", req: 1 }, { k: "role", label: "Papel", type: "select", opts: Object.entries(PAPEIS) }], { role: "support" });
    if (r) mudar(r.email.trim(), r.role);
  };
}

/* ---- Registo de ações ---- */
const ACOES = { perfil_alterado: "Perfil alterado", perfil_apagado: "Conta apagada", avaliacao_apagada: "Avaliação apagada", avaliacao_alterada: "Avaliação alterada", pedido_estado: "Pedido de cliente", pedido_apagado: "Pedido apagado", rgpd_estado: "RGPD", rgpd_exportacao: "RGPD: exportação", rgpd_eliminacao: "RGPD: eliminação", verificacao_estado: "Verificação", plano_alterado: "Plano", reembolso: "Reembolso", email_massa: "Email em grupo" };
const nomeAcao = a => ACOES[a] || a;
let rgQ = "", rgA = "", rgD = 30;
async function vistaRegisto(main, tabs) {
  const [A, notif] = await Promise.all([auditoria(), todas("notification_queue?select=id,status,kind,created_at&order=id").catch(() => null)]);
  const acoes = [...new Set(A.map(r => r.action))];
  const filtrar = () => A.filter(r => (!rgA || r.action === rgA) && (!rgD || Date.now() - new Date(r.at) < rgD * DIA) && (!rgQ || ((r.summary || "") + " " + (r.actor_email || "")).toLowerCase().includes(rgQ.toLowerCase())));
  const tabela = L => L.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th><th></th></tr></thead><tbody>${L.map(r => `<tr><td style="white-space:nowrap">${new Date(r.at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</td><td>${esc(r.actor_email || "sistema")}</td><td><span class="tag">${esc(nomeAcao(r.action))}</span></td><td>${esc(r.summary || "")}</td><td>${r.target_type === "profile" && (C.pros || []).some(p => p.id === r.target_id) ? `<button class="btn peq linha" data-ficha="${esc(r.target_id)}">Ficha</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="vazio">${A.length ? "Nada com estes filtros. Alarga o período ou limpa a pesquisa." : "Ainda sem ações registadas. Verificações, suspensões, planos e RGPD aparecem aqui sozinhos."}</p>`;
  const n = s => (notif || []).filter(x => x.status === s).length;
  main.innerHTML = topo("Empresa", "Quem fez o quê no painel: verificações, suspensões, planos, reembolsos, RGPD, moderação e emails.", '<button class="btn linha" id="rgCsv">Descarregar CSV</button>') + tabs + `
    <div class="grelha g4" style="margin-bottom:16px">
      <div class="cartao kpi"><strong>${num(A.filter(r => Date.now() - new Date(r.at) < 7 * DIA).length)}</strong><span>ações nos últimos 7 dias</span></div>
      <div class="cartao kpi"><strong>${notif ? num(n("sent")) : "—"}</strong><span>notificações enviadas</span></div>
      <div class="cartao kpi"><strong>${notif ? num(n("failed")) : "—"}</strong><span>notificações que falharam</span>${n("failed") ? '<div class="nota">Confirma o email e o push da pessoa. Se forem muitas, o serviço de envio pode estar em baixo.</div>' : ""}</div>
      <div class="cartao kpi"><strong>${notif ? num(n("pending")) : "—"}</strong><span>notificações à espera</span></div></div>
    <p class="nota" style="margin-bottom:12px">Este registo é escrito pela base de dados. Ninguém o pode mudar nem apagar a partir do painel. Mostra as 500 ações mais recentes.</p>
    <div class="barra-pesq"><input class="campo" id="rgQ" placeholder="Procurar nome ou email" value="${esc(rgQ)}" aria-label="Procurar no registo"/>
      <select class="campo" style="width:auto;flex:none" id="rgA" aria-label="Ação"><option value="">Todas as ações</option>${acoes.map(a => `<option value="${esc(a)}"${rgA === a ? " selected" : ""}>${esc(nomeAcao(a))}</option>`).join("")}</select>
      <select class="campo" style="width:auto;flex:none" id="rgD" aria-label="Período">${[[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [0, "Tudo"]].map(([v, t]) => `<option value="${v}"${rgD === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
    <div class="cartao" id="rgTab">${tabela(filtrar())}</div>`;
  const ligarFichas = () => $("#rgTab").querySelectorAll("[data-ficha]").forEach(b => b.onclick = () => fichaPro(b.dataset.ficha));
  ligarFichas();
  $("#rgQ").oninput = e => { rgQ = e.target.value; $("#rgTab").innerHTML = tabela(filtrar()); ligarFichas(); };
  $("#rgA").onchange = e => { rgA = e.target.value; ir(); };
  $("#rgD").onchange = e => { rgD = +e.target.value; ir(); };
  $("#rgCsv").onclick = () => { const L = filtrar(); csv("flinko-registo-acoes-" + hoje() + ".csv", [["Data", "Quem", "Ação", "Detalhe"]].concat(L.map(r => [new Date(r.at).toLocaleString("pt-PT"), r.actor_email || "sistema", nomeAcao(r.action), r.summary || ""]))); aviso("Ficheiro descarregado (" + L.length + " ações)."); };
}

/* ---- Conformidade e riscos ---- */
const VERIFICACOES = [
  ["RGPD", ["Política de privacidade publicada e atualizada", "Termos e condições publicados", "Aviso de cookies em que recusar é tão fácil como aceitar", "Processo para responder a pedidos RGPD em 30 dias", "Registo das atividades de tratamento de dados", "Acordos de tratamento de dados com Supabase, Netlify e Stripe", "Processo para uma fuga de dados (avisar a CNPD em 72 horas)", "Registo de consentimentos para promoções (quem, quando, como)"]],
  ["Empresa e finanças", ["Atividade aberta nas Finanças e forma jurídica definida", "Regime de IVA definido com o contabilista", "Faturação a cumprir os requisitos legais", "Seguro de responsabilidade civil avaliado", "Registo da marca no INPI avaliado", "Livro de Reclamações Eletrónico (confirmar se se aplica)", "Email e domínios em nome do projeto, com renovação automática"]],
  ["Segurança", ["Verificação em dois passos no Supabase, Netlify, Stripe, GitHub e email", "Cópias de segurança da base de dados verificadas e testadas", "Regras de acesso aos dados (RLS) revistas", "Chaves secretas fora do código, e trocadas se alguma ficou exposta", "Segundo administrador, ou plano se perderes acesso à conta"]],
  ["Operação", ["Email próprio do Flinko para o apoio", "Processo de verificação de profissionais escrito", "Prazos de resposta a reclamações e pedidos de apoio definidos", "Regras de moderação de conteúdo definidas"]]
];
const RISCOS_COMUNS = [["Poucos clientes: profissionais sem procura", 5, 5], ["Tudo depende de uma só pessoa (o fundador)", 4, 5], ["Clientes e profissionais combinam fora da plataforma", 4, 3], ["Conteúdo abusivo ou perfis falsos", 3, 4], ["Dependência do Supabase e do Netlify (falha ou custo)", 2, 4], ["Pedidos RGPD fora de prazo", 2, 5]];
const CAMPOS_RISCO = [{ k: "title", label: "Risco", req: 1 }, { k: "prob", label: "Probabilidade (1 a 5)", type: "number", def: 3 }, { k: "impact", label: "Impacto (1 a 5)", type: "number", def: 3 }, { k: "mitig", label: "O que vais fazer para o reduzir", type: "textarea" }, { k: "status", label: "Estado", type: "select", opts: [["aberto", "Aberto"], ["mitigado", "Reduzido"], ["aceite", "Aceite"]] }];
async function vistaConformidade(main, tabs) {
  const [def, R0, pros, reqs, mod] = await Promise.all([definicoes(), itens("risk"), profissionais(), pedidos().catch(() => []), dadosModeracao().catch(() => ({ rgpd: [], denuncias: [] }))]);
  const feitos = def.checks || {}, chave = (g, i) => g + ":" + i;
  let tot = 0, ok = 0; VERIFICACOES.forEach(([g, L]) => L.forEach((_, i) => { tot++; if (feitos[chave(g, i)]) ok++; }));
  const R = R0.map(r => Object.assign({ _s: (+r.prob || 0) * (+r.impact || 0) }, r)).sort((a, b) => b._s - a._s), cor = s => s >= 15 ? "vermelho" : s >= 8 ? "laranja" : "verde";
  const auto = [], cli = (C.clientes || []).length, cats = {};
  pros.forEach(p => { if (p.category) cats[p.category] = (cats[p.category] || 0) + 1; });
  const topo1 = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  if (cli < 10) auto.push(["Muito poucos clientes para o número de profissionais", 20]);
  if (topo1 && pros.length && topo1[1] / pros.length > .4) auto.push([`Muitos profissionais num só ofício (${topo1[0]}: ${pctDe(topo1[1], pros.length)}%)`, 8]);
  const gp = mod.rgpd.filter(g => ["pending", "in_progress"].includes(g.status)).length; if (gp) auto.push([`${gp} pedido(s) RGPD por concluir`, 15]);
  const dn = (mod.denuncias || []).filter(x => (x.status || "aberto") !== "resolvido").length; if (dn) auto.push([`${dn} denúncia(s) por resolver`, 9]);
  const sem = reqs.filter(r => r.status !== "resolved" && !r._propostas).length; if (sem) auto.push([`${sem} pedido(s) de clientes sem proposta`, 10]);
  const sug = RISCOS_COMUNS.map((s, i) => [s, i]).filter(([s]) => !R0.some(r => r.title === s[0]));
  main.innerHTML = topo("Empresa", `${ok} de ${tot} pontos da lista feitos.`, '<button class="btn laranja" id="novoRisco">Novo risco</button>') + tabs + `
    <p class="nota" style="margin-bottom:12px">Lista de apoio, não é aconselhamento jurídico. Confirma cada ponto com o teu contabilista ou advogado.</p>
    <div class="grelha g2">
      <div class="cartao"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Lista de verificação</h2><span class="tag ${ok === tot ? "verde" : "laranja"}">${pctDe(ok, tot)}%</span></div>${progresso(pctDe(ok, tot), ok === tot ? "verde" : "laranja")}
        ${VERIFICACOES.map(([g, L]) => `<h4 class="mini" style="margin-top:14px">${esc(g)}</h4>${L.map((c, i) => `<label class="verif${feitos[chave(g, i)] ? " feito" : ""}"><input type="checkbox" data-chk="${esc(chave(g, i))}"${feitos[chave(g, i)] ? " checked" : ""}/><span>${esc(c)}</span></label>`).join("")}`).join("")}</div>
      <div>
        <div class="cartao"><h2>Alertas a partir dos dados</h2>${auto.length ? `<ul class="lista longa">${auto.sort((a, b) => b[1] - a[1]).map(([t, s]) => `<li><span class="tag ${cor(s)}">${s >= 15 ? "alto" : s >= 8 ? "médio" : "baixo"}</span><div class="info"><b>${esc(t)}</b></div></li>`).join("")}</ul>` : '<p class="vazio">Os números não mostram nenhum risco agora.</p>'}</div>
        <div class="cartao" style="margin-top:16px"><h2>Registo de riscos</h2><p class="sub">Pontuação = probabilidade × impacto. Acima de 15, trata primeiro.</p>
          ${R.length ? `<ul class="lista longa">${R.map(r => `<li style="flex-wrap:wrap"><span class="tag ${cor(r._s)}">${r._s}</span><div class="info" style="min-width:180px"><b>${esc(r.title)}</b><small style="white-space:normal">${esc(r.mitig || "Ainda sem plano para o reduzir.")} · ${esc({ aberto: "aberto", mitigado: "reduzido", aceite: "aceite" }[r.status] || r.status || "aberto")}</small></div><button class="btn peq linha" data-ed-risco="${esc(r.id)}">Editar</button><button class="btn peq perigo" data-ap-risco="${esc(r.id)}" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Ainda sem riscos registados. Junta os mais comuns em marketplaces, abaixo, e escreve o que vais fazer em cada um.</p>'}
          ${sug.length ? `<h4 class="mini" style="margin-top:14px">Riscos comuns em marketplaces</h4><ul class="lista longa">${sug.map(([s, i]) => `<li><div class="info"><b>${esc(s[0])}</b></div><button class="btn peq linha" data-sug-risco="${i}">Juntar</button></li>`).join("")}</ul>` : ""}</div>
      </div></div>`;
  main.querySelectorAll("[data-chk]").forEach(c => c.onchange = async () => {
    const v = Object.assign({}, (await definicoes()).checks || {}); if (c.checked) v[c.dataset.chk] = new Date().toISOString(); else delete v[c.dataset.chk];
    await guardarDefinicao("checks", v); c.closest(".verif").classList.toggle("feito", c.checked);
  });
  $("#novoRisco").onclick = async () => { const r = await formulario("Novo risco", CAMPOS_RISCO, { status: "aberto" }); if (r) { await guardarItem("risk", r); aviso("Risco registado."); ir(); } };
  main.querySelectorAll("[data-sug-risco]").forEach(b => b.onclick = async () => { const s = RISCOS_COMUNS[+b.dataset.sugRisco]; await guardarItem("risk", { title: s[0], prob: s[1], impact: s[2], mitig: "", status: "aberto" }); ir(); });
  main.querySelectorAll("[data-ed-risco]").forEach(b => b.onclick = async () => { const x = R0.find(y => y.id === b.dataset.edRisco), r = await formulario("Editar risco", CAMPOS_RISCO, x); if (r) { await guardarItem("risk", Object.assign({}, x, r)); ir(); } });
  main.querySelectorAll("[data-ap-risco]").forEach(b => b.onclick = () => apagarItem("risk", b.dataset.apRisco, "Apagar este risco?"));
}

/* ---- Contactos, processos e notas de reunião ---- */
const FUNCOES = ["Contabilista", "Advogado", "Parceiro", "Fornecedor", "Mentor", "Investidor", "Cliente importante", "Outro"];
const CAMPOS_CONTACTO = [{ k: "name", label: "Nome", req: 1 }, { k: "role", label: "Função", type: "select", opts: FUNCOES }, { k: "org", label: "Empresa ou entidade" }, { k: "phone", label: "Telemóvel" }, { k: "email", label: "Email", type: "email" }, { k: "notes", label: "Notas", type: "textarea" }];
const PROCESSOS = [
  ["Como verificar um profissional", "1. Confirmar a identidade (documento com fotografia) numa chamada ou videochamada.\n2. Confirmar o telemóvel ligando para o número registado.\n3. Confirmar a atividade e as certificações exigidas para a profissão, quando existam.\n4. Pedir uma referência ou um trabalho anterior.\n5. Guardar as notas na ficha do profissional.\n6. Marcar como verificado e avisar o profissional."],
  ["Como tratar um pedido RGPD", "1. Registar a data do pedido (o prazo para responder é de 1 mês).\n2. Confirmar a identidade de quem pede.\n3. Exportação: reunir os dados da conta e enviar de forma segura. Eliminação: apagar a conta e os dados associados.\n4. Confirmar por escrito à pessoa.\n5. Marcar como concluído em Moderação e apoio > RGPD.\nConfirma este processo com um advogado ou consultor de proteção de dados."],
  ["Primeira chamada com um profissional novo", "1. Explicar o Flinko: perfil grátis, sem comissões, profissionais verificados.\n2. Completar a conta em conjunto: ofício, zona, foto e descrição.\n3. Juntar pelo menos 3 serviços com preço indicativo.\n4. Pedir fotografias de trabalhos para o portfólio.\n5. Pedir que peça avaliação aos últimos clientes.\n6. Marcar novo contacto daqui a 2 semanas."],
  ["Moderação de conteúdo", "1. Rever todas as semanas as conversas assinaladas em Moderação e apoio.\n2. Ofensas ou assédio: avisar por escrito; se repetir, suspender a conta.\n3. Partilha de contactos para sair da plataforma: lembrar as regras.\n4. Perfis falsos: pedir prova de identidade; sem resposta em 7 dias, suspender.\n5. Registar cada decisão em Estratégia > Plano e decisões."]
];
const CAMPOS_PROC = [{ k: "title", label: "Título", req: 1 }, { k: "text", label: "Passos", type: "textarea", req: 1 }];
const CAMPOS_NOTA = [{ k: "date", label: "Data", type: "date", def: hoje() }, { k: "title", label: "Reunião ou assunto", req: 1 }, { k: "text", label: "Notas", type: "textarea" }, { k: "actions", label: "Ações a fazer (uma por linha)", type: "textarea", ph: "Enviar proposta ao João\nMarcar reunião com o contabilista" }];
async function vistaContactos(main, tabs) {
  const [Ct, P, N0] = await Promise.all([itens("contact"), itens("sop"), itens("note")]);
  const Cs = Ct.filter(c => c.name && !c.tpl && !c.profile_id), N = N0.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const sug = PROCESSOS.map((s, i) => [s, i]).filter(([s]) => !P.some(x => x.title === s[0]));
  main.innerHTML = topo("Empresa", "Contactos úteis, como se faz cada coisa e o que ficou decidido nas reuniões.") + tabs + `
    <div class="grelha g2">
      <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Contactos úteis</h2><button class="btn peq laranja" id="novoCt">Novo contacto</button></div>
        ${Cs.length ? `<ul class="lista longa">${Cs.map(c => `<li style="flex-wrap:wrap"><div class="info" style="min-width:180px"><b>${esc(c.name)}</b><small style="white-space:normal">${esc(c.role || "")}${c.org ? " · " + esc(c.org) : ""}${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}${c.notes ? "<br/>" + esc(c.notes) : ""}</small></div><button class="btn peq linha" data-ed-ct="${esc(c.id)}">Editar</button><button class="btn peq perigo" data-ap-ct="${esc(c.id)}" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Guarda aqui o contabilista, o advogado e os parceiros. Quando precisares, estão a um toque.</p>'}</div>
      <div class="cartao"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Notas de reunião</h2><button class="btn peq laranja" id="novaNota">Nova nota</button></div>
        ${N.length ? `<ul class="lista longa">${N.map(n => `<li style="flex-wrap:wrap"><div class="info" style="min-width:180px"><b>${esc(n.title)}</b><small style="white-space:pre-wrap">${fdata(n.date)}${n.text ? "\n" + esc(n.text) : ""}${n.actions ? "\nAções:\n" + esc(n.actions) : ""}</small></div>${n.actions && !n.tasksDone ? `<button class="btn peq" data-tarefas="${esc(n.id)}">Passar a tarefas</button>` : n.tasksDone ? '<span class="tag verde">Em tarefas</span>' : ""}<button class="btn peq perigo" data-ap-nota="${esc(n.id)}" aria-label="Apagar">×</button></li>`).join("")}</ul>` : '<p class="vazio">Depois de cada reunião, escreve o que ficou decidido e as ações. Com um toque passam a tarefas em Hoje.</p>'}</div>
    </div>
    <div class="cartao" style="margin-top:16px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Processos</h2><button class="btn peq laranja" id="novoProc">Novo processo</button></div>
      <p class="sub">Como se faz cada coisa, passo a passo. Quando entrar alguém na equipa, é por aqui que aprende.</p>
      ${P.length ? P.map(s => `<details class="processo"><summary>${esc(s.title)}</summary><p>${esc(s.text)}</p><button class="btn peq linha" data-ed-proc="${esc(s.id)}">Editar</button> <button class="btn peq perigo" data-ap-proc="${esc(s.id)}">Apagar</button></details>`).join("") : '<p class="vazio">Ainda sem processos escritos. Junta os modelos abaixo e adapta-os.</p>'}
      ${sug.length ? `<h4 class="mini" style="margin-top:14px">Modelos para começar</h4><ul class="lista longa">${sug.map(([s, i]) => `<li><div class="info"><b>${esc(s[0])}</b></div><button class="btn peq linha" data-sug-proc="${i}">Juntar</button></li>`).join("")}</ul>` : ""}</div>`;
  $("#novoCt").onclick = async () => { const r = await formulario("Novo contacto", CAMPOS_CONTACTO); if (r) { await guardarItem("contact", r); aviso("Contacto guardado."); ir(); } };
  main.querySelectorAll("[data-ed-ct]").forEach(b => b.onclick = async () => { const x = Cs.find(y => y.id === b.dataset.edCt), r = await formulario("Editar contacto", CAMPOS_CONTACTO, x); if (r) { await guardarItem("contact", Object.assign({}, x, r)); ir(); } });
  main.querySelectorAll("[data-ap-ct]").forEach(b => b.onclick = () => apagarItem("contact", b.dataset.apCt, "Apagar este contacto?"));
  $("#novaNota").onclick = async () => { const r = await formulario("Nova nota de reunião", CAMPOS_NOTA); if (r) { await guardarItem("note", r); aviso("Nota guardada."); ir(); } };
  main.querySelectorAll("[data-ap-nota]").forEach(b => b.onclick = () => apagarItem("note", b.dataset.apNota, "Apagar esta nota?"));
  main.querySelectorAll("[data-tarefas]").forEach(b => b.onclick = async () => {
    const n = N.find(x => x.id === b.dataset.tarefas), L = String(n.actions || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
    for (const t of L) await guardarTarefa({ id: uid(), title: t, status: "todo", priority: "media", due_date: null, profile_id: null, created_at: new Date().toISOString() });
    await guardarItem("note", Object.assign({}, n, { tasksDone: true }));
    aviso(L.length + " tarefa(s) criada(s) em Hoje > Tarefas."); ir();
  });
  $("#novoProc").onclick = async () => { const r = await formulario("Novo processo", CAMPOS_PROC); if (r) { await guardarItem("sop", r); ir(); } };
  main.querySelectorAll("[data-sug-proc]").forEach(b => b.onclick = async () => { const s = PROCESSOS[+b.dataset.sugProc]; await guardarItem("sop", { title: s[0], text: s[1] }); ir(); });
  main.querySelectorAll("[data-ed-proc]").forEach(b => b.onclick = async () => { const x = P.find(y => y.id === b.dataset.edProc), r = await formulario("Editar processo", CAMPOS_PROC, x); if (r) { await guardarItem("sop", Object.assign({}, x, r)); ir(); } });
  main.querySelectorAll("[data-ap-proc]").forEach(b => b.onclick = () => apagarItem("sop", b.dataset.apProc, "Apagar este processo?"));
}
