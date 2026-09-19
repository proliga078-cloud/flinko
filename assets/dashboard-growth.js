// ===== NOTIFICAÇÕES PUSH (PWA) =====
const VAPID_PUBLIC_KEY='BA2gyreUT3GkDevWZvkMxc3zW-DLTEnbn9LQwrNkdLDSRlcPbi-5luCy6AxWwSdpXpDbo201QbhfgRvq4pvXAnM'
const PUSH_DISMISS_KEY='proliga_push_dismissed_at'
const PUSH_DISMISS_DAYS=14

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4)
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/')
  const rawData=atob(base64)
  const outputArray=new Uint8Array(rawData.length)
  for(let i=0;i<rawData.length;i++)outputArray[i]=rawData.charCodeAt(i)
  return outputArray
}

function maybeShowPushBanner(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return
  if(Notification.permission!=='default')return
  const t=localStorage.getItem(PUSH_DISMISS_KEY)
  if(t&&(Date.now()-Number(t))/86400000<PUSH_DISMISS_DAYS)return
  if(document.getElementById('push-banner'))return

  const el=document.createElement('div')
  el.id='push-banner'
  el.setAttribute('style','position:fixed;left:14px;right:14px;bottom:14px;z-index:9999;background:var(--ink,#132420);color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;font-family:inherit;max-width:420px;margin:0 auto')
  el.innerHTML=
    '<div style="width:38px;height:38px;border-radius:10px;background:#E8720A;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">🔔</div>'+
    '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">Ativar notificações</div><div style="font-size:11.5px;color:rgba(255,255,255,.65)">Sabe logo quando chega um pedido ou mensagem nova.</div></div>'+
    '<button id="push-enable-btn" style="background:#E8720A;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Ativar</button>'+
    '<button id="push-close-btn" aria-label="Fechar" style="background:transparent;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;padding:0 2px;line-height:1">&times;</button>'
  document.body.appendChild(el)

  document.getElementById('push-enable-btn').addEventListener('click',async()=>{
    el.remove()
    await enablePushNotifications()
  })
  document.getElementById('push-close-btn').addEventListener('click',()=>{
    localStorage.setItem(PUSH_DISMISS_KEY,String(Date.now()))
    el.remove()
  })
}

async function enablePushNotifications(){
  try{
    const perm=await Notification.requestPermission()
    if(perm!=='granted')return
    const reg=await navigator.serviceWorker.ready
    const sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
    const json=sub.toJSON()
    await db.from('push_subscriptions').upsert({
      profile_id:profileId,
      endpoint:json.endpoint,
      p256dh:json.keys.p256dh,
      auth:json.keys.auth
    },{onConflict:'endpoint'})
  }catch(e){
    console.error('push subscribe error:',e)
  }
}

// ===== REDE DE REFERÊNCIA ENTRE PROFISSIONAIS =====
function openReferModal(jobId){
  refJobId=jobId||null
  refSelectedPro=null
  document.getElementById('ref-search').value=''
  document.getElementById('ref-note').value=''
  document.getElementById('ref-results').innerHTML=''
  document.getElementById('ref-error').style.display='none'
  document.getElementById('refer-modal-overlay').classList.add('open')
  searchReferralPros()
}
function closeReferModal(){document.getElementById('refer-modal-overlay').classList.remove('open')}

let refSearchResults=[]
let refSearchToken=0
async function searchReferralPros(){
  const myToken=++refSearchToken
  const q=document.getElementById('ref-search').value.trim()
  let query=db.from('profiles').select('id,name,category,location,photo_url').neq('id',profileId).eq('approved',true).eq('suspended',false).eq('is_demo',false).limit(8)
  if(q)query=(orSafe(q)?query=query.or(`name.ilike.%${orSafe(q)}%,category.ilike.%${orSafe(q)}%,location.ilike.%${orSafe(q)}%`):query)
  else if(profileData?.category)query=query.eq('category',profileData.category)
  const{data}=await query
  if(myToken!==refSearchToken)return
  refSearchResults=data||[]
  const el=document.getElementById('ref-results')
  if(!refSearchResults.length){el.innerHTML='<div class="empty" style="padding:10px 0">Nenhum profissional encontrado.</div>';return}
  el.innerHTML=refSearchResults.map((p,i)=>{
    const initials=escapeHtml(p.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase())
    const avatar=p.photo_url?`<img src="${escapeHtml(p.photo_url)}"/>`:initials
    const sel=refSelectedPro&&refSelectedPro.id===p.id?'selected':''
    return`<div class="pro-pick-row ${sel}" onclick="selectReferralPro(${i})">
      <div class="pro-pick-avatar">${avatar}</div>
      <div><div style="font-weight:700;font-size:13px">${escapeHtml(p.name)}</div><div style="font-size:11.5px;color:var(--muted)">${escapeHtml(p.category||'')}${p.location?' · '+escapeHtml(p.location):''}</div></div>
    </div>`
  }).join('')
}

function selectReferralPro(i){
  const p=refSearchResults[i]
  if(!p)return
  refSelectedPro={id:p.id,name:p.name}
  document.querySelectorAll('.pro-pick-row').forEach((r,idx)=>r.classList.toggle('selected',idx===i))
}

async function submitReferral(){
  if(!refSelectedPro){showAlert('ref-error','Escolhe um profissional para recomendar.','error');return}
  const note=document.getElementById('ref-note').value.trim()
  const job=refJobId?allJobs.find(j=>j.id===refJobId):null
  const{error}=await db.from('referrals').insert({referrer_id:profileId,referred_id:refSelectedPro.id,job_id:refJobId,client_name:job?.client_name||null,note:note||null})
  if(error){showAlert('ref-error','Erro ao enviar recomendação: '+error.message,'error');return}
  // Manda tambem uma mensagem com os detalhes do trabalho, para o colega poder agir de imediato
  try{
    const otherId=refSelectedPro.id
    let conv=null
    const{data:existing}=await db.from('conversations').select('id').or('and(professional_id.eq.'+otherId+',client_id.eq.'+profileId+'),and(professional_id.eq.'+profileId+',client_id.eq.'+otherId+')').limit(1).maybeSingle()
    if(existing)conv=existing
    else{
      const{data:created}=await db.from('conversations').insert({professional_id:otherId,client_id:profileId}).select().single()
      conv=created
    }
    if(conv){
      let content=job?('Encaminhei-te um trabalho: '+job.title+'.'):'Encaminhei-te uma recomendação.'
      if(job?.job_type)content+=' Tipo: '+job.job_type+'.'
      if(note)content+=' Nota: '+note
      await db.from('messages').insert({conversation_id:conv.id,sender_id:profileId,content})
      await db.from('conversations').update({last_message:content,last_message_at:new Date().toISOString()}).eq('id',conv.id)
    }
  }catch(e){}
  closeReferModal()
  showAlert('job-success','Recomendação enviada a '+refSelectedPro.name+' — também lhe mandámos os detalhes por mensagem!')
  loadReferrals()
}

let pendingAdMedia={url:null,type:'photo'}

async function loadInvites(){
  if(!profileId)return
  const box=document.getElementById('invite-link-box')
  if(box){
    let code=profileData?.referral_code
    if(!code){
      const{data}=await db.rpc('get_my_profile')
      code=data&&data[0]?.referral_code
      if(code)profileData={...profileData,referral_code:code}
    }
    if(code){
      const url=location.origin+'/auth.html?tab=register&ref='+code
      box.innerHTML=`<input type="text" readonly value="${escapeHtml(url)}" style="margin-bottom:8px;font-size:12.5px" onclick="this.select()"/>
        <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${url}');showAlert('profile-success','Link copiado!')">Copiar link</button>`
    } else {
      box.innerHTML='<div class="empty">A gerar o teu link...</div>'
    }
  }
  await refreshCreditsBalance()

  const listEl=document.getElementById('invited-list')
  if(listEl){
    const{data}=await db.from('signup_referrals').select('created_at, referred:profiles!signup_referrals_referred_id_fkey(name,photo_url)').eq('referrer_id',profileId).order('created_at',{ascending:false})
    if(!data||!data.length)listEl.innerHTML='<div class="empty">Ainda não convidaste ninguém.</div>'
    else listEl.innerHTML=data.map(r=>`<div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(r.referred?.name||'Novo utilizador')}</div>
        <div class="list-item-sub">Registou-se em ${new Date(r.created_at).toLocaleDateString('pt-PT')}</div>
      </div>
    </div>`).join('')
  }
  renderActiveAdSlot()
}

async function refreshCreditsBalance(){
  const{data}=await db.rpc('get_my_profile')
  const credits=(data&&data[0]?.credits)||0
  profileData={...profileData,credits}
  updateCreditsBadge()
  const el=document.getElementById('credits-balance')
  if(el)el.textContent=Number(credits).toLocaleString('pt-PT',{maximumFractionDigits:1})
}

async function renderActiveAdSlot(){
  const el=document.getElementById('ad-active-box')
  if(!el)return
  const{data}=await db.from('ad_slots').select('*').eq('professional_id',profileId).eq('status','ativo').gt('ends_at',new Date().toISOString()).order('ends_at',{ascending:false}).limit(1).maybeSingle()
  if(!data){el.innerHTML='';return}
  const fim=new Date(data.ends_at).toLocaleDateString('pt-PT',{day:'numeric',month:'short'})
  el.innerHTML=`<div style="background:var(--blue-light);color:var(--blue);border-radius:8px;padding:10px 14px;font-size:13px;font-weight:600">🔵 Anúncio ativo até ${fim}</div>`
}

async function uploadAdMedia(input){
  const file=input.files[0]
  if(!file)return
  const isVideo=file.type.startsWith('video/')
  const maxSize=isVideo?15*1024*1024:5*1024*1024
  if(file.size>maxSize){showAlert('ad-error','Ficheiro demasiado grande. Máx '+(isVideo?'15MB (vídeo)':'5MB (foto)')+'.','error');return}
  const preview=document.getElementById('ad-media-preview')
  preview.innerHTML='<div style="font-size:13px;color:var(--muted)">⏳ A carregar...</div>'
  try{
    // resizeImageFile ignora ficheiros que não sejam imagem (ex: vídeo do
    // anúncio), por isso é seguro chamar sempre, mesmo aqui.
    const uploadFile=await resizeImageFile(file)
    const ext=uploadFile.name.split('.').pop()
    const path=`ads/${profileId}/${Date.now()}.${ext}`
    const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{upsert:true,contentType:uploadFile.type})
    if(error)throw error
    const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
    pendingAdMedia={url:urlData.publicUrl,type:isVideo?'video':'photo'}
    preview.innerHTML=isVideo
      ?`<video src="${escapeHtml(urlData.publicUrl)}" style="width:120px;height:68px;border-radius:8px;object-fit:cover" muted autoplay loop playsinline></video>`
      :`<img src="${urlData.publicUrl}" style="width:68px;height:68px;border-radius:8px;object-fit:cover"/>`
  }catch(e){
    preview.innerHTML=''
    showAlert('ad-error','Não foi possível carregar o ficheiro: '+(e.message||e),'error')
  }
}

async function buyAdSlot(){
  const days=parseInt(document.getElementById('ad-days').value,10)
  const{data,error}=await db.rpc('buy_ad_slot',{dias:days,media_url:pendingAdMedia.url,media_type:pendingAdMedia.type})
  if(error){showAlert('ad-error',error.message.includes('insuficiente')?'Não tens créditos suficientes para isto.':('Erro: '+error.message),'error');return}
  showAlert('ad-success','Anúncio ativado!')
  pendingAdMedia={url:null,type:'photo'}
  document.getElementById('ad-media-preview').innerHTML=''
  await refreshCreditsBalance()
  renderActiveAdSlot()
}

async function loadReferrals(){
  if(!profileId)return
  const relEl=document.getElementById('referrals-received')
  const sentEl=document.getElementById('referrals-sent')
  if(!relEl&&!sentEl)return
  const[{data:received},{data:sent}]=await Promise.all([
    db.from('referrals').select('*, referrer:profiles!referrals_referrer_id_fkey(name,category,photo_url)').eq('referred_id',profileId).order('created_at',{ascending:false}),
    db.from('referrals').select('*, referred:profiles!referrals_referred_id_fkey(name,category,photo_url)').eq('referrer_id',profileId).order('created_at',{ascending:false})
  ])
  if(relEl){
    if(!received||!received.length)relEl.innerHTML='<div class="empty">Ainda não recebeste recomendações de outros profissionais.</div>'
    else relEl.innerHTML=received.map(r=>`<div class="ref-card">
      <div class="rc-top"><strong>${escapeHtml(r.referrer?.name||'Profissional')}</strong><span class="ref-badge"><svg class="ic" viewBox="0 0 24 24" style="width:11px;height:11px"><path d="M20 6 9 17l-5-5"/></svg> Recomendação</span></div>
      ${r.client_name?`<div style="font-size:12.5px;color:var(--muted);margin-bottom:4px">Cliente: ${escapeHtml(r.client_name)}</div>`:''}
      ${r.note?`<div style="font-size:13px">${escapeHtml(r.note)}</div>`:''}
      <div style="font-size:11px;color:var(--muted);margin-top:6px">${new Date(r.created_at).toLocaleDateString('pt-PT')}</div>
    </div>`).join('')
  }
  if(sentEl){
    if(!sent||!sent.length)sentEl.innerHTML='<div class="empty">Ainda não recomendaste nenhum profissional.</div>'
    else sentEl.innerHTML=sent.map(r=>`<div class="ref-card">
      <div class="rc-top"><strong>Para: ${escapeHtml(r.referred?.name||'Profissional')}</strong></div>
      ${r.client_name?`<div style="font-size:12.5px;color:var(--muted);margin-bottom:4px">Cliente: ${escapeHtml(r.client_name)}</div>`:''}
      ${r.note?`<div style="font-size:13px">${escapeHtml(r.note)}</div>`:''}
      <div style="font-size:11px;color:var(--muted);margin-top:6px">${new Date(r.created_at).toLocaleDateString('pt-PT')}</div>
    </div>`).join('')
  }
}


async function saveNotifyPref(){
  if(!profileId)return
  const on=document.getElementById('notif-toggle').checked
  const{error}=await db.from('profiles').update({notify_email:on}).eq('id',profileId)
  if(error){showAlert('notif-error','Não foi possível guardar: '+error.message,'error');return}
  profileData={...profileData,notify_email:on}
  showAlert('notif-success', on?'Vais receber email quando um cliente te escrever.':'Deixaste de receber avisos por email.')
}

// PRIVACIDADE E RGPD
const GDPR_STATUS_LABELS={pending:'Pendente',in_progress:'Em tratamento',completed:'Concluído',cancelled:'Cancelado'}
const GDPR_TYPE_LABELS={export:'Exportação de dados',delete:'Eliminação da conta'}

async function requestGdprAction(type){
  const isDelete=type==='delete'
  const confirmMsg=isDelete
    ?'Tens a certeza que queres pedir a eliminação da tua conta? A tua equipa vai confirmar e tratar o pedido dentro de 30 dias, conforme o RGPD. Esta ação não pode ser desfeita depois de processada.'
    :'Confirmas o pedido de exportação dos teus dados? Vais receber uma cópia por email dentro de 30 dias.'
  if(!confirm(confirmMsg))return
  const{error}=await db.from('gdpr_requests').insert({profile_id:profileId,request_type:type})
  if(error){console.error('gdpr request error:',error);showAlert('gdpr-error','Não foi possível registar o pedido: '+(error.message||'erro desconhecido'),'error');return}
  showAlert('gdpr-success',isDelete?'Pedido de eliminação registado. Vamos confirmar por email e tratar dentro de 30 dias.':'Pedido de exportação registado. Vais receber os teus dados por email dentro de 30 dias.','success')
  loadGdprRequests()
}

async function cancelGdprRequest(id){
  if(!confirm('Cancelar este pedido?'))return
  const{error}=await db.from('gdpr_requests').update({status:'cancelled'}).eq('id',id)
  if(error){console.error('gdpr cancel error:',error);showAlert('gdpr-error','Não foi possível cancelar o pedido.','error');return}
  loadGdprRequests()
}

async function loadGdprRequests(){
  const el=document.getElementById('gdpr-list')
  if(!el)return
  const{data,error}=await db.from('gdpr_requests').select('*').eq('profile_id',profileId).order('created_at',{ascending:false})
  if(error){console.error('gdpr list error:',error);el.innerHTML='<div class="empty">Não foi possível carregar os teus pedidos.</div>';return}
  if(!data||!data.length){el.innerHTML='<div class="empty">Ainda não fizeste nenhum pedido.</div>';return}
  el.innerHTML=data.map(r=>{
    const statusLabel=GDPR_STATUS_LABELS[r.status]||r.status
    const typeLabel=GDPR_TYPE_LABELS[r.request_type]||r.request_type
    const date=r.created_at?new Date(r.created_at).toLocaleDateString('pt-PT'):'—'
    const cancelBtn=r.status==='pending'?`<button class="btn btn-outline" style="padding:5px 12px;font-size:11.5px" onclick="cancelGdprRequest('${r.id}')">Cancelar</button>`:''
    return `<div class="list-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13.5px">${escapeHtml(typeLabel)}</div><div style="font-size:12px;color:var(--muted)">Pedido em ${date} · ${escapeHtml(statusLabel)}</div></div>
      ${cancelBtn}
    </div>`
  }).join('')
}


// VERIFICAÇÃO DE PROFISSIONAL
const VERIF_STATUS_LABELS={pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',cancelled:'Cancelado'}
let pendingVerifDocs=[]

async function loadVerificationStatus(){
if(!profileId)return
const statusBox=document.getElementById('verif-status-box')
const formBox=document.getElementById('verif-form-box')
if(!statusBox||!formBox)return
if(profileData?.verified){
statusBox.style.display='block'
formBox.style.display='none'
statusBox.innerHTML='<div style="display:flex;align-items:center;gap:10px"><span style="font-size:22px">✅</span><div><div style="font-weight:700;font-size:14px">Perfil verificado</div><div style="font-size:12.5px;color:var(--muted)">O teu perfil já tem o selo de confiança Flinko.</div></div></div>'
return
}
const{data,error}=await db.from('verification_requests').select('*').eq('profile_id',profileId).order('created_at',{ascending:false}).limit(1).maybeSingle()
if(error){console.error('verification status error:',error);return}
if(data&&data.status==='pending'){
statusBox.style.display='block'
formBox.style.display='none'
const date=data.created_at?new Date(data.created_at).toLocaleDateString('pt-PT'):'—'
const docs=data.documents||[]
const links=await Promise.all(docs.map(async d=>{
const{data:signed}=await db.storage.from('verification-docs').createSignedUrl(d.path,3600)
return signed?`<div style="font-size:12.5px"><a href="${escapeHtml(signed.signedUrl)}" target="_blank" style="color:var(--blue)">📄 ${escapeHtml(d.name||'Documento')}</a></div>`:''
}))
statusBox.innerHTML=`<div style="font-weight:700;font-size:14px;margin-bottom:6px">⏳ Pedido em análise</div>
<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Enviado em ${date}. A nossa equipa vai analisar os documentos e confirmar por aqui.</div>
${links.join('')}
<button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="cancelVerificationRequest('${data.id}')">Cancelar pedido</button>`
return
}
if(data&&data.status==='rejected'){
statusBox.style.display='block'
formBox.style.display='block'
statusBox.innerHTML=`<div style="font-weight:700;font-size:14px;color:var(--red);margin-bottom:6px">❌ Pedido não aprovado</div>
<div style="font-size:12.5px;color:var(--muted)">${escapeHtml(data.admin_notes||'A nossa equipa não conseguiu confirmar os documentos enviados. Podes submeter um novo pedido abaixo.')}</div>`
pendingVerifDocs=[]
renderVerifDocList()
return
}
statusBox.style.display='none'
formBox.style.display='block'
pendingVerifDocs=[]
renderVerifDocList()
}

function renderVerifDocList(){
const el=document.getElementById('verif-doc-list')
if(!el)return
if(!pendingVerifDocs.length){el.innerHTML='';return}
el.innerHTML=pendingVerifDocs.map((d,i)=>`<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 0">
<span>📄</span><span style="flex:1">${escapeHtml(d.name)}</span>
<button type="button" class="btn btn-outline btn-sm" onclick="removeVerifDoc(${i})">Remover</button>
</div>`).join('')
}

function removeVerifDoc(i){
pendingVerifDocs.splice(i,1)
renderVerifDocList()
}

async function renderVerifNudge(){
const card=document.getElementById('verif-nudge-card')
if(!card)return
if(!profileData||profileData.account_type==='client'||profileData.verified){card.style.display='none';return}
const{data}=await db.from('verification_requests').select('status').eq('profile_id',profileId).order('created_at',{ascending:false}).limit(1).maybeSingle()
card.style.display=(data&&data.status==='pending')?'none':'block'
}

async function uploadVerificationDoc(input){
const file=input.files[0]
if(!file)return
if(file.size>10*1024*1024){showAlert('verif-error','Ficheiro demasiado grande. Máx 10MB.','error');return}
const isPdf=file.type==='application/pdf'
try{
const uploadFile=isPdf?file:await resizeImageFile(file)
const ext=uploadFile.name.split('.').pop()
const path=`${profileId}/${Date.now()}.${ext}`
const{error}=await db.storage.from('verification-docs').upload(path,uploadFile,{contentType:uploadFile.type})
if(error)throw error
pendingVerifDocs.push({path,name:file.name})
renderVerifDocList()
}catch(e){
showAlert('verif-error','Não foi possível carregar o documento: '+(e.message||e),'error')
}
input.value=''
}

async function submitVerificationRequest(){
if(!pendingVerifDocs.length){showAlert('verif-error','Carrega pelo menos um documento antes de enviar o pedido.','error');return}
const notes=document.getElementById('verif-notes').value.trim()
const{error}=await db.from('verification_requests').insert({profile_id:profileId,documents:pendingVerifDocs,notes:notes||null})
if(error){showAlert('verif-error','Não foi possível registar o pedido: '+(error.message||'erro desconhecido'),'error');return}
showAlert('verif-success','Pedido de verificação enviado! A nossa equipa vai analisar os documentos.')
document.getElementById('verif-notes').value=''
pendingVerifDocs=[]
loadVerificationStatus()
}

async function cancelVerificationRequest(id){
if(!confirm('Cancelar este pedido de verificação?'))return
const{error}=await db.from('verification_requests').update({status:'cancelled'}).eq('id',id)
if(error){showAlert('verif-error','Não foi possível cancelar o pedido.','error');return}
loadVerificationStatus()
}

function showAlert(id,msg,type='success'){
  const el=document.getElementById(id)
  if(!el)return
  el.textContent=msg;el.className=`alert ${type}`;el.style.display='block'
  if(type==='success')setTimeout(()=>el.style.display='none',4000)
}

async function signOut(){
  await db.auth.signOut()
  location.href='index.html'
}

init()
