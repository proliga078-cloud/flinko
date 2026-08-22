// Torna acessíveis pelo teclado os elementos que só reagem a "onclick"
// (normalmente <div>s usadas como botões). Sem isto, quem navega só com
// o teclado (Tab) nunca consegue focar nem ativar esses elementos, e
// leitores de ecrã não os anunciam como interativos.
//
// O que faz:
//  1. Dá tabindex="0" e role="button" a qualquer [onclick] que não seja
//     já um elemento nativamente focável (botão, link, campo, etc.).
//  2. Deixa Enter/Espaço ativarem esses elementos, tal como um <button>.
//  3. Ignora fundos de modais/menus que fecham ao clicar fora (não fazem
//     sentido como "botão" para navegação por teclado).
//
// Corre uma única vez, ao carregar a página. Os elementos "onclick" desta
// aplicação são todos marcação estática (menus, separadores, cartões de
// filtro) — não são criados depois via JavaScript — por isso um único
// passo chega. De propósito NÃO fica a observar mutações do DOM de forma
// contínua: isso teria um custo de desempenho constante e podia
// interferir com outras interações da página (ex: diálogos de
// confirmação, pedidos de rede em curso).
(function () {
  var EXCLUDE_SELECTOR = '.mobile-menu-overlay, .modal-overlay, .sidebar-overlay, #lightbox'

  function isNativelyInteractive(el) {
    var tag = el.tagName
    return tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL'
  }

  function shouldSkip(el) {
    if (isNativelyInteractive(el)) return true
    if (el.hasAttribute('tabindex')) return true
    if (el.matches && el.matches(EXCLUDE_SELECTOR)) return true
    return false
  }

  function enhance(root) {
    var els = (root || document).querySelectorAll('[onclick]')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (shouldSkip(el)) continue
      el.setAttribute('tabindex', '0')
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enhance(document) })
  } else {
    enhance(document)
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
    var el = e.target
    if (!el || !el.getAttribute || el.getAttribute('role') !== 'button' || !el.hasAttribute('onclick')) return
    if (isNativelyInteractive(el)) return
    e.preventDefault()
    el.click()
  })
})()
