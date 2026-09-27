// Construtor de Perfil com IA (2,99€) — checkout Stripe + conversa guiada com o assistente
// para melhorar o perfil profissional (bio, serviços, redes sociais, vídeo, prémios, promoções).
// Depende de db/profileData/profileId/escapeHtml/fillProfileForm/loadServices, já definidos
// noutros ficheiros do dashboard (carregados antes deste).

let aiBuilderHistory = []
let aiBuilderStarted = false

function renderAiBuilderBanner(){
  const wrap = document.getElementById('ai-builder-banner-wrap')
  if(!wrap || !profileData) return
  if(profileData.ai_profile_builder_unlocked){
    wrap.innerHTML = '<div class="upgrade-banner" style="background:linear-gradient(135deg,#4f46e5,#7c3aed)"><div><h3>✨ Construtor de Perfil com IA</h3><p>Já tens acesso. Conversa com o assistente para melhorar a tua bio, serviços, redes sociais, vídeo, prémios e promoções.</p></div><button class="btn btn-gold" onclick="openAiBuilder()">Abrir assistente →</button></div>'
  } else {
    wrap.innerHTML = '<div class="upgrade-banner" style="background:linear-gradient(135deg,#4f46e5,#7c3aed)"><div><h3>✨ Construtor de Perfil com IA</h3><p>Deixa a IA entrevistar-te e escrever um perfil profissional completo — bio, serviços, redes sociais, vídeo, prémios e promoções. Pagamento único de €2,99.</p></div><button class="btn btn-gold" onclick="startAiBuilderCheckout(event)">Desbloquear por €2,99 →</button></div>'
  }
}

async function startAiBuilderCheckout(evt){
  if(typeof db==='undefined'){alert('Erro a carregar o sistema de pagamentos. Recarrega a página.');return}
  const {data:{session}} = await db.auth.getSession()
  if(!session){alert('A tua sessão expirou. Inicia sessão novamente.');return}
  const btn = evt && evt.target ? evt.target : null
  const original = btn ? btn.textContent : null
  if(btn){btn.textContent='A processar...';btn.disabled=true}
  try{
    const {data,error} = await db.functions.invoke('create-ai-builder-checkout',{body:{}})
    if(error || !data){
      alert('Não foi possível iniciar o pagamento. Tenta novamente.')
      return
    }
    if(data.already_unlocked){
      profileData.ai_profile_builder_unlocked = true
      renderAiBuilderBanner()
      openAiBuilder()
      return
    }
    if(data.url){
      location.href = data.url
    } else {
      alert(data.error==='stripe_not_configured' ? 'O pagamento ainda não está configurado. Tenta mais tarde.' : (data.error||'Não foi possível iniciar o pagamento. Tenta novamente.'))
    }
  }catch(e){
    alert('Erro ao iniciar pagamento: '+e.message)
  }finally{
    if(btn){btn.textContent=original;btn.disabled=false}
  }
}

function openAiBuilder(){
  if(!profileData || !profileData.ai_profile_builder_unlocked){renderAiBuilderBanner();return}
  const overlay = document.getElementById('ai-builder-overlay')
  if(!overlay)return
  overlay.classList.add('open')
  const body = document.getElementById('ai-builder-body')
  if(body && !aiBuilderStarted){
    aiBuilderStarted = true
    aiBuilderHistory = []
    body.innerHTML = '<div class="ai-msg bot">Olá! Vou ajudar-te a melhorar o teu perfil. Para começar: há quantos anos trabalhas nesta área e que zona costumas servir?</div>'
  }
}

function closeAiBuilder(){
  const overlay = document.getElementById('ai-builder-overlay')
  if(overlay)overlay.classList.remove('open')
}

async function sendAiBuilderMsg(){
  const input = document.getElementById('ai-builder-input')
  const q = input.value.trim()
  if(!q)return
  const body = document.getElementById('ai-builder-body')
  body.insertAdjacentHTML('beforeend', `<div class="ai-msg user">${escapeHtml(q)}</div>`)
  input.value = ''
  const sendBtn = document.getElementById('ai-builder-send')
  sendBtn.disabled = true
  const typingId = 'ab-typing-'+Date.now()
  body.insertAdjacentHTML('beforeend', `<div class="ai-msg bot" id="${typingId}">…</div>`)
  body.scrollTop = body.scrollHeight

  try{
    const {data,error} = await db.functions.invoke('ai-profile-builder',{body:{message:q,history:aiBuilderHistory}})
    const typingEl = document.getElementById(typingId)
    if(typingEl)typingEl.remove()

    if(error || !data || data.error){
      if(data && data.checkout_needed){
        body.insertAdjacentHTML('beforeend', '<div class="ai-msg bot">Ainda não desbloqueaste esta funcionalidade.</div>')
        closeAiBuilder()
        profileData.ai_profile_builder_unlocked = false
        renderAiBuilderBanner()
      } else if(data && data.error==='rate_limited'){
        body.insertAdjacentHTML('beforeend', '<div class="ai-msg bot">Chegaste ao limite de mensagens por hoje. Amanhã continuamos.</div>')
      } else if(data && data.error==='not_configured'){
        body.insertAdjacentHTML('beforeend', '<div class="ai-msg bot">O assistente de IA ainda não foi ativado. Tenta mais tarde.</div>')
      } else {
        body.insertAdjacentHTML('beforeend', '<div class="ai-msg bot">Não consegui responder agora. Tenta novamente daqui a pouco.</div>')
      }
      sendBtn.disabled = false
      body.scrollTop = body.scrollHeight
      return
    }

    aiBuilderHistory.push({role:'user',content:q})
    aiBuilderHistory.push({role:'assistant',content:data.answer||''})
    body.insertAdjacentHTML('beforeend', `<div class="ai-msg bot">${escapeHtml(data.answer||'').replace(/\n/g,'<br>')}</div>`)
    if(data.suggestion && data.suggestion.fields){
      renderAiBuilderSuggestion(data.suggestion.fields)
    }
  }catch(e){
    const typingEl = document.getElementById(typingId)
    if(typingEl)typingEl.remove()
    body.insertAdjacentHTML('beforeend', '<div class="ai-msg bot">Erro de ligação. Tenta novamente.</div>')
  }
  sendBtn.disabled = false
  body.scrollTop = body.scrollHeight
}

const AI_BUILDER_FIELD_LABELS = {
  bio:'Bio', category:'Categoria', experience_years:'Anos de experiência', specialties:'Especialidades',
  languages:'Idiomas', certifications:'Certificações', has_insurance:'Seguro', services:'Serviços',
  social_links:'Redes sociais', intro_video_url:'Vídeo de apresentação', awards:'Prémios', promotions:'Promoções'
}

function aiBuilderFieldLabel(k){ return AI_BUILDER_FIELD_LABELS[k] || k }

function aiBuilderFieldPreview(v){
  if(Array.isArray(v)) return v.map(x => (x && typeof x==='object') ? Object.values(x).filter(Boolean).join(' ') : x).join(', ') || '(vazio)'
  if(v && typeof v==='object') return Object.entries(v).filter(([,val])=>val).map(([k,val])=>`${k}: ${val}`).join(', ') || '(vazio)'
  if(typeof v==='boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

function renderAiBuilderSuggestion(fields){
  const body = document.getElementById('ai-builder-body')
  const id = 'ab-sugg-'+Date.now()
  const lines = Object.entries(fields).map(([k,v]) => `<div style="margin-bottom:4px"><b>${escapeHtml(aiBuilderFieldLabel(k))}:</b> ${escapeHtml(aiBuilderFieldPreview(v))}</div>`).join('')
  window.__aiBuilderPending = window.__aiBuilderPending || {}
  window.__aiBuilderPending[id] = fields
  body.insertAdjacentHTML('beforeend', `<div class="ai-msg bot" id="${id}" style="border:1px solid var(--border);width:100%;max-width:100%"><div style="font-weight:700;margin-bottom:8px">Proposta de alterações ao perfil:</div>${lines}<div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-primary" style="padding:6px 14px;font-size:13px" onclick="applyAiBuilderSuggestion('${id}')">Aplicar ao perfil</button><button class="btn btn-outline" style="padding:6px 14px;font-size:13px" onclick="dismissAiBuilderSuggestion('${id}')">Ignorar</button></div></div>`)
  body.scrollTop = body.scrollHeight
}

async function applyAiBuilderSuggestion(id){
  const fields = window.__aiBuilderPending && window.__aiBuilderPending[id]
  const el = document.getElementById(id)
  if(!fields || !profileId){ if(el) el.remove(); return }
  try{
    const { services, ...profileFields } = fields
    if(Object.keys(profileFields).length){
      const {error} = await db.from('profiles').update(profileFields).eq('id', profileId)
      if(error){ alert('Não foi possível guardar: '+error.message); return }
      Object.assign(profileData, profileFields)
    }
    if(Array.isArray(services) && services.length){
      const rows = services.filter(s => s && (s.name || s.title)).map(s => ({
        professional_id: profileId,
        title: s.title || s.name,
        price_from: s.price_from!=null ? Number(s.price_from) : null,
        price_to: s.price_to!=null ? Number(s.price_to) : null,
        price_unit: s.price_unit || 'trabalho'
      }))
      if(rows.length){
        const {error:svcErr} = await db.from('services').insert(rows)
        if(svcErr){ alert('Perfil atualizado, mas não foi possível adicionar os serviços: '+svcErr.message) }
      }
    }
    if(el) el.innerHTML = '<div style="color:var(--green,#16a34a);font-weight:600">✓ Alterações aplicadas ao teu perfil.</div>'
    if(typeof fillProfileForm==='function') fillProfileForm(profileData)
    if(typeof loadServices==='function') loadServices()
  }catch(e){
    alert('Erro ao guardar: '+e.message)
  }finally{
    if(window.__aiBuilderPending) delete window.__aiBuilderPending[id]
  }
}

function dismissAiBuilderSuggestion(id){
  const el = document.getElementById(id)
  if(el) el.remove()
  if(window.__aiBuilderPending) delete window.__aiBuilderPending[id]
}

function handleAiBuilderCheckoutReturn(){
  const params = new URLSearchParams(location.search)
  const status = params.get('ai_builder')
  if(!status) return
  if(status==='success'){
    setTimeout(async () => {
      if(typeof db!=='undefined' && profileId){
        const {data} = await db.from('profiles').select('ai_profile_builder_unlocked').eq('id', profileId).single()
        if(data) profileData.ai_profile_builder_unlocked = data.ai_profile_builder_unlocked
      }
      renderAiBuilderBanner()
      alert('Pagamento confirmado! Já podes usar o Construtor de Perfil com IA.')
    }, 1000)
  } else if(status==='cancelled'){
    alert('Pagamento cancelado. Podes tentar novamente quando quiseres.')
  }
  params.delete('ai_builder')
  const qs = params.toString()
  history.replaceState({}, '', location.pathname + (qs ? '?'+qs : ''))
}

// Auto-inicializa o banner assim que profileData estiver disponível — não depende da ordem
// exata de carregamento dos scripts do dashboard (dashboard-core.js também chama isto,
// mas pode correr antes deste ficheiro estar pronto; isto garante que corre sempre).
;(function waitForProfileThenRender(tries){
  if(typeof profileData!=='undefined' && profileData){
    renderAiBuilderBanner()
    handleAiBuilderCheckoutReturn()
    return
  }
  if(tries>60) return
  setTimeout(function(){ waitForProfileThenRender(tries+1) }, 250)
})(0)
