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
  ['/academia', 'Academia', ['academia']]
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
        <a href="/auth?tab=register" class="fk-btn fk-btn-dark">Criar conta grátis</a>
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
  </div>
</div>`
}

module.exports = { siteHeader, LINKS }
