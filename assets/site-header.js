// Comportamento do cabeçalho único (scripts/site-header.js): menu no
// telemóvel, sombra ao fazer scroll e estado de sessão.
//
// O estado de sessão é lido da sessão do Supabase guardada no browser, sem
// pedidos à rede. As páginas que já tratam do login (categorias, pedidos,
// perfil…) continuam a mexer em #nav-guest / #nav-user por cima disto.
(function () {
  var header = document.getElementById('fkHeader')
  if (!header) return
  var toggle = document.getElementById('fkToggle')
  var panel = document.getElementById('fkPanel')

  function setOpen(open) {
    header.classList.toggle('fk-open', open)
    if (panel) panel.hidden = !open
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu')
    }
  }
  if (toggle) toggle.addEventListener('click', function () { setOpen(!header.classList.contains('fk-open')) })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false) })
  if (panel) panel.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false) })

  function onScroll() { header.classList.toggle('fk-condensed', window.scrollY > 20) }
  document.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i)
      if (!/^sb-.*-auth-token$/.test(key)) continue
      var s = JSON.parse(localStorage.getItem(key) || 'null')
      var sess = s && (s.currentSession || s)
      if (!sess || !sess.access_token || (sess.expires_at && sess.expires_at * 1000 < Date.now() - 864e5)) continue
      var guest = document.getElementById('nav-guest')
      var user = document.getElementById('nav-user')
      if (guest) guest.style.display = 'none'
      if (user) user.style.display = 'flex'
      var meta = (sess.user && sess.user.user_metadata) || {}
      var name = String(meta.full_name || meta.name || '').trim()
      var av = document.getElementById('nav-avatar')
      if (av && name && av.textContent === '?') av.textContent = name.split(/\s+/).map(function (p) { return p[0] }).join('').slice(0, 2).toUpperCase()
      break
    }
  } catch (e) {}
})()
