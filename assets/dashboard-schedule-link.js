// ---------- DISPONIBILIDADE SEMANAL ----------
const WEEK_DAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
let weeklyScheduleState={}

function renderWeeklyScheduleGrid(){
  const el=document.getElementById('weekly-schedule-grid')
  if(!el)return
  const saved=profileData?.weekly_schedule||{}
  weeklyScheduleState={}
  WEEK_DAYS.forEach((_,i)=>{ weeklyScheduleState[i]=saved[i]!==undefined?!!saved[i]:(i>=1&&i<=5) })
  paintWeeklyScheduleGrid()
}

function paintWeeklyScheduleGrid(){
  const el=document.getElementById('weekly-schedule-grid')
  if(!el)return
  el.innerHTML=WEEK_DAYS.map((label,i)=>{
    const on=weeklyScheduleState[i]
    return `<button type="button" onclick="toggleWeeklyDay(${i})" style="width:56px;height:56px;border-radius:10px;border:1.5px solid ${on?'var(--blue)':'var(--border)'};background:${on?'var(--blue-light)':'var(--bg)'};color:${on?'var(--blue)':'var(--muted)'};font-weight:700;font-size:13px;cursor:pointer">${label}</button>`
  }).join('')
}

function toggleWeeklyDay(i){
  weeklyScheduleState[i]=!weeklyScheduleState[i]
  paintWeeklyScheduleGrid()
}

async function saveWeeklySchedule(){
  if(!profileId)return
  const{error}=await db.from('profiles').update({weekly_schedule:weeklyScheduleState}).eq('id',profileId)
  if(error){showAlert('profile-error','Não foi possível guardar: '+error.message);return}
  profileData={...profileData,weekly_schedule:weeklyScheduleState}
  showAlert('profile-success','Disponibilidade semanal guardada!')
}

// ---------- LINK PROPRIO (plano Pro) ----------
let slugTimer=null

function normalizeSlug(v){
  return (v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,30)
}

function slugHint(msg,cor){
  const h=document.getElementById('slug-hint')
  if(!h)return
  h.textContent=msg
  h.style.color=cor||'var(--muted-2)'
}

function onSlugInput(){
  const input=document.getElementById('p-slug')
  if(!input)return
  const limpo=normalizeSlug(input.value)
  if(input.value!==limpo)input.value=limpo
  clearTimeout(slugTimer)
  if(limpo.length<3){slugHint('Precisa de pelo menos 3 caracteres.');return}
  slugHint('A verificar disponibilidade...')
  slugTimer=setTimeout(()=>checkSlugFree(limpo),400)
}

async function checkSlugFree(valor){
  if(valor===(profileData&&profileData.slug)){slugHint('É o teu endereço atual.');return}
  const{data:reservado}=await db.from('reserved_slugs').select('slug').eq('slug',valor).maybeSingle()
  if(reservado){slugHint('Esse endereço está reservado pelo site.','var(--red)');return}
  const{count}=await db.from('profiles').select('id',{count:'exact',head:true}).eq('slug',valor)
  if(count&&count>0){slugHint('Já está ocupado. Tenta outro.','var(--red)');return}
  slugHint('Disponível.','var(--green)')
}

async function saveSlug(){
  const input=document.getElementById('p-slug')
  if(!input||!profileId)return
  const valor=normalizeSlug(input.value)
  if(valor.length<3){showAlert('profile-error','O endereço precisa de pelo menos 3 caracteres.','error');return}
  const btn=document.getElementById('slug-save')
  btn.disabled=true
  const{error}=await db.from('profiles').update({slug:valor,updated_at:new Date().toISOString()}).eq('id',profileId)
  btn.disabled=false
  if(error){
    // A base de dados e a ultima linha de defesa: bloqueia reservados,
    // formatos invalidos e quem nao tem plano Pro.
    const dup=(error.message||'').includes('duplicate')||error.code==='23505'
    showAlert('profile-error',dup?'Esse endereço já está ocupado.':('Não foi possível guardar: '+error.message),'error')
    return
  }
  profileData={...profileData,slug:valor}
  renderSlugLive()
  showAlert('profile-success','Link guardado. Já podes partilhá-lo.')
}

function slugUrl(){
  return location.origin+'/'+((profileData&&profileData.slug)||'')
}

function renderSlugLive(){
  const live=document.getElementById('slug-live')
  const input=document.getElementById('p-slug')
  if(!live||!input)return
  const slug=(profileData&&profileData.slug)||''
  input.value=slug
  if(!slug){live.style.display='none';return}
  live.style.display='block'
  const a=document.getElementById('slug-url')
  a.textContent=slugUrl().replace(/^https?:\/\//,'')
  a.href=slugUrl()
  drawQr()
}

function drawQr(){
  const alvo=document.getElementById('slug-qr')
  if(!alvo)return
  alvo.innerHTML=''
  if(typeof QRCode==='undefined'){loadLib('qrcode').then(drawQr).catch(()=>{alvo.innerHTML='<div style="font-size:11px;color:var(--muted-2);padding:8px">QR indisponível</div>'});return}
  new QRCode(alvo,{text:slugUrl(),width:120,height:120,correctLevel:QRCode.CorrectLevel.M})
}

function copySlugUrl(){
  navigator.clipboard.writeText(slugUrl())
    .then(()=>showAlert('profile-success','Link copiado.'))
    .catch(()=>showAlert('profile-error','Não consegui copiar. Seleciona o link à mão.','error'))
}

function downloadQr(){
  const img=document.querySelector('#slug-qr img')
  const canvas=document.querySelector('#slug-qr canvas')
  const fonte=img?img.src:(canvas?canvas.toDataURL('image/png'):null)
  if(!fonte){showAlert('profile-error','QR ainda não está pronto.','error');return}
  const a=document.createElement('a')
  a.href=fonte
  a.download='flinko-'+((profileData&&profileData.slug)||'qr')+'.png'
  document.body.appendChild(a);a.click();a.remove()
}

function applySlugGate(){
  if(typeof renderShare==='function')renderShare()
  const locked=document.getElementById('slug-locked')
  const body=document.getElementById('slug-body')
  if(!locked||!body)return
  const pode=!!planLimits.custom_link
  locked.style.display=pode?'none':'block'
  body.style.display=pode?'block':'none'
  if(pode)renderSlugLive()
}

