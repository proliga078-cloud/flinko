// Cabeçalho único do site público (fonte de verdade).
//
// Antes cada página tinha o seu próprio menu (seis versões diferentes: umas com
// "Encontrar · Pedidos · Preços…", outras com "Pedidos · Como Funciona ·
// Entrar · Registar", botões laranja quadrados numas e escuros redondos
// noutras). Agora o HTML vive só aqui:
//   - scripts/build-site-header.js copia-o para dentro das marcas
//     <!-- fk:header --> … <!-- /fk:header --> de cada página;
//   - netlify/functions/local-page.js usa-o nas páginas locais geradas a pedido.
// Estilos em assets/site.css (classes fk-*), comportamento em
// assets/site-header.js.
//
// Os ids nav-guest / nav-user / nav-avatar mantêm-se porque o JS de várias
// páginas já os usa para mostrar o estado de sessão.

const LINKS = [
  ['/categoria', 'Encontrar', ['categoria']],
  ['/pedidos', 'Pedidos', ['pedidos', 'pedido']],
  ['/como-funciona', 'Como funciona', ['como-funciona']],
  ['/pricing', 'Preços', ['pricing']],
  ['/profissionais', 'Para profissionais', ['profissionais']],
  ['/academia', 'Academia', ['academia']],
  ['/sobre', 'Quem somos', ['sobre']]
]

// `page` = nome do ficheiro sem .html (ex: "pricing"), para marcar o link ativo.
function siteHeader(page = '') {
  const link = ([href, label, pages], cls = '') =>
    `<a href="${href}"${cls ? ` class="${cls}"` : ''}${pages.includes(page) ? ' aria-current="page"' : ''}>${label}</a>`
  return `<div class="fk-header" id="fkHeader" role="banner">
  <div class="fk-bar">
    <a href="/" class="fk-logo" aria-label="Flinko — página inicial">Flink<span>o</span></a>
    <div class="fk-links" role="navigation" aria-label="Navegação principal">
      ${LINKS.map(l => link(l)).join('\n      ')}
    </div>
    <div class="fk-actions">
      <div id="nav-guest" class="fk-group">
        <a href="/auth?tab=login" class="fk-btn fk-btn-ghost fk-hide-sm">Entrar</a>
        <a href="/pedidos?publicar=1" class="fk-btn fk-btn-dark">Publicar pedido</a>
      </div>
      <div id="nav-user" class="fk-group" style="display:none">
        <a href="/dashboard" class="fk-btn fk-btn-dark">O meu painel</a>
        <a href="/dashboard" class="fk-avatar" id="nav-avatar" aria-label="O meu painel">?</a>
      </div>
      <button type="button" class="fk-toggle" id="fkToggle" aria-expanded="false" aria-controls="fkPanel" aria-label="Abrir menu"><span></span></button>
    </div>
  </div>
  <div class="fk-panel" id="fkPanel" hidden>
    ${LINKS.map(l => link(l)).join('\n    ')}
    <a href="/calculadora-orcamento">Calculadora de orçamento</a>
    <a href="/auth?tab=login">Entrar</a>
    <button type="button" class="fk-install" data-fk-install onclick="window.flinkoInstallApp&&window.flinkoInstallApp()">📲 Instalar a app no telemóvel</button>
  </div>
</div>`
}

// Rodapé único (mesma ideia: marcas <!-- fk:footer --> … <!-- /fk:footer -->).
function siteFooter() {
  const col = (titulo, links) => `<div class="fk-fcol"><h2>${titulo}</h2><ul>${links.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>`
  return `<div class="fk-footer" role="contentinfo">
  <div class="fk-ftop">
    <div class="fk-fbrand">
      <a href="/" class="fk-logo">Flink<span>o</span></a>
      <p>Profissionais verificados em Portugal. Grátis para clientes, sem comissões para profissionais.</p>
    </div>
    ${col('Para clientes', [['/categoria', 'Encontrar profissional'], ['/pedidos?publicar=1', 'Publicar pedido'], ['/como-funciona', 'Como funciona'], ['/calculadora-orcamento', 'Calculadora de orçamento']])}
    ${col('Para profissionais', [['/profissionais', 'A Flinko para profissionais'], ['/auth?tab=register', 'Criar perfil grátis'], ['/pricing', 'Preços'], ['/dashboard', 'O meu painel']])}
    ${col('Flinko', [['/sobre', 'Sobre nós'], ['/academia', 'Academia'], ['/porque-escolher', 'Porquê a Flinko'], ['/contacto', 'Contacto']])}
  </div>
  <div class="fk-fbottom">
    <span>© 2026 Flinko · Portugal</span>
    <span class="fk-legal"><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a><a href="/cookies">Cookies</a><a href="/rgpd">RGPD</a></span>
  </div>
</div>`
}

module.exports = { siteHeader, siteFooter, LINKS }
