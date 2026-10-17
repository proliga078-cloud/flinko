// Guia "Completa o teu perfil" (profissionais).
//
// Muitos profissionais criavam conta e paravam: sem categoria não aparecem em
// nenhuma pesquisa, sem foto nem descrição quase ninguém os contacta. O cartão
// de passos do Resumo já existia, mas obrigava a andar entre páginas. Este guia
// abre por cima do dashboard e pede SÓ o que falta, um passo de cada vez:
// área e zona → foto → descrição → primeiro serviço. Cada passo grava logo.
//
// Abre sozinho (no máximo uma vez por dia) a quem tem passos por fazer, ou com
// ?completar=1 (link dos emails de lembrete), ou pelo botão do cartão de passos.
;(function(){
  var SNOOZE_KEY = 'fk_onb_snooze_until'
  var st = { steps: [], i: 0, busy: false }

  var SERVICOS = {
    'Eletricistas': ['Instalação de tomadas e interruptores', 'Reparação de avarias elétricas', 'Quadro elétrico'],
    'Canalizadores': ['Reparação de fugas', 'Desentupimentos', 'Instalação de loiças sanitárias'],
    'Pintores': ['Pintura de interiores', 'Pintura de exteriores', 'Pintura de uma divisão'],
    'Limpeza': ['Limpeza doméstica', 'Limpeza profunda', 'Limpeza pós-obra'],
    'Jardineiros': ['Manutenção de jardim', 'Corte de relva', 'Poda de árvores'],
    'Mudanças': ['Mudança de casa', 'Transporte de móveis', 'Montagem de móveis'],
    'Pedreiros': ['Pequenas obras', 'Assentamento de azulejo', 'Remodelação de casa de banho'],
    'Carpinteiros': ['Móveis por medida', 'Reparação de portas e janelas', 'Montagem de cozinhas'],
    'Programadores': ['Website institucional', 'Loja online', 'Manutenção de website'],
    'Designers': ['Logótipo e identidade visual', 'Design para redes sociais', 'Flyers e cartazes']
  }

  function esc(s){ return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s) }
  // profileData, profileId, user e servicesCount são declarados com let em
  // dashboard-core.js: existem pelo nome, mas não como window.profileData.
  function isPro(){ return typeof profileData !== 'undefined' && !!profileData && profileData.account_type !== 'client' }
  function missing(){
    if(!isPro()) return []
    var p = profileData, out = []
    if(!p.category || !p.location) out.push('area')
    if(!p.photo_url) out.push('foto')
    if(!p.bio || !String(p.bio).trim()) out.push('bio')
    if(!(typeof servicesCount === 'number' && servicesCount > 0)) out.push('servico')
    return out
  }
  window.onboardingMissing = missing

  function css(){
    if(document.getElementById('onb-style')) return
    var s = document.createElement('style'); s.id = 'onb-style'
    s.textContent = [
      '.onb{position:fixed;inset:0;z-index:2000;background:rgba(19,36,32,.6);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.onb-card{background:#fff;border-radius:20px;width:100%;max-width:520px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden}',
      '.onb-top{padding:18px 22px 0;display:flex;align-items:center;gap:10px}',
      '.onb-dots{display:flex;gap:6px;flex:1}',
      '.onb-dots i{height:6px;flex:1;border-radius:999px;background:#E3ECE7}',
      '.onb-dots i.on{background:#E8720A}',
      '.onb-x{width:36px;height:36px;border-radius:50%;border:none;background:none;font-size:20px;color:#5E6B66;cursor:pointer}',
      '.onb-body{padding:18px 22px 8px;overflow-y:auto}',
      '.onb-step{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#B85608}',
      '.onb-body h2{font-size:22px;margin:6px 0 6px;letter-spacing:-.02em}',
      '.onb-body p.lead{color:#5E6B66;font-size:14px;line-height:1.5;margin-bottom:16px}',
      '.onb-body label{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}',
      '.onb-body select,.onb-body input,.onb-body textarea{width:100%;padding:12px 14px;border:1.5px solid #E3ECE7;border-radius:12px;font:inherit;font-size:15px;background:#fff}',
      '.onb-body textarea{min-height:130px;resize:vertical;line-height:1.5}',
      '.onb-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.onb-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
      '.onb-chip{border:1.5px solid #E3ECE7;background:#fff;border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}',
      '.onb-chip:hover{border-color:#0F8B5F;background:#F3FBF6}',
      '.onb-photo{display:flex;align-items:center;gap:16px}',
      '.onb-av{width:96px;height:96px;border-radius:50%;background:#EEF3F0;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:34px;flex-shrink:0}',
      '.onb-av img{width:100%;height:100%;object-fit:cover}',
      '.onb-err{display:none;background:#FDECEA;color:#9B2C22;border-radius:10px;padding:10px 12px;font-size:13px;margin-top:12px}',
      '.onb-foot{display:flex;gap:10px;padding:16px 22px 20px;border-top:1px solid #EEF3F0}',
      '.onb-foot .sp{flex:1}',
      '.onb-btn{border:none;border-radius:999px;padding:12px 22px;font:inherit;font-weight:700;font-size:15px;cursor:pointer}',
      '.onb-main{background:#E8720A;color:#fff}',
      '.onb-main:disabled{opacity:.6;cursor:default}',
      '.onb-ghost{background:none;color:#5E6B66}',
      '.onb-count{font-size:12px;color:#5E6B66;text-align:right;margin-top:4px}',
      '.onb-done{text-align:center;padding:10px 0 4px}',
      '.onb-done .big{font-size:52px}',
      '@media (max-width:560px){.onb{padding:0;align-items:flex-end}.onb-card{border-radius:20px 20px 0 0;max-height:96vh}.onb-row{grid-template-columns:1fr}}'
    ].join('\n')
    document.head.appendChild(s)
  }

  function optionsFrom(id, sel){
    var src = document.getElementById(id)
    if(!src) return ''
    return [].slice.call(src.options).map(function(o){
      var v = o.value || ''
      if(!v) return '<option value="">' + esc(o.text) + '</option>'
      return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(o.text) + '</option>'
    }).join('')
  }
  function partsOf(loc){ var p = String(loc || '').split(/\s[–-]\s/); return { d: (p[0] || '').trim(), c: (p[1] || '').trim() } }

  function sugestaoBio(){
    var p = profileData, cat = String(p.category || 'profissional').toLowerCase().replace(/s$/, '')
    var zona = partsOf(p.location).c || partsOf(p.location).d
    var anos = p.experience_years ? (' Tenho ' + p.experience_years + ' anos de experiência.') : ''
    return 'Olá! Sou ' + (p.name ? p.name.split(' ')[0] + ', ' : '') + cat + (zona ? ' em ' + zona : '') + '.' + anos +
      ' Trabalho com cuidado, cumpro prazos e dou sempre orçamento antes de começar. Fale comigo sem compromisso: respondo rápido e explico tudo de forma clara.'
  }

  function render(){
    var root = document.getElementById('onb')
    var step = st.steps[st.i]
    var dots = st.steps.map(function(_, k){ return '<i class="' + (k <= st.i ? 'on' : '') + '"></i>' }).join('')
    var body = '', foot = ''
    var n = '<div class="onb-step">Passo ' + (st.i + 1) + ' de ' + st.steps.length + '</div>'
    var p = profileData
    if(step === 'area'){
      var pl = partsOf(p.location)
      body = n + '<h2>O que fazes e onde?</h2><p class="lead">Sem isto não apareces em nenhuma pesquisa. Podes mudar depois.</p>' +
        '<label for="onb-cat">A tua área</label><select id="onb-cat">' + optionsFrom('p-cat', p.category) + '</select>' +
        '<div class="onb-row"><div><label for="onb-dist">Distrito</label><select id="onb-dist">' + optionsFrom('p-district', pl.d) + '</select></div>' +
        '<div><label for="onb-city">Cidade ou zona</label><input id="onb-city" placeholder="Ex: Guimarães" value="' + esc(pl.c) + '"></div></div>'
    } else if(step === 'foto'){
      body = n + '<h2>Põe uma foto tua</h2><p class="lead">Os clientes confiam mais quando veem quem vai a casa deles. Perfis com foto recebem muito mais contactos.</p>' +
        '<div class="onb-photo"><div class="onb-av" id="onb-av">' + (p.photo_url ? '<img src="' + esc(p.photo_url) + '" alt="">' : '📷') + '</div>' +
        '<div><button class="onb-btn onb-main" type="button" id="onb-pick">Escolher foto</button><div style="font-size:12.5px;color:#5E6B66;margin-top:8px">Uma foto de cara, com boa luz.</div></div></div>' +
        '<input type="file" id="onb-file" accept="image/*" hidden>'
    } else if(step === 'bio'){
      body = n + '<h2>Apresenta-te em poucas linhas</h2><p class="lead">O que fazes, há quanto tempo e porque te devem escolher.</p>' +
        '<label for="onb-bio">A tua descrição</label><textarea id="onb-bio" maxlength="600" placeholder="Ex: Sou eletricista em Braga há 12 anos…">' + esc(p.bio || '') + '</textarea>' +
        '<div class="onb-count" id="onb-bio-n"></div>' +
        '<div class="onb-chips"><button class="onb-chip" type="button" id="onb-bio-sug">✨ Escreve um texto por mim</button></div>'
    } else if(step === 'servico'){
      var sugs = SERVICOS[p.category] || []
      body = n + '<h2>O teu primeiro serviço</h2><p class="lead">Diz o que fazes e a partir de quanto. Os clientes escolhem quem mostra preços.</p>' +
        '<label for="onb-st">Serviço</label><input id="onb-st" maxlength="80" placeholder="Ex: ' + esc(sugs[0] || 'Reparação ao domicílio') + '">' +
        (sugs.length ? '<div class="onb-chips">' + sugs.map(function(x){ return '<button class="onb-chip" type="button" data-s="' + esc(x) + '">' + esc(x) + '</button>' }).join('') + '</div>' : '') +
        '<div class="onb-row"><div><label for="onb-sp">A partir de (€)</label><input id="onb-sp" type="number" min="0" inputmode="decimal" placeholder="Ex: 35"></div>' +
        '<div><label for="onb-su">Por</label><select id="onb-su"><option value="trabalho">Trabalho</option><option value="hora">Hora</option><option value="dia">Dia</option><option value="m²">m²</option></select></div></div>'
    } else {
      var href = p.slug ? '/' + encodeURIComponent(p.slug) : '/profile.html?id=' + encodeURIComponent(p.id)
      var link = location.origin + href
      body = '<div class="onb-done"><div class="big">🎉</div><h2>O teu perfil está pronto!</h2><p class="lead">Já apareces nas pesquisas da tua zona. Partilha o teu perfil com clientes antigos: é a forma mais rápida de receber as primeiras avaliações.</p></div>'
      foot = '<a class="onb-btn onb-ghost" href="' + esc(href) + '" target="_blank" rel="noopener">Ver o meu perfil</a><span class="sp"></span>' +
        '<a class="onb-btn onb-main" href="https://wa.me/?text=' + encodeURIComponent('Já estou na Flinko! Vê o meu perfil e pede orçamento: ' + link) + '" target="_blank" rel="noopener">Partilhar no WhatsApp</a>'
    }
    if(!foot){
      var podeSaltar = step === 'foto' || step === 'bio'
      foot = (podeSaltar ? '<button class="onb-btn onb-ghost" type="button" id="onb-skip">Saltar</button>' : '') + '<span class="sp"></span>' +
        '<button class="onb-btn onb-main" type="button" id="onb-next">' + (step === 'foto' && !p.photo_url ? 'Continuar sem foto' : 'Guardar e continuar') + '</button>'
    }
    root.innerHTML = '<div class="onb-card" role="dialog" aria-modal="true" aria-labelledby="onb-h"><div class="onb-top"><div class="onb-dots" aria-hidden="true">' + (step ? dots : '') + '</div>' +
      '<button class="onb-x" type="button" id="onb-close" aria-label="Fazer depois">✕</button></div>' +
      '<div class="onb-body" id="onb-h">' + body + '<div class="onb-err" id="onb-err" role="alert"></div></div><div class="onb-foot">' + foot + '</div></div>'
    wire(step)
  }

  function err(m){ var e = document.getElementById('onb-err'); if(e){ e.textContent = m; e.style.display = m ? 'block' : 'none' } }
  function next(){ st.i++; if(st.i >= st.steps.length){ st.steps.push(null) } render(); if(typeof renderSetup === 'function') renderSetup() }

  function wire(step){
    var close = document.getElementById('onb-close')
    if(close) close.onclick = function(){ closeOnboarding(true) }
    var skip = document.getElementById('onb-skip')
    if(skip) skip.onclick = next
    var btn = document.getElementById('onb-next')
    if(step === 'foto'){
      var file = document.getElementById('onb-file')
      document.getElementById('onb-pick').onclick = function(){ file.click() }
      file.onchange = function(){ uploadFoto(file) }
    }
    if(step === 'bio'){
      var ta = document.getElementById('onb-bio'), cnt = document.getElementById('onb-bio-n')
      var upd = function(){ cnt.textContent = ta.value.length + '/600' }
      ta.oninput = upd; upd()
      document.getElementById('onb-bio-sug').onclick = function(){ ta.value = sugestaoBio(); upd(); ta.focus() }
    }
    if(step === 'servico'){
      [].forEach.call(document.querySelectorAll('.onb-chip[data-s]'), function(b){ b.onclick = function(){ var i = document.getElementById('onb-st'); i.value = b.getAttribute('data-s'); document.getElementById('onb-sp').focus() } })
    }
    if(btn) btn.onclick = function(){ save(step, btn) }
  }

  async function save(step, btn){
    if(st.busy) return
    err('')
    var p = profileData, updates = null
    try{
      st.busy = true; btn.disabled = true
      if(step === 'area'){
        var cat = document.getElementById('onb-cat').value, d = document.getElementById('onb-dist').value, c = document.getElementById('onb-city').value.trim()
        if(!cat || !d){ err('Escolhe a tua área e o distrito.'); return }
        updates = { category: cat, location: c ? d + ' – ' + c : d }
      } else if(step === 'foto'){
        next(); return
      } else if(step === 'bio'){
        var bio = document.getElementById('onb-bio').value.trim()
        if(bio.length < 30){ err('Escreve pelo menos uma ou duas frases (30 caracteres).'); return }
        updates = { bio: bio }
      } else if(step === 'servico'){
        var title = document.getElementById('onb-st').value.trim()
        if(!title){ err('Diz qual é o serviço.'); return }
        var preco = parseFloat(document.getElementById('onb-sp').value)
        var r = await db.from('services').insert({ professional_id: profileId, title: title, price_from: preco > 0 ? preco : null, price_unit: document.getElementById('onb-su').value })
        if(r.error){ err('Não foi possível publicar: ' + r.error.message); return }
        servicesCount = (servicesCount || 0) + 1
        if(typeof loadServices === 'function') try{ loadServices() }catch(e){}
        next(); return
      }
      if(updates){
        updates.updated_at = new Date().toISOString()
        var res = await db.from('profiles').update(updates).eq('id', profileId)
        if(res.error){ err('Não foi possível guardar: ' + res.error.message); return }
        profileData = Object.assign({}, p, updates)
        syncForm(updates)
        if(typeof updateSidebar === 'function') updateSidebar()
      }
      next()
    } finally { st.busy = false; if(btn) btn.disabled = false }
  }

  // Mantém o formulário "O meu perfil" igual ao que foi gravado aqui.
  function syncForm(u){
    var set = function(id, v){ var el = document.getElementById(id); if(el) el.value = v }
    if(u.category) set('p-cat', u.category)
    if(u.location){ var pl = partsOf(u.location); set('p-district', pl.d); set('p-city', pl.c) }
    if(u.bio) set('p-bio', u.bio)
    if(u.photo_url) set('p-photo', u.photo_url)
  }

  async function uploadFoto(input){
    var f = input.files && input.files[0]
    if(!f) return
    err('')
    var av = document.getElementById('onb-av')
    av.innerHTML = '⏳'
    try{
      var file = typeof resizeImageFile === 'function' ? await resizeImageFile(f, { maxWidth: 600, maxHeight: 600 }) : f
      if(file.size > 5 * 1024 * 1024) throw new Error('Foto demasiado grande (máx. 5 MB).')
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      var path = 'profiles/' + user.id + '/avatar.' + ext
      var up = await db.storage.from('proliga-media').upload(path, file, { upsert: true, contentType: file.type })
      if(up.error) throw up.error
      var url = db.storage.from('proliga-media').getPublicUrl(path).data.publicUrl + '?v=' + Date.now()
      var res = await db.from('profiles').update({ photo_url: url, updated_at: new Date().toISOString() }).eq('id', profileId)
      if(res.error) throw res.error
      profileData = Object.assign({}, profileData, { photo_url: url })
      syncForm({ photo_url: url })
      if(typeof updateSidebar === 'function') updateSidebar()
      av.innerHTML = '<img src="' + esc(url) + '" alt="">'
      var b = document.getElementById('onb-next'); if(b) b.textContent = 'Guardar e continuar'
    }catch(e){
      av.innerHTML = '📷'
      err(e && e.message ? e.message : 'Não foi possível carregar a foto. Tenta outra.')
    }
    input.value = ''
  }

  window.openOnboarding = function(){
    var steps = missing()
    if(!steps.length) return false
    css()
    st = { steps: steps, i: 0, busy: false }
    var root = document.getElementById('onb')
    if(!root){ root = document.createElement('div'); root.id = 'onb'; root.className = 'onb'; document.body.appendChild(root) }
    root.style.display = 'flex'
    render()
    document.addEventListener('keydown', escClose)
    return true
  }
  function escClose(e){ if(e.key === 'Escape') closeOnboarding(true) }
  function closeOnboarding(snooze){
    var root = document.getElementById('onb')
    if(root) root.remove()
    document.removeEventListener('keydown', escClose)
    if(snooze) try{ localStorage.setItem(SNOOZE_KEY, String(Date.now() + 864e5)) }catch(e){}
    if(typeof renderSetup === 'function') renderSetup()
    if(!missing().length) pedirPush()
  }
  // Perfil completo: é agora que vale a pena ser avisado dos pedidos.
  function pedirPush(){
    if(!window.flinkoPushAsk || !isPro() || typeof user === 'undefined' || !user) return
    window.flinkoPushAsk({ db: db, userId: user.id, delay: 1500,
      title: 'Recebe os pedidos de clientes na hora',
      text: 'Quem responde primeiro fica com mais trabalhos. Ativa as notificações e sabes logo quando chega um pedido ou uma mensagem.' })
  }
  window.closeOnboarding = closeOnboarding

  // Abre sozinho depois de as estatísticas carregarem (só aí servicesCount é real).
  var abriu = false
  window.maybeAutoOnboarding = function(){
    if(abriu || !window.__statsLoaded || !isPro()) return
    abriu = true
    var forcar = /[?&]completar=1\b/.test(location.search)
    var ate = 0; try{ ate = Number(localStorage.getItem(SNOOZE_KEY) || 0) }catch(e){}
    if(!missing().length){ pedirPush(); return }
    if(!forcar && ate > Date.now()) return
    window.openOnboarding()
  }
})()
