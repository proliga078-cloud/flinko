const SUPABASE_URL='https://cdwinidhtfxfxowflize.supabase.co'
const SUPABASE_KEY='sb_publishable_G1U9iSJLR2JkhD9gvfyY3Q_qaqnMaUk'
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
let user=null,profileData=null,profileId=null
let servicesCount=0,jobsChannel=null,msgsCount=0,reviewsCount=0,reviewsAvg=null
let chartViews=null,chartEarnings=null,chartStatus=null
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth(),calSelected=null
let aiChatOpen=false
let pendingAiAction=null
let quoteJobId=null,quotesCache=[]
let refJobId=null,refSelectedPro=null
let marketPriceCache=null
let planLimits={portfolio_max:3,quotes_per_month:3,finances:false,own_branding:false,custom_link:false,ai_actions:false}
async function loadPlanLimits(){
  const plano=(profileData&&profileData.plan)||'free'
  const{data}=await db.from('plan_limits').select('*').eq('plan',plano).maybeSingle()
  if(data)planLimits=data
  applyPlanGates()
}
function applyPlanGates(){
  const nav=document.querySelector('.nav-item[data-page="financas"]')
  if(nav)nav.style.display=planLimits.finances?'':'none'
  const navMkt=document.querySelector('.nav-item[data-page="mercado"]')
  if(navMkt)navMkt.style.display=planLimits.finances?'':'none'
  applySlugGate()
  const lock=document.getElementById('fin-lock')
  const body=document.getElementById('fin-body')
  if(lock&&body){
    lock.style.display=planLimits.finances?'none':'block'
    body.style.display=planLimits.finances?'':'none'
  }
  const mktLock=document.getElementById('mkt-lock')
  const mktBody=document.getElementById('mkt-body')
  if(mktLock&&mktBody){
    mktLock.style.display=planLimits.finances?'none':'block'
    mktBody.style.display=planLimits.finances?'':'none'
  }
}


// Upload foto de perfil para Supabase Storage
async function uploadProfilePhoto(input){
const file = input.files[0];
if(!file) return;
if(file.size > 5 * 1024 * 1024){ showAlert('profile-error','Foto demasiado grande. Máx 5MB.','error'); return; }
const preview = document.getElementById('p-photo-preview');
preview.innerHTML = '<div style="font-size:13px;color:var(--muted)">⏳ A carregar...</div>';
preview.style.display = 'block';
try {
const uploadFile = await resizeImageFile(file);
const ext = uploadFile.name.split('.').pop();
const path = `profiles/${user.id}/avatar.${ext}`;
const { data, error } = await db.storage.from('proliga-media').upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
if(error) throw error;
const { data: urlData } = db.storage.from('proliga-media').getPublicUrl(path);
const url = urlData.publicUrl;
document.getElementById('p-photo').value = url;
preview.innerHTML = `<img src="${escapeHtml(url)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--blue)"/>`;
  } catch(e) {
  console.error('Erro ao carregar foto de perfil:', e);
  showAlert('profile-error','Não foi possível carregar a foto. Tenta novamente.','error');
  preview.style.display = 'none';
  document.getElementById('p-photo').value = '';
  }
}

// Upload foto de portfólio para Supabase Storage
async function uploadPortfolioPhoto(input){
const file = input.files[0];
if(!file) return;
const plan=(profileData&&profileData.plan)||'free'
const portMax=planLimits.portfolio_max||3
const{count:portCount}=await db.from('portfolio_items').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
if(portCount>=portMax){
showAlert('port-error','Atingiste o limite de '+portMax+' fotos do plano grátis. O plano Pro tem portfólio ilimitado.','error')
input.value=''
return
}
if(file.size > 10 * 1024 * 1024){ showAlert('port-error','Foto demasiado grande. Máx 10MB.','error'); return; }
const preview = document.getElementById('port-upload-preview');
preview.innerHTML = '<div style="font-size:13px;color:var(--muted)">⏳ A carregar...</div>';
preview.style.display = 'block';
try {
const uploadFile = await resizeImageFile(file);
const ext = uploadFile.name.split('.').pop();
const path = `portfolio/${profileId}/${Date.now()}.${ext}`;
const { data, error } = await db.storage.from('proliga-media').upload(path, uploadFile, { contentType: uploadFile.type });
if(error) throw error;
const { data: urlData } = db.storage.from('proliga-media').getPublicUrl(path);
const url = urlData.publicUrl;
document.getElementById('port-url').value = url;
preview.innerHTML = `<img src="${escapeHtml(url)}" style="width:100px;height:100px;border-radius:10px;object-fit:cover;border:2px solid var(--blue)"/>`;
  } catch(e) {
  console.error('Erro ao carregar foto de portfólio:', e);
  showAlert('port-error','Não foi possível carregar a foto. Tenta novamente.','error');
  preview.style.display = 'none';
  document.getElementById('port-url').value = '';
  }
}

async function init(){
  try {
    const{data:{session}}=await db.auth.getSession()
    if(!session){location.href='auth.html';return}
    user=session.user
    // O proprio perfil (com campos sensiveis como creditos/plano/stripe)
    // ja nao se le diretamente da tabela — usa-se get_my_profile(), que so
    // devolve dados de quem esta autenticado a pedir.
    // get_my_profile() devolve SETOF (0 ou 1 linhas) em vez de sempre 1
    // "linha", para nunca haver ambiguidade quando o perfil ainda não existe.
    const{data:proRows}=await db.rpc('get_my_profile')
    const pro=proRows&&proRows[0]
    if(pro){profileData=pro;profileId=pro.id;await loadPrivatePhone();fillProfileForm(profileData)}
    else await createProfile()
    updateSidebar()
    if(profileId){
      loadStats()
      loadRecentMsgs()
      loadRecentReviews()
      loadMessages()
      loadReviews()
      loadServices()
      loadChatUnread()
      loadJobs()
      loadQuotes()
      loadMarketPricing()
      loadPlanLimits()
      subscribeJobsRealtime()
      setTimeout(maybeShowPushBanner, 2000)
    }
    checkUpgrade();if(profileData?.account_type==='client'){document.getElementById('quick-calc-card').style.display='none';var hidePages=['overview','trabalhos','clientes','agenda','profile','financas','mercado','reviews','referrals','convidar'];hidePages.forEach(function(p){document.querySelectorAll('[onclick*="showPage(\'' + p + '\')"]').forEach(function(el){el.style.display='none'})});document.querySelectorAll('[onclick*="viewPublicProfile"]').forEach(function(el){el.style.display='none'});var mobBar=document.querySelector('.mobile-nav-items');if(mobBar){var btn=document.createElement('div');btn.className='mob-item';btn.innerHTML='<span class="icon"><svg class="ic" viewBox="0 0 24 24"><path d="M3 11l18-7-7 18-3-8-8-3z"/></svg></span>Pedidos';btn.onclick=function(){showPage('myrequests');document.querySelectorAll('.mob-item').forEach(function(el){el.classList.remove('active')});btn.classList.add('active')};mobBar.appendChild(btn)}showPage('myrequests')}
  } catch(e) {
    console.error('init error:',e)
  }
}

async function createProfile(){
  const name=user.user_metadata?.name||user.email.split('@')[0]
  // Criar o perfil pela primeira vez passa por uma função (RPC) em vez de
  // um upsert direto: o "on conflict ... do update" do Postgres exige
  // SELECT sobre as colunas em causa (incluindo user_id) mesmo sem pedir
  // dados de volta — deixou de ser possível para o role authenticated
  // depois de restringirmos as colunas legíveis. A função corre com
  // privilégios completos, por isso não tem esse problema.
  const{error}=await db.rpc('create_my_profile_if_missing',{p_name:name})
  if(error){
    console.error('createProfile upsert error:',error)
  }
  const{data:existingRows}=await db.rpc('get_my_profile')
  const existing=existingRows&&existingRows[0]
  if(existing){profileData=existing;profileId=existing.id;await loadPrivatePhone();fillProfileForm(profileData)}
}

function updateSidebar(){
  const name=profileData?.name||user.email
  document.getElementById('sb-name').textContent=name
  const plan=profileData?.plan||'free'
  document.getElementById('sb-plan').textContent=plan==='premium'?'Premium':plan==='pro'?'Pro':'Plano Grátis'
  const initials=name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()
  const av=document.getElementById('sb-avatar')
  if(profileData?.photo_url)av.innerHTML=`<img src="${escapeHtml(profileData.photo_url)}" alt="${escapeHtml(name)}"/>`
  else av.textContent=initials
  const nt=document.getElementById('notif-toggle')
  if(nt)nt.checked=profileData?.notify_email!==false
  const ndt=document.getElementById('notif-digest-toggle')
  if(ndt)ndt.checked=profileData?.notify_digest!==false
  const dt=document.getElementById('hd-date')
  if(dt)dt.textContent=new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})
  renderSetup()
  const greetEl=document.getElementById('greet-title')
  if(greetEl)greetEl.textContent=`Olá, ${name.split(' ')[0]}`
}

async function loadPrivatePhone(){
  if(!profileId)return
  const{data}=await db.from('profile_private').select('phone').eq('profile_id',profileId).maybeSingle()
  profileData={...profileData,phone:data?.phone||''}
}

function fillProfileForm(pro){
  document.getElementById('p-name').value=pro.name||''
  document.getElementById('p-cat').value=pro.category||''
  document.getElementById('p-phone').value=pro.phone||''
  document.getElementById('p-website').value=pro.website||''
  const _loc=(pro.location||'').split(' – ');
document.getElementById('p-district').value=_loc[0]||''
document.getElementById('p-city').value=_loc[1]||''
  document.getElementById('p-photo').value=pro.photo_url||''
  document.getElementById('p-bio').value=pro.bio||''
  document.getElementById('p-exp').value=pro.experience_years||''
  document.getElementById('p-specialties').value=(pro.specialties||[]).join(', ')
  document.getElementById('p-languages').value=(pro.languages||[]).join(', ')
  document.getElementById('p-payments').value=(pro.payment_methods||[]).join(', ')
  document.getElementById('p-insurance').checked=!!pro.has_insurance
  certState=Array.isArray(pro.certifications)?JSON.parse(JSON.stringify(pro.certifications)):[]
  renderCertList()
  document.getElementById('p-unavail-until').value=pro.unavailable_until||''
  document.getElementById('p-unavail-msg').value=pro.unavailable_message||''
  // is_active field removed
  renderWeeklyScheduleGrid()
}

async function saveUnavailability(){
  if(!profileId)return
  const until=document.getElementById('p-unavail-until').value||null
  const msg=document.getElementById('p-unavail-msg').value.trim()||null
  const{error}=await db.from('profiles').update({unavailable_until:until,unavailable_message:msg}).eq('id',profileId)
  if(error){showAlert('unavail-error','Erro ao guardar: '+error.message,'error');return}
  profileData={...profileData,unavailable_until:until,unavailable_message:msg}
  showAlert('unavail-success',until?'Perfil marcado como indisponível até '+new Date(until+'T00:00:00').toLocaleDateString('pt-PT')+'.':'Guardado.')
}
async function clearUnavailability(){
  if(!profileId)return
  document.getElementById('p-unavail-until').value=''
  document.getElementById('p-unavail-msg').value=''
  const{error}=await db.from('profiles').update({unavailable_until:null,unavailable_message:null}).eq('id',profileId)
  if(error){showAlert('unavail-error','Erro: '+error.message,'error');return}
  profileData={...profileData,unavailable_until:null,unavailable_message:null}
  showAlert('unavail-success','Perfil marcado como disponível outra vez.')
}
async function saveDigestPref(){
  if(!profileId)return
  const on=document.getElementById('notif-digest-toggle').checked
  const{error}=await db.from('profiles').update({notify_digest:on}).eq('id',profileId)
  if(error){showAlert('notif-error','Não foi possível guardar: '+error.message,'error');return}
  profileData={...profileData,notify_digest:on}
  showAlert('notif-success', on?'Vais receber um resumo diário.':'Deixaste de receber o resumo diário.')
}

// ---------- SOBRE MIM AVANÇADO (certificações) ----------
let certState=[]
function renderCertList(){
  const el=document.getElementById('cert-list')
  if(!el)return
  if(!certState.length){el.innerHTML='<div style="font-size:12.5px;color:var(--muted)">Nenhuma certificação adicionada.</div>';return}
  el.innerHTML=certState.map((c,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);border-radius:8px;padding:8px 12px"><span style="font-size:13px;font-weight:600">${escapeHtml(c.name)}${c.year?' · '+escapeHtml(String(c.year)):''}</span><button type="button" class="btn btn-danger btn-sm" onclick="removeCertification(${i})">✕</button></div>`).join('')
}
function addCertification(){
  const name=document.getElementById('cert-name').value.trim()
  const year=document.getElementById('cert-year').value.trim()
  if(!name)return
  certState.push({name,year:year||null})
  document.getElementById('cert-name').value=''
  document.getElementById('cert-year').value=''
  renderCertList()
}
function removeCertification(i){certState.splice(i,1);renderCertList()}
function splitCsv(v){return (v||'').split(',').map(s=>s.trim()).filter(Boolean)}

function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}

// Gera uma bio a partir dos campos já preenchidos no formulário — sem IA generativa,
// apenas modelos de frase combinados de forma variada para não parecer sempre igual.
function generateBioWithAI(){
  const cat=document.getElementById('p-cat').value
  const city=document.getElementById('p-city').value.trim()||document.getElementById('p-district').value
  const exp=document.getElementById('p-exp').value.trim()
  const specialties=splitCsv(document.getElementById('p-specialties').value)
  const payments=splitCsv(document.getElementById('p-payments').value)
  const insured=document.getElementById('p-insurance').checked
  const certs=(certState||[]).map(c=>c.name).filter(Boolean)

  if(!cat){showAlert('profile-error','Escolhe primeiro uma categoria — preciso disso para escrever a bio.','error');return}

  const parts=[]

  if(exp){
    parts.push(pick([
      `Profissional de ${cat} em ${city||'Portugal'}, com ${exp} anos de experiência.`,
      `Com ${exp} anos de experiência, trabalho na área de ${cat} em ${city||'Portugal'}.`,
      `Há ${exp} anos a trabalhar como ${cat} em ${city||'Portugal'}.`
    ]))
  } else {
    parts.push(pick([
      `Profissional de ${cat} em ${city||'Portugal'}.`,
      `Trabalho na área de ${cat} em ${city||'Portugal'}.`
    ]))
  }

  if(specialties.length){
    const list=specialties.join(', ')
    parts.push(pick([
      `Sou especializado em ${list}.`,
      `As minhas áreas fortes incluem ${list}.`,
      `Dou especial atenção a ${list}.`
    ]))
  }

  if(certs.length){
    const list=certs.join(', ')
    parts.push(pick([
      `Tenho certificação em ${list}.`,
      `Sou certificado em ${list}.`
    ]))
  }

  if(insured){
    parts.push(pick([
      'Trabalho com seguro de responsabilidade civil, para tua total tranquilidade.',
      'Tenho seguro de responsabilidade civil ativo.'
    ]))
  }

  if(payments.length){
    parts.push(`Aceito pagamento por ${payments.join(', ')}.`)
  }

  parts.push(pick([
    'Contacta-me para um orçamento sem compromisso.',
    'Fala comigo e vamos encontrar a melhor solução para o teu projeto.',
    'Disponível para esclarecer qualquer dúvida antes de avançarmos.'
  ]))

  document.getElementById('p-bio').value=parts.join(' ')
  showAlert('profile-success','Bio gerada — revê o texto e ajusta o que quiseres antes de guardar.')
}

async function saveProfile(){
  if(!profileId){showAlert('profile-error','Erro: perfil não carregado. Recarrega a página.','error');return}
  const name=document.getElementById('p-name').value.trim()
  const category=document.getElementById('p-cat').value
  const _district=document.getElementById('p-district').value
const _city=document.getElementById('p-city').value.trim()
const location=_district?(_city?_district+' – '+_city:_district):''
  if(!name||!category||!location){showAlert('profile-error','Preenche nome, categoria e localização.','error');return}
  const phoneVal=document.getElementById('p-phone').value.trim()||null
  const updates={
    name,category,location,
    website:document.getElementById('p-website').value.trim()||null,
    photo_url:document.getElementById('p-photo').value.trim()||null,
    bio:document.getElementById('p-bio').value.trim()||null,
    experience_years:parseInt(document.getElementById('p-exp').value)||null,
    specialties:splitCsv(document.getElementById('p-specialties').value),
    languages:splitCsv(document.getElementById('p-languages').value),
    payment_methods:splitCsv(document.getElementById('p-payments').value),
    has_insurance:document.getElementById('p-insurance').checked,
    certifications:certState,
    updated_at:new Date().toISOString()
  }
  const{error}=await db.from('profiles').update(updates).eq('id',profileId)
  if(error){showAlert('profile-error','Erro ao guardar: '+error.message);return}
  const{error:phoneErr}=await db.from('profile_private').upsert({profile_id:profileId,phone:phoneVal,updated_at:new Date().toISOString()},{onConflict:'profile_id'})
  if(phoneErr){showAlert('profile-error','Perfil guardado, mas o telefone não foi atualizado: '+phoneErr.message);return}
  profileData={...profileData,...updates,phone:phoneVal}
  updateSidebar()
  showAlert('profile-success','Perfil guardado com sucesso!')
}

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
  if(typeof QRCode==='undefined'){alvo.innerHTML='<div style="font-size:11px;color:var(--muted-2);padding:8px">QR indisponível</div>';return}
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
  a.download='proliga-'+((profileData&&profileData.slug)||'qr')+'.png'
  document.body.appendChild(a);a.click();a.remove()
}

function applySlugGate(){
  const locked=document.getElementById('slug-locked')
  const body=document.getElementById('slug-body')
  if(!locked||!body)return
  const pode=!!planLimits.custom_link
  locked.style.display=pode?'none':'block'
  body.style.display=pode?'block':'none'
  if(pode)renderSlugLive()
}

async function loadStats(){
  const[{count:mc},{count:rc},{data:revs},{count:sc}]=await Promise.all([
    db.from('conversations').select('*',{count:'exact',head:true}).eq('professional_id',profileId),
    db.from('reviews').select('*',{count:'exact',head:true}).eq('professional_id',profileId),
    db.from('reviews').select('rating').eq('professional_id',profileId),
    db.from('services').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
  ])
  servicesCount=sc||0
  msgsCount=mc||0
  reviewsCount=rc||0
  document.getElementById('stat-msgs').textContent=mc||0
  const msub=document.getElementById('stat-msgs-sub')
  if(msub)msub.textContent=(mc||0)>0?'Em curso':'Nenhuma por responder'
  document.getElementById('stat-services').textContent=sc||0
  if(revs&&revs.length){
    reviewsAvg=(revs.reduce((s,r)=>s+r.rating,0)/revs.length).toFixed(1)
    document.getElementById('stat-avg').textContent=reviewsAvg
  } else {reviewsAvg=null;document.getElementById('stat-avg').textContent='—'}

  // Visualizações do perfil (últimos 30 dias) + gráfico
  const d30=new Date();d30.setDate(d30.getDate()-29);d30.setHours(0,0,0,0)
  const{data:views}=await db.from('profile_views').select('viewed_at').eq('profile_id',profileId).gte('viewed_at',d30.toISOString().slice(0,10))
  document.getElementById('stat-views').textContent=views?views.length:0
  renderViewsChart(views||[])

  // Faturação este mês
  const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0)
  const{data:paidJobs}=await db.from('jobs').select('paid_amount').eq('professional_id',profileId).eq('status','pago').gte('paid_at',monthStart.toISOString())
  const total=(paidJobs||[]).reduce((s,j)=>s+(Number(j.paid_amount)||0),0)
  document.getElementById('stat-earnings').textContent=total>0?('€'+total.toFixed(0)):'€0'
  const esub=document.getElementById('stat-earnings-sub')
  if(esub)esub.textContent=(paidJobs&&paidJobs.length)?((paidJobs.length)+' trabalho'+(paidJobs.length!==1?'s':'')+' pago'+(paidJobs.length!==1?'s':'')):'Sem trabalhos pagos'
  const cw=document.getElementById('charts-wrap')
  if(cw&&(total>0||(views&&views.length)))cw.style.display='grid'

  // Faturação últimos 6 meses (gráfico)
  const d6=new Date();d6.setMonth(d6.getMonth()-5);d6.setDate(1);d6.setHours(0,0,0,0)
  const{data:paid6}=await db.from('jobs').select('paid_amount,paid_at').eq('professional_id',profileId).eq('status','pago').gte('paid_at',d6.toISOString())
  renderEarningsChart(paid6||[])

  // Badge
  const{count:unread}=await db.from('messages_legacy_contact_form').select('*',{count:'exact',head:true}).eq('professional_id',profileId).eq('read',false)
  if(unread>0){
    const badge=document.getElementById('msg-badge')
    if(badge){badge.style.display='inline';badge.textContent=unread}
  }
  renderInsights()
  renderFollowupReminders()
}

function renderViewsChart(views){
  const ctx=document.getElementById('chart-views')
  if(!ctx||typeof Chart==='undefined')return
  const days=[],counts={}
  for(let i=29;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i)
    const key=d.toISOString().slice(0,10)
    days.push(key);counts[key]=0
  }
  views.forEach(v=>{if(counts[v.viewed_at]!==undefined)counts[v.viewed_at]++})
  const labels=days.map(d=>{const dt=new Date(d+'T00:00:00');return dt.getDate()+'/'+(dt.getMonth()+1)})
  const data=days.map(d=>counts[d])
  if(chartViews)chartViews.destroy()
  chartViews=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[{data,borderColor:'#E8720A',backgroundColor:'rgba(232,114,10,.08)',fill:true,tension:.3,pointRadius:0,borderWidth:2}]},
    options:{plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:6,font:{size:10}},grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0,font:{size:10}}}}}
  })
}

function renderEarningsChart(paidJobs){
  const ctx=document.getElementById('chart-earnings')
  if(!ctx||typeof Chart==='undefined')return
  const months=[]
  for(let i=5;i>=0;i--){
    const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i)
    months.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('pt-PT',{month:'short'})})
  }
  const totals={}
  months.forEach(m=>totals[m.key]=0)
  paidJobs.forEach(j=>{
    if(!j.paid_at)return
    const d=new Date(j.paid_at)
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
    if(totals[key]!==undefined)totals[key]+=Number(j.paid_amount)||0
  })
  if(chartEarnings)chartEarnings.destroy()
  chartEarnings=new Chart(ctx,{
    type:'bar',
    data:{labels:months.map(m=>m.label),datasets:[{data:months.map(m=>totals[m.key]),backgroundColor:'#E8720A',borderRadius:6,maxBarThickness:28}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,ticks:{callback:v=>'€'+v,font:{size:10}}}}}
  })
}

function renderStatusChart(jobs){
  const ctx=document.getElementById('chart-status')
  if(!ctx||typeof Chart==='undefined')return
  const counts={}
  jobs.forEach(j=>{counts[j.status]=(counts[j.status]||0)+1})
  let labels=Object.keys(counts).map(k=>JOB_STATUS_LABELS[k]||k)
  let data=Object.values(counts)
  let colors=['#E8720A','#F59E0B','#22c55e','#a855f7','#ef4444','#06b6d4','#64748b','#94a3b8']
  if(!data.length){labels=['Sem trabalhos'];data=[1];colors=['#e5e7eb']}
  if(chartStatus)chartStatus.destroy()
  chartStatus=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},
    options:{plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10,padding:8}}},cutout:'62%'}
  })
}

function renderSetup(){
  const card=document.getElementById('setup-card')
  if(!card||!profileData)return
  if(profileData.account_type==='client'){card.style.display='none';return}
  const passos=[
    {t:'Criar conta',s:'',ok:true},
    {t:'Escolher categoria e zona',s:'Para apareceres nas pesquisas certas',ok:!!(profileData.category&&profileData.location),go:()=>showPage('profile')},
    {t:'Acrescenta foto e descrição',s:'Perfis com foto recebem mais contactos',ok:!!(profileData.photo_url&&profileData.bio),go:()=>showPage('profile')},
    {t:'Publica o primeiro serviço',s:'Sem serviços não apareces nas pesquisas',ok:servicesCount>0,go:()=>showPage('services')}
  ]
  const feitos=passos.filter(p=>p.ok).length
  if(feitos===passos.length){card.style.display='none';return}
  card.style.display='block'
  const faltam=passos.length-feitos
  document.getElementById('setup-title').textContent=`Falta${faltam>1?'m':''} ${faltam} passo${faltam>1?'s':''} para apareceres nas pesquisas`
  document.getElementById('setup-count').textContent=`${feitos} / ${passos.length}`
  document.getElementById('setup-fill').style.width=(feitos/passos.length*100)+'%'
  document.getElementById('setup-list').innerHTML=passos.map((p,i)=>{
    if(p.ok)return `<div class="setup-row done"><svg class="ic" viewBox="0 0 24 24" style="width:19px;height:19px;color:var(--green)"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-4.5"/></svg><div class="sr-txt"><div class="sr-t">${p.t}</div></div></div>`
    const primeiro=passos.findIndex(x=>!x.ok)===i
    return `<div class="setup-row"><div class="sr-circle"></div><div class="sr-txt"><div class="sr-t">${p.t}</div><div class="sr-s">${p.s}</div></div>
      <button class="btn ${primeiro?'btn-primary':'btn-outline'} btn-sm" onclick="setupGo(${i})">${primeiro?'Completar':'Adicionar'}</button></div>`
  }).join('')
  window.__setupPassos=passos
}
function setupGo(i){const p=(window.__setupPassos||[])[i];if(p&&p.go)p.go()}

function renderFollowupReminders(){
  const sec=document.getElementById('followup-section')
  const list=document.getElementById('followup-list')
  if(!sec||!list)return
  const now=new Date()
  const needsFollowup=allJobs.filter(j=>{
    if(j.status!=='orcamento_enviado')return false
    const base=j.last_followup_at||j.quote_sent_at||j.created_at
    if(!base)return false
    return (now-new Date(base))/86400000>=3
  }).sort((a,b)=>new Date(a.last_followup_at||a.quote_sent_at||a.created_at)-new Date(b.last_followup_at||b.quote_sent_at||b.created_at))

  if(!needsFollowup.length){sec.style.display='none';return}
  sec.style.display='block'
  list.innerHTML=needsFollowup.map(j=>{
    const base=new Date(j.last_followup_at||j.quote_sent_at||j.created_at)
    const dias=Math.floor((now-base)/86400000)
    return `<div class="fin-row">
      <div style="flex:1;min-width:0"><div class="fr-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(j.title)}</div>
      <div class="fr-s">${escapeHtml(j.client_name||'Cliente')} · orçamento parado há ${dias} dia${dias!==1?'s':''}</div></div>
      <button class="btn btn-outline btn-sm" onclick="markFollowedUp('${j.id}')">Marcar como contactado</button>
    </div>`
  }).join('')
}

async function markFollowedUp(jobId){
  const{error}=await db.from('jobs').update({last_followup_at:new Date().toISOString()}).eq('id',jobId)
  if(error){alert('Erro: '+error.message);return}
  const j=allJobs.find(x=>x.id===jobId)
  if(j)j.last_followup_at=new Date().toISOString()
  renderFollowupReminders()
}

function renderInsights(){
  const el=document.getElementById('ai-insights')
  if(!el||!profileData)return
  const tips=[]
  const now=new Date()

  const missing=[]
  if(!profileData.photo_url)missing.push('foto de perfil')
  if(!profileData.bio)missing.push('biografia')
  if(missing.length)tips.push({type:'warn',icon:'alert',text:`O teu perfil está incompleto (falta ${missing.join(' e ')}). Perfis completos recebem mais contactos.`})

  if(servicesCount===0)tips.push({type:'warn',icon:'alert',text:'Ainda não publicaste nenhum serviço. Adiciona pelo menos um em "Serviços" para apareceres nas pesquisas.'})

  const stale=allJobs.filter(j=>['novo','negociacao'].includes(j.status)&&(now-new Date(j.created_at))/86400000>3)
  if(stale.length)tips.push({type:'warn',icon:'clock',text:`Tens ${stale.length} trabalho${stale.length>1?'s':''} por avançar há mais de 3 dias. Responder rápido aumenta as hipóteses de fechar negócio.`})

  const waiting=allJobs.filter(j=>j.status==='orcamento_enviado'&&j.quote_sent_at&&(now-new Date(j.quote_sent_at))/86400000>5)
  if(waiting.length)tips.push({type:'warn',icon:'clock',text:`Tens ${waiting.length} orçamento${waiting.length>1?'s':''} enviado${waiting.length>1?'s':''} há mais de 5 dias sem resposta. Considera fazer um follow-up.`})

  const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7)
  const thisWeek=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now&&new Date(j.scheduled_at)<=weekEnd)
  if(thisWeek.length)tips.push({type:'good',icon:'calendar',text:`Tens ${thisWeek.length} trabalho${thisWeek.length>1?'s':''} agendado${thisWeek.length>1?'s':''} para os próximos 7 dias.`})

  const paid=allJobs.filter(j=>j.status==='pago'&&j.paid_amount)
  if(paid.length){
    const avgTicket=paid.reduce((s,j)=>s+Number(j.paid_amount),0)/paid.length
    tips.push({type:'good',icon:'trend',text:`O teu ticket médio é de €${avgTicket.toFixed(0)}, com base em ${paid.length} trabalho${paid.length>1?'s':''} pago${paid.length>1?'s':''}.`})
  }

  const completed=allJobs.filter(j=>j.completed_at)
  if(completed.length>=3){
    const dowCount=[0,0,0,0,0,0,0]
    completed.forEach(j=>dowCount[new Date(j.completed_at).getDay()]++)
    const maxIdx=dowCount.indexOf(Math.max(...dowCount))
    const dowNames=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
    tips.push({type:'good',icon:'chart',text:`A maior parte dos teus trabalhos concluídos caem à ${dowNames[maxIdx]}.`})
  }

  if(marketPriceCache&&marketPriceCache.category===profileData.category)tips.push({type:'good',icon:'coin',text:`Profissionais de ${profileData.category} na Proliga cobram, em média, entre €${marketPriceCache.lo.toFixed(0)} e €${marketPriceCache.hi.toFixed(0)}. Usa isto para ajustares os teus preços.`})

  const respN=profileData.response_sample_count||0
  const respM=profileData.avg_response_minutes
  if(respN>=3&&respM!=null){
    if(Number(respM)<=120)tips.push({type:'good',icon:'clock',text:`Respondes em média em ${fmtResponseMins(respM)} — o selo "Responde rápido" está visível no teu perfil público. Continua assim.`})
    else tips.push({type:'warn',icon:'clock',text:`Respondes em média em ${fmtResponseMins(respM)}. Se responderes em menos de 2 horas, ganhas o selo "Responde rápido" no teu perfil público.`})
  }else if(respN>0){
    tips.push({type:'good',icon:'clock',text:`Faltam ${3-respN} resposta${3-respN>1?'s':''} a clientes para calcularmos o teu tempo médio e mostrarmos o selo no perfil.`})
  }

  const fechados=allJobs.filter(j=>['concluido','pago'].includes(j.status)&&Number(j.paid_amount??j.quote_amount??0)>0)
  const comMat=fechados.filter(j=>j.material_cost!=null)
  if(fechados.length>=2&&comMat.length===0){
    tips.push({type:'warn',icon:'coin',text:`Tens ${fechados.length} trabalhos fechados mas nenhum com o custo de material preenchido. Sem isso não sabes quanto sobrou — só quanto entrou. Preenche em "Trabalhos".`})
  }else if(comMat.length>=2){
    const g={}
    comMat.forEach(j=>{
      const k=(j.job_type&&j.job_type.trim())||'Sem tipo'
      if(!g[k])g[k]={rec:0,mat:0}
      g[k].rec+=Number(j.paid_amount??j.quote_amount??0)
      g[k].mat+=Number(j.material_cost??0)
    })
    const arr=Object.entries(g).map(([t,v])=>({t,pct:v.rec>0?((v.rec-v.mat)/v.rec)*100:0})).sort((a,b)=>b.pct-a.pct)
    if(arr.length>=2&&arr[0].pct-arr[arr.length-1].pct>=15){
      tips.push({type:'good',icon:'coin',text:`Os teus trabalhos de ${arr[0].t} deixam ${arr[0].pct.toFixed(0)}% de margem, contra ${arr[arr.length-1].pct.toFixed(0)}% nos de ${arr[arr.length-1].t}. Vê o detalhe em Finanças.`})
    }else{
      const totR=comMat.reduce((a,j)=>a+Number(j.paid_amount??j.quote_amount??0),0)
      const totM=comMat.reduce((a,j)=>a+Number(j.material_cost??0),0)
      if(totR>0)tips.push({type:'good',icon:'coin',text:`A tua margem média é de ${(((totR-totM)/totR)*100).toFixed(0)}%, com base em ${comMat.length} trabalhos com material registado.`})
    }
  }

  if(!tips.length)tips.push({type:'good',icon:'check',text:'Tudo em dia! Sem alertas de momento — continua o bom trabalho.'})

  el.innerHTML=tips.map(t=>`<div class="insight-card ${t.type}"><div class="ic-badge">${insightIcon(t.icon)}</div><div>${t.text}</div></div>`).join('')
}

function fmtResponseMins(mins){
  const m=Number(mins)
  if(!isFinite(m))return '—'
  if(m<60)return `${Math.round(m)} min`
  if(m<1440)return `${(m/60).toFixed(m<600?1:0).replace('.0','')} h`
  const d=Math.round(m/1440)
  return `${d} dia${d>1?'s':''}`
}

function insightIcon(name){
  const paths={
    alert:'<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    trend:'<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    chart:'<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15.5 9.5a2.5 2.5 0 0 0-2.5-2H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2.5 2.5 0 0 1-2.5-2"/>'
  }
  return `<svg class="ic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.check}</svg>`
}

function renderMiniAgenda(){
  const el=document.getElementById('mini-agenda')
  if(!el)return
  const now=new Date()
  const upcoming=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)).slice(0,3)
  if(!upcoming.length){el.innerHTML='<div class="tc-empty"><div class="ico" style="background:var(--blue-light);color:var(--blue)"><svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><p>Nada marcado.<br/><span>Clica num dia para adicionares.</span></p></div>';return}
  el.innerHTML=upcoming.map(j=>{
    const d=new Date(j.scheduled_at)
    const dateStr=d.toLocaleDateString('pt-PT',{weekday:'short',day:'2-digit',month:'short'})
    const timeStr=d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})
    return `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
      <div style="width:30px;height:30px;border-radius:9px;background:var(--blue-light);color:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg></div>
      <div style="min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(j.title)}</div><div style="font-size:11px;color:var(--muted)">${dateStr}, ${timeStr}</div></div>
    </div>`
  }).join('')
}

function subscribeJobsRealtime(){
  if(jobsChannel)return
  jobsChannel=db.channel('jobs-changes-'+profileId)
    .on('postgres_changes',{event:'*',schema:'public',table:'jobs',filter:'professional_id=eq.'+profileId},()=>{
      loadJobs()
      loadStats()
    })
    .subscribe()
}

async function loadRecentMsgs(){
  const{data}=await db.from('conversations').select('id,client_id,last_message,last_message_at').eq('professional_id',profileId).order('last_message_at',{ascending:false}).limit(3)
  const el=document.getElementById('recent-msgs')
  if(!data||!data.length){el.innerHTML='<div class="tc-empty"><div class="ico" style="background:var(--green-light,#EAF7EE);color:var(--green)"><svg class="ic" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p>Ainda sem mensagens.<br/><span>Avisamos-te por email quando chegarem.</span></p></div>';return}
  const clientIds=data.map(c=>c.client_id)
  const{data:clients}=await db.from('profiles').select('id,name').in('id',clientIds)
  const nameMap={}
  clients&&clients.forEach(c=>nameMap[c.id]=c.name)
  el.innerHTML=data.map(m=>`
    <div class="msg-item" onclick="location.href='messages.html'">
      <div class="msg-header"><div class="msg-from">${nameMap[m.client_id]||'Cliente'}</div><div class="msg-date">${new Date(m.last_message_at).toLocaleDateString('pt-PT')}</div></div>
      <div class="msg-preview">${(m.last_message||'').slice(0,120)}</div>
    </div>`).join('')
}

async function loadRecentReviews(){
  const{data}=await db.from('reviews').select('*').eq('professional_id',profileId).order('created_at',{ascending:false}).limit(3)
  const el=document.getElementById('recent-reviews')
  if(!data||!data.length){el.innerHTML='<div class="empty">Sem avaliações ainda</div>';return}
  el.innerHTML=data.map(r=>{
    const stars='★'.repeat(r.rating)+'☆'.repeat(5-r.rating)
    return`<div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(r.reviewer_name)} <span style="color:var(--gold)">${stars}</span></div>
        <div class="list-item-sub">${escapeHtml(r.comment||'(sem comentário)')}</div>
      </div>
    </div>`
  }).join('')
}

function checkUpgrade(){
  const plan=profileData?.plan||'free'
  const banner=document.getElementById('upgrade-banner-wrap')
  if(plan==='free'){
    banner.innerHTML=`<div class="upgrade-banner">
      <div><h3>Aumenta a visibilidade do teu perfil</h3><p>Plano Pro: portfólio, badge verificado, destaque nas pesquisas. A partir de €9/mês.</p></div>
      <button class="btn btn-gold" onclick="location.href='pricing.html'">Atualizar plano →</button>
    </div>`
  } else if(plan==='pro'){
    banner.innerHTML=`<div class="upgrade-banner" style="background:linear-gradient(135deg,#C25A06,#E8720A)">
      <div><h3>Estás no plano Pro</h3><p>Portefólio, selo verificado e destaque nas pesquisas — tudo ativo.</p></div>
      <button class="btn btn-outline" style="background:#fff" onclick="manageBilling()">Gerir subscrição</button>
    </div>`
  }
  // Portfolio disponivel para todos
  loadPortfolio()
  loadDiaryDash()
  loadFaqsDash()
}

// SERVICES
async function loadServices(){
  const{data}=await db.from('services').select('*').eq('professional_id',profileId).order('created_at')
  const el=document.getElementById('services-list')
  if(!data||!data.length){el.innerHTML='<div class="empty">Sem serviços publicados ainda.</div>';return}
  el.innerHTML=data.map(s=>`
    <div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(s.title)}</div>
        <div class="list-item-sub">${escapeHtml(s.description||'')} ${s.price_from?`· €${s.price_from}${s.price_to?'–€'+s.price_to:''} / ${s.price_unit||'hora'}`:''}
        </div>
      </div>
      <div><button class="btn btn-danger btn-sm" onclick="deleteService('${s.id}')"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg></button></div>
    </div>`).join('')
}

async function addService(){
  if(!profileId){showAlert('srv-error','Erro: perfil não carregado. Recarrega a página.','error');return}
  const plan=(profileData&&profileData.plan)||'free'
  const svcLimits={free:2,pro:10,premium:Infinity}
  const svcMax=svcLimits[plan]!==undefined?svcLimits[plan]:2
  const{count:svcCount}=await db.from('services').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
  if(svcCount>=svcMax){showAlert('srv-error','Atingiste o limite de '+svcMax+' serviços do plano '+plan.toUpperCase()+'. Faz upgrade para adicionares mais.','error');return}
  const title=document.getElementById('srv-title').value.trim()
  if(!title){showAlert('srv-error','O nome do serviço é obrigatório.','error');return}
  const{error}=await db.from('services').insert({
    professional_id:profileId,title,
    description:document.getElementById('srv-desc').value.trim()||null,
    price_from:parseFloat(document.getElementById('srv-pmin').value)||null,
    price_to:parseFloat(document.getElementById('srv-pmax').value)||null,
    price_unit:document.getElementById('srv-unit').value
  })
  if(error){showAlert('srv-error','Erro: '+error.message);return}
  showAlert('srv-success','Serviço adicionado!')
  ;['srv-title','srv-desc','srv-pmin','srv-pmax'].forEach(id=>document.getElementById(id).value='')
  loadServices()
}

async function deleteService(id){
  if(!confirm('Remover este serviço?'))return
  await db.from('services').delete().eq('id',id)
  loadServices()
}

// PORTFOLIO
async function loadPortfolio(){
  const{data}=await db.from('portfolio_items').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
  const grid=document.getElementById('portfolio-grid')
  if(!grid)return
  if(!data||!data.length){grid.innerHTML='<div class="empty">Sem fotos ainda.</div>';return}
  grid.innerHTML=data.map(item=>`
    <div class="port-img">
      <img src="${escapeHtml(item.photo_url)}" alt="${escapeHtml(item.caption||item.title||'')}"/>
      ${item.title?`<span style="position:absolute;top:6px;left:6px;background:var(--blue);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">Caso de sucesso</span>`:''}
      <button class="del" onclick="deletePortItem('${item.id}')">✕</button>
    </div>`).join('')
}

function toggleCaseFields(){
  const on=document.getElementById('port-is-case').checked
  document.getElementById('case-fields').style.display=on?'block':'none'
}

async function uploadPortfolioBeforePhoto(input){
  const file=input.files[0]
  if(!file)return
  if(file.size>10*1024*1024){showAlert('port-error','Foto demasiado grande. Máx 10MB.','error');return}
  const preview=document.getElementById('port-before-preview')
  preview.innerHTML='<div style="font-size:13px;color:var(--muted)">A carregar...</div>'
  preview.style.display='block'
  try{
    const uploadFile=await resizeImageFile(file)
    const ext=uploadFile.name.split('.').pop()
    const path=`portfolio/${profileId}/before-${Date.now()}.${ext}`
    const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{contentType:uploadFile.type})
    if(error)throw error
    const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
    document.getElementById('port-before-url').value=urlData.publicUrl
    preview.innerHTML=`<img src="${escapeHtml(urlData.publicUrl)}" style="width:100px;height:100px;border-radius:10px;object-fit:cover"/>`
  }catch(e){
  console.error('Erro ao carregar foto "antes":', e);
  showAlert('port-error','Não foi possível carregar a foto. Tenta novamente.','error');
  preview.style.display = 'none';
  document.getElementById('port-before-url').value = '';
  }
}

async function addPortfolioItem(){
  const url=document.getElementById('port-url').value.trim()
  if(!url){showAlert('port-error','Insere o URL da imagem.');return}
  const isCase=document.getElementById('port-is-case').checked
  const{error}=await db.from('portfolio_items').insert({
    professional_id:profileId,
    photo_url:url,
    caption:document.getElementById('port-cap').value.trim()||null,
    title:isCase?(document.getElementById('port-title').value.trim()||null):null,
    description:isCase?(document.getElementById('port-desc').value.trim()||null):null,
    duration_label:isCase?(document.getElementById('port-duration').value.trim()||null):null,
    before_photo_url:isCase?(document.getElementById('port-before-url').value.trim()||null):null
  })
  if(error){showAlert('port-error','Erro: '+error.message);return}
  showAlert('port-success','Foto adicionada!')
  ;['port-url','port-cap','port-title','port-desc','port-duration','port-before-url'].forEach(id=>document.getElementById(id).value='')
  document.getElementById('port-is-case').checked=false
  document.getElementById('case-fields').style.display='none'
  document.getElementById('port-before-preview').style.display='none'
  loadPortfolio()
}

// DIARIO DE TRABALHOS
async function loadDiaryDash(){
  if(!profileId)return
  const{data}=await db.from('professional_updates').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
  const el=document.getElementById('diary-dash-list')
  if(!el)return
  if(!data||!data.length){el.innerHTML='<div class="empty">Sem publicações ainda.</div>';return}
  el.innerHTML=data.map(u=>`
    <div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(u.content)}</div>
        <div class="list-item-sub">${u.location_label?escapeHtml(u.location_label)+' · ':''}${new Date(u.created_at).toLocaleDateString('pt-PT')}</div>
      </div>
      <div><button class="btn btn-danger btn-sm" onclick="deleteDiaryUpdate('${u.id}')">✕</button></div>
    </div>`).join('')
}
async function addDiaryUpdate(){
  const content=document.getElementById('diary-content').value.trim()
  if(!content){showAlert('diary-error','Escreve o que fizeste.','error');return}
  const{error}=await db.from('professional_updates').insert({
    professional_id:profileId,content,
    location_label:document.getElementById('diary-location').value.trim()||null,
    photo_url:document.getElementById('diary-photo-url').value.trim()||null
  })
  if(error){showAlert('diary-error','Erro: '+error.message,'error');return}
  showAlert('diary-success','Publicado!')
  ;['diary-content','diary-location','diary-photo-url'].forEach(id=>document.getElementById(id).value='')
  document.getElementById('diary-photo-preview').style.display='none'
  loadDiaryDash()
}
async function deleteDiaryUpdate(id){
  if(!confirm('Remover esta publicação?'))return
  await db.from('professional_updates').delete().eq('id',id)
  loadDiaryDash()
}
async function uploadDiaryPhoto(input){
  const file=input.files[0]
  if(!file)return
  if(file.size>10*1024*1024){showAlert('diary-error','Foto demasiado grande. Máx 10MB.','error');return}
  const preview=document.getElementById('diary-photo-preview')
  preview.innerHTML='<div style="font-size:13px;color:var(--muted)">A carregar...</div>'
  preview.style.display='block'
  try{
    const uploadFile=await resizeImageFile(file)
    const ext=uploadFile.name.split('.').pop()
    const path=`diary/${profileId}/${Date.now()}.${ext}`
    const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{contentType:uploadFile.type})
    if(error)throw error
    const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
    document.getElementById('diary-photo-url').value=urlData.publicUrl
    preview.innerHTML=`<img src="${escapeHtml(urlData.publicUrl)}" style="width:100px;height:100px;border-radius:10px;object-fit:cover"/>`
  }catch(e){
    console.error('Erro ao carregar foto do diário:', e);
    showAlert('diary-error','Não foi possível carregar a foto. Tenta novamente.','error');
    preview.style.display = 'none';
    document.getElementById('diary-photo-url').value = '';
  }
}

// FAQ
async function loadFaqsDash(){
  if(!profileId)return
  const{data}=await db.from('professional_faqs').select('*').eq('professional_id',profileId).order('order_index')
  const el=document.getElementById('faq-dash-list')
  if(!el)return
  if(!data||!data.length){el.innerHTML='<div class="empty">Sem perguntas ainda.</div>';return}
  el.innerHTML=data.map(f=>`
    <div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(f.question)}</div>
        <div class="list-item-sub">${escapeHtml(f.answer)}</div>
      </div>
      <div><button class="btn btn-danger btn-sm" onclick="deleteFaqDash('${f.id}')">✕</button></div>
    </div>`).join('')
}
async function addFaqDash(){
  const question=document.getElementById('faq-question').value.trim()
  const answer=document.getElementById('faq-answer').value.trim()
  if(!question||!answer){showAlert('faq-error','Preenche a pergunta e a resposta.','error');return}
  const{count}=await db.from('professional_faqs').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
  const{error}=await db.from('professional_faqs').insert({professional_id:profileId,question,answer,order_index:count||0})
  if(error){showAlert('faq-error','Erro: '+error.message,'error');return}
  showAlert('faq-success','Adicionado!')
  document.getElementById('faq-question').value=''
  document.getElementById('faq-answer').value=''
  loadFaqsDash()
}
async function deleteFaqDash(id){
  if(!confirm('Remover esta pergunta?'))return
  await db.from('professional_faqs').delete().eq('id',id)
  loadFaqsDash()
}

async function deletePortItem(id){
  if(!confirm('Remover esta foto?'))return
  await db.from('portfolio_items').delete().eq('id',id)
  loadPortfolio()
}

// MESSAGES
async function loadMessages(){
  const{data}=await db.from('messages_legacy_contact_form').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
  const el=document.getElementById('messages-list')
  if(!data||!data.length){el.innerHTML='<div class="empty">Sem mensagens ainda.</div>';return}
  // Mark all as read
  db.from('messages_legacy_contact_form').update({read:true}).eq('professional_id',profileId).eq('read',false).then(()=>{
    const b=document.getElementById('msg-badge'); if(b)b.style.display='none'
  })
  el.innerHTML=data.map(m=>`
    <div class="msg-item ${!m.read?'unread':''}">
      <div class="msg-header">
        <div><div class="msg-from">${escapeHtml(m.sender_name)}</div><div style="font-size:12px;color:var(--muted)">${escapeHtml(m.sender_email)}${m.sender_phone?' · '+escapeHtml(m.sender_phone):''}</div></div>
        <div class="msg-date">${new Date(m.created_at).toLocaleDateString('pt-PT')}</div>
      </div>
      <div class="msg-subject">${escapeHtml(m.subject)}</div>
      <div style="font-size:14px;color:#475569;margin-top:6px;line-height:1.6">${escapeHtml(m.content)}</div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <a href="mailto:${escapeHtml(m.sender_email)}?subject=Re: ${encodeURIComponent(m.subject)}" class="btn btn-outline btn-sm">Responder por email</a>
        ${m.sender_phone?`<a href="tel:${escapeHtml(m.sender_phone)}" class="btn btn-gold btn-sm">Ligar</a>`:''}
      </div>
    </div>`).join('')
}

// REVIEWS
async function loadReviews(){
  const{data}=await db.from('reviews').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
  const el=document.getElementById('reviews-list')
  if(!data||!data.length){el.innerHTML='<div class="empty">Sem avaliações ainda.</div>';return}
  const avg=(data.reduce((s,r)=>s+r.rating,0)/data.length).toFixed(1)
  el.innerHTML=`<div style="background:var(--white);border-radius:16px;padding:20px;margin-bottom:16px;text-align:center;border:1px solid var(--border)">
    <div style="font-size:48px;font-weight:900;color:var(--blue)">${avg}</div>
    <div style="color:var(--gold);font-size:24px">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</div>
    <div style="font-size:14px;color:var(--muted)">${data.length} avaliação${data.length!==1?'ões':''}</div>
  </div>`+data.map(r=>`
    <div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(r.reviewer_name)} <span style="color:var(--gold)">${'★'.repeat(r.rating)+'☆'.repeat(5-r.rating)}</span> <span style="font-size:12px;color:var(--muted);font-weight:400">${new Date(r.created_at).toLocaleDateString('pt-PT')}</span></div>
        <div class="list-item-sub">${escapeHtml(r.comment||'(sem comentário)')}</div>
      </div>
    </div>`).join('')
}

function showPage(name){
  document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active'))
  document.getElementById(`page-${name}`).classList.add('active')
  const grupoPerfil=['profile','services','portfolio','diario','faq']
  document.querySelectorAll('.nav-item[data-page]').forEach(n=>{
    const alvo=n.dataset.page
    n.classList.toggle('active', alvo===name || (alvo==='profile'&&grupoPerfil.includes(name)))
  })
  document.querySelectorAll('.mob-item').forEach((m,i)=>{
    const pages=['overview','trabalhos','agenda','profile','messages']
    m.classList.toggle('active',pages[i]===name)
  })
  document.querySelectorAll('.ptab').forEach(t=>t.classList.toggle('on',t.dataset.ptab===name))
  if(name==='services'){loadServices();loadMarketPricing()}
  if(name==='messages')loadMessages()
  if(name==='reviews')loadReviews()
  if(name==='myrequests')loadMyRequests()
  if(name==='trabalhos'){loadJobs();loadQuotes()}
  if(name==='clientes')renderClientHistory()
  if(name==='agenda')renderCalendar()
  if(name==='referrals')loadReferrals()
  if(name==='convidar')loadInvites()
  if(name==='financas'){renderFinance();loadExpenses();populateReportYears();renderAnnualReport()}
  if(name==='mercado'&&planLimits.finances)loadMarketInsights()
  if(name==='privacidade')loadGdprRequests()
}

// TRABALHOS (PIPELINE + AGENDA)
let allJobs=[]
const JOB_STATUS_LABELS={novo:'Novo',negociacao:'Negociação',orcamento_enviado:'Orçamento Enviado',aceite:'Aceite',agendado:'Agendado',concluido:'Concluído',pago:'Pago',cancelado:'Cancelado'}
const KANBAN_COLUMNS=[
  {key:'novo',label:'Novo',statuses:['novo','negociacao']},
  {key:'orcamento_enviado',label:'Orçamento',statuses:['orcamento_enviado','aceite']},
  {key:'agendado',label:'Agendado',statuses:['agendado']},
  {key:'concluido',label:'Concluído',statuses:['concluido']},
  {key:'pago',label:'Pago',statuses:['pago']}
]

async function loadJobs(){
  const{data}=await db.from('jobs').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
  allJobs=data||[]
  renderPipeline()
  renderCalendar()
  renderStatusChart(allJobs)
  renderInsights()
  renderFollowupReminders()
  renderMiniAgenda()
  renderFinance()
}

function toLocalDT(iso){
  if(!iso)return ''
  const d=new Date(iso)
  const pad=n=>String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function jobCardHtml(j){
  const statusOpts=Object.keys(JOB_STATUS_LABELS).map(k=>`<option value="${k}" ${k===j.status?'selected':''}>${JOB_STATUS_LABELS[k]}</option>`).join('')
  return `<div class="job-card" data-id="${j.id}">
    <div class="jc-title">${escapeHtml(j.title)}</div>
    <div class="jc-client">${j.client_name||'Cliente'}</div>
    <input type="number" min="0" placeholder="Valor (€)" value="${j.quote_amount??''}" style="width:100%;margin-bottom:6px" onchange="updateJobField('${j.id}','quote_amount',this.value?parseFloat(this.value):null)"/>
    <div class="jc-margin">
      <input type="number" min="0" placeholder="Material (€)" value="${j.material_cost??''}" title="Quanto gastaste em material" onchange="updateJobField('${j.id}','material_cost',this.value?parseFloat(this.value):null)"/>
      <input type="text" list="job-types" placeholder="Tipo" value="${escapeHtml(j.job_type||'')}" title="Ex: Reparação, Instalação completa" onchange="updateJobField('${j.id}','job_type',this.value.trim()||null)"/>
    </div>
    ${marginBadge(j)}
    <textarea placeholder="Material a levar (opcional)" style="width:100%;margin-bottom:6px;min-height:40px;font-size:12px;padding:8px 10px" onchange="updateJobField('${j.id}','materials_checklist',this.value.trim()||null)">${escapeHtml(j.materials_checklist||'')}</textarea>
    <input type="datetime-local" value="${toLocalDT(j.scheduled_at)}" style="width:100%;margin-bottom:6px" onchange="updateJobField('${j.id}','scheduled_at',this.value?new Date(this.value).toISOString():null)"/>
    <select onchange="updateJobStatus('${j.id}',this.value)">${statusOpts}</select>
    <div class="jc-actions" style="margin-top:8px">
      <button class="btn btn-outline btn-sm" onclick="openQuoteModal('${j.id}')" title="Gerar orçamento PDF"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></button>
      <button class="btn btn-outline btn-sm" onclick="openReferModal('${j.id}')" title="Referir a outro profissional"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
      <button class="btn btn-danger btn-sm" onclick="deleteJob('${j.id}')"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg></button>
    </div>
  </div>`
}

function renderClientHistory(){
  const el=document.getElementById('clients-list')
  if(!el)return
  const q=(document.getElementById('client-search')?.value||'').toLowerCase().trim()
  const groups={}
  allJobs.forEach(j=>{
    const key=j.client_id||('n:'+(j.client_name||'Cliente'))
    if(!groups[key])groups[key]={name:j.client_name||'Cliente',jobs:[],total:0}
    groups[key].jobs.push(j)
    if(j.status==='pago')groups[key].total+=Number(j.paid_amount??j.quote_amount??0)
  })
  let list=Object.values(groups)
  if(q)list=list.filter(g=>g.name.toLowerCase().includes(q))
  list.sort((a,b)=>b.total-a.total||b.jobs.length-a.jobs.length)
  if(!list.length){el.innerHTML='<div class="form-section"><div class="tc-empty"><p>Sem clientes ainda.</p></div></div>';return}
  el.innerHTML=list.map(g=>{
    const repeat=g.jobs.length>1
    return `<div class="form-section" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:14px">${escapeHtml(g.name)}</div>
          ${repeat?`<span style="font-size:11px;color:#B4650A;background:#FBEFE0;display:inline-block;padding:1px 8px;border-radius:99px;margin-top:4px">cliente recorrente · ${g.jobs.length}x</span>`:''}
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--green)">${eur(g.total)}</div>
      </div>
    </div>`
  }).join('')
}

function renderPipeline(){
  const board=document.getElementById('kanban-board')
  const active=allJobs.filter(j=>j.status!=='cancelado')
  board.innerHTML=KANBAN_COLUMNS.map(col=>{
    const items=active.filter(j=>col.statuses.includes(j.status))
    return `<div class="kanban-col">
      <div class="kanban-col-title">${col.label}<span class="kanban-col-count">${items.length}</span></div>
      <div class="kanban-cards">${items.length?items.map(jobCardHtml).join(''):'<div class="kanban-empty">Sem trabalhos</div>'}</div>
    </div>`
  }).join('')
}

const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function jobFim(j){
  return new Date(new Date(j.scheduled_at).getTime()+(j.duration_minutes||60)*60000)
}

function duracaoTexto(min){
  const m=Number(min)||60
  if(m<60)return m+' min'
  const h=Math.floor(m/60), r=m%60
  if(m>=480)return 'dia inteiro'
  if(m===240)return 'meio dia'
  return h+(r?'h'+String(r).padStart(2,'0'):(h===1?' hora':' horas'))
}

// Dois trabalhos chocam se um comeca antes de o outro acabar.
function trabalhosQueChocam(lista){
  const ord=lista.slice().sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))
  const maus=new Set()
  for(let i=0;i<ord.length-1;i++){
    if(jobFim(ord[i])>new Date(ord[i+1].scheduled_at)){maus.add(ord[i].id);maus.add(ord[i+1].id)}
  }
  return maus
}

function jobsAgendados(){
  return allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado')
}

function calShiftMonth(delta){
  calMonth+=delta
  if(calMonth<0){calMonth=11;calYear--}
  if(calMonth>11){calMonth=0;calYear++}
  calSelected=null
  renderCalendar()
}

function calGoToday(){
  const h=new Date()
  calYear=h.getFullYear();calMonth=h.getMonth();calSelected=h.getDate()
  renderCalendar()
}

function calSelectDay(day){
  calSelected=calSelected===day?null:day
  renderCalendar()
}

function renderCalendar(){
  const grid=document.getElementById('cal-grid')
  const title=document.getElementById('cal-title')
  if(!grid||!title)return

  title.textContent=MESES[calMonth]+' de '+calYear
  const ant=document.getElementById('cal-mes-ant')
  const seg=document.getElementById('cal-mes-seg')
  if(ant)ant.textContent=MESES[(calMonth+11)%12]
  if(seg)seg.textContent=MESES[(calMonth+1)%12]

  // A semana comeca a segunda, como em Portugal.
  const primeiro=new Date(calYear,calMonth,1)
  const desloc=(primeiro.getDay()+6)%7
  const diasNoMes=new Date(calYear,calMonth+1,0).getDate()
  const diasMesAnterior=new Date(calYear,calMonth,0).getDate()

  const porDia={}
  jobsAgendados().forEach(j=>{
    const d=new Date(j.scheduled_at)
    if(d.getFullYear()===calYear&&d.getMonth()===calMonth){
      (porDia[d.getDate()]=porDia[d.getDate()]||[]).push(j)
    }
  })
  Object.keys(porDia).forEach(k=>porDia[k].sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)))

  const hoje=new Date()
  const ehHoje=d=>d===hoje.getDate()&&calMonth===hoje.getMonth()&&calYear===hoje.getFullYear()

  let html=''
  for(let i=desloc;i>0;i--){
    html+='<button class="cal-day fora" disabled><div class="cal-num">'+(diasMesAnterior-i+1)+'</div></button>'
  }

  for(let dia=1;dia<=diasNoMes;dia++){
    const doDia=porDia[dia]||[]
    const choque=trabalhosQueChocam(doDia)
    const dow=new Date(calYear,calMonth,dia).getDay()
    const fds=(dow===0||dow===6)
    const cls=['cal-day']
    if(fds)cls.push('fds')
    if(ehHoje(dia))cls.push('hoje')
    if(calSelected===dia)cls.push('escolhido')

    let eventos=''
    doDia.slice(0,2).forEach((j,idx)=>{
      const d=new Date(j.scheduled_at)
      const hh=d.getHours()
      const mm=d.getMinutes()
      const hora=hh+'h'+(mm?String(mm).padStart(2,'0'):'')
      const quem=j.client_name||j.title||'Trabalho'
      const cor=choque.has(j.id)?'r':(idx%2?'a':'v')
      eventos+='<div class="cal-ev '+cor+'">'+escapeHtml(hora+' '+quem)+'</div>'
    })
    if(doDia.length>2)eventos+='<div class="cal-mais">+'+(doDia.length-2)+'</div>'

    html+='<button class="'+cls.join(' ')+'" onclick="calSelectDay('+dia+')">'+
          '<div class="cal-num">'+dia+'</div>'+eventos+'</button>'
  }

  const sobra=(7-((desloc+diasNoMes)%7))%7
  for(let i=1;i<=sobra;i++){
    html+='<button class="cal-day fora" disabled><div class="cal-num">'+i+'</div></button>'
  }

  grid.innerHTML=html
  renderDiaOuProximos(porDia)
}

function linhaTrabalhoHtml(j,choque){
  const d=new Date(j.scheduled_at)
  const hora=d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})
  const partes=[]
  if(j.title)partes.push(escapeHtml(j.title))
  partes.push(duracaoTexto(j.duration_minutes))
  if(j.quote_amount!=null)partes.push(eur(j.quote_amount))
  const nota=choque
    ? '<div class="dia-nota" style="color:#A32D2D">Choca com outro trabalho a esta hora</div>'
    : ''
  return '<div class="dia-linha">'+
    '<div class="dia-hora">'+hora+'</div>'+
    '<div class="dia-corpo">'+
      '<div class="dia-nome">'+escapeHtml(j.client_name||j.title||'Trabalho')+'</div>'+
      '<div class="dia-sub">'+partes.join(' · ')+'</div>'+nota+
    '</div></div>'
}

function renderDiaOuProximos(porDia){
  const titulo=document.getElementById('agenda-day-title')
  const lista=document.getElementById('agenda-list')
  const qa=document.getElementById('quick-add-section')
  const qaT=document.getElementById('quick-add-title')
  if(!titulo||!lista)return

  const btnAdd='<button class="dia-add" onclick="focarMarcar()"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Marcar trabalho neste dia</button>'

  if(calSelected){
    const data=new Date(calYear,calMonth,calSelected)
    const etiqueta=data.toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})
    titulo.textContent=etiqueta
    if(qa){qa.style.display='block';qaT.textContent='Marcar em '+etiqueta}
    const doDia=(porDia&&porDia[calSelected])||[]
    if(!doDia.length){
      lista.innerHTML='<div class="dia-vazio">Nada marcado neste dia.</div>'+btnAdd
      return
    }
    const choque=trabalhosQueChocam(doDia)
    const aviso=choque.size?'<div class="aviso-choque"><svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>Tens trabalhos sobrepostos neste dia</div>':''
    lista.innerHTML=aviso+doDia.map(j=>linhaTrabalhoHtml(j,choque.has(j.id))).join('')+btnAdd
    return
  }

  if(qa)qa.style.display='none'
  titulo.textContent='Próximos trabalhos'
  // So o que ainda esta para vir. Antes isto mostrava o passado tambem.
  const agora=Date.now()
  const proximos=jobsAgendados()
    .filter(j=>jobFim(j).getTime()>=agora)
    .sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))
    .slice(0,8)
  if(!proximos.length){
    lista.innerHTML='<div class="dia-vazio">Não tens nada marcado. Escolhe um dia no calendário para marcares.</div>'
    return
  }
  const choque=trabalhosQueChocam(proximos)
  lista.innerHTML=proximos.map(j=>{
    const d=new Date(j.scheduled_at)
    const dia=d.toLocaleDateString('pt-PT',{weekday:'short',day:'numeric',month:'short'})
    return linhaTrabalhoHtml(j,choque.has(j.id)).replace('<div class="dia-hora">',
      '<div class="dia-hora" style="width:74px;font-size:13px;line-height:1.35">'+dia+'<br>')
  }).join('')
}

function focarMarcar(){
  const el=document.getElementById('qa-title')
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.focus()}
}

function renderAgenda(){renderCalendar()}

async function quickAddToDay(){
  if(!calSelected||!profileId)return
  const titleInput=document.getElementById('qa-title')
  const timeInput=document.getElementById('qa-time')
  const title=titleInput.value.trim()
  if(!title){showAlert('qa-error','Escreve o que vais fazer.','error');return}
  const time=timeInput.value||'09:00'
  const[h,m]=time.split(':').map(Number)
  const dt=new Date(calYear,calMonth,calSelected,h||0,m||0,0,0)
  const clientEl=document.getElementById('qa-client')
  const durEl=document.getElementById('qa-dur')
  const duracao=Number(durEl&&durEl.value)||60

  // Avisar antes de gravar, mas deixar marcar na mesma: as vezes
  // e mesmo preciso ter duas coisas ao mesmo tempo.
  const fimNovo=new Date(dt.getTime()+duracao*60000)
  const choca=jobsAgendados().some(j=>{
    const i=new Date(j.scheduled_at)
    return i<fimNovo && jobFim(j)>dt
  })
  if(choca&&!confirm('Já tens outro trabalho a esta hora. Queres marcar na mesma?'))return

  const{error}=await db.from('jobs').insert({
    professional_id:profileId,title,status:'agendado',
    client_name:(clientEl&&clientEl.value.trim())||null,
    duration_minutes:duracao,
    scheduled_at:dt.toISOString()
  })
  if(error){showAlert('qa-error','Erro ao marcar: '+error.message,'error');return}
  titleInput.value=''
  if(clientEl)clientEl.value=''
  showAlert('qa-success','Trabalho marcado.')
  loadJobs()
}

async function addJob(){
  const title=document.getElementById('job-title').value.trim()
  if(!title){showAlert('job-error','Indica um título para o trabalho.','error');return}
  const client_name=document.getElementById('job-client').value.trim()||null
  const amountVal=document.getElementById('job-amount').value
  const quote_amount=amountVal?parseFloat(amountVal):null
  const{error}=await db.from('jobs').insert({professional_id:profileId,title,client_name,quote_amount,status:'novo'})
  if(error){showAlert('job-error','Erro ao adicionar: '+error.message,'error');return}
  document.getElementById('job-title').value=''
  document.getElementById('job-client').value=''
  document.getElementById('job-amount').value=''
  showAlert('job-success','Trabalho adicionado!')
  loadJobs()
}

async function updateJobField(id,field,value){
  await db.from('jobs').update({[field]:value}).eq('id',id)
  loadJobs()
}

async function updateJobStatus(id,status){
  const updates={status}
  if(status==='concluido')updates.completed_at=new Date().toISOString()
  if(status==='pago'){
    updates.paid_at=new Date().toISOString()
    const job=allJobs.find(j=>j.id===id)
    if(job&&!job.paid_amount)updates.paid_amount=job.quote_amount||null
  }
  await db.from('jobs').update(updates).eq('id',id)
  if(status==='pago')await requestReviewForJob(id)
  loadJobs()
}

// Pede avaliacao automaticamente assim que um trabalho fica pago (e quando a taxa de resposta e mais alta)
async function requestReviewForJob(jobId){
  try{
    const job=allJobs.find(j=>j.id===jobId)
    if(!job||!job.conversation_id)return
    const{data:already}=await db.from('messages').select('id').eq('conversation_id',job.conversation_id).ilike('content','%deixa a tua avaliação%').limit(1).maybeSingle()
    if(already)return
    const link=profileData?.slug?('https://proliga.pt/'+profileData.slug):('https://proliga.pt/profile.html?id='+profileId)
    const content='Obrigado! O trabalho foi concluído e pago. Se puderes, deixa a tua avaliação aqui: '+link
    await db.from('messages').insert({conversation_id:job.conversation_id,sender_id:profileId,content})
    await db.from('conversations').update({last_message:content,last_message_at:new Date().toISOString()}).eq('id',job.conversation_id)
  }catch(e){}
}

async function deleteJob(id){
  if(!confirm('Remover este trabalho?'))return
  await db.from('jobs').delete().eq('id',id)
  loadJobs()
}

async function loadChatUnread(){
  const{data:convos}=await db.from('conversations').select('id').or('client_id.eq.'+profileId+',professional_id.eq.'+profileId)
  const badge=document.getElementById('chat-badge')
  if(!convos||!convos.length){badge.style.display='none';return}
  const ids=convos.map(c=>c.id)
  const{count}=await db.from('messages').select('*',{count:'exact',head:true}).in('conversation_id',ids).eq('read',false).neq('sender_id',profileId)
  if(count>0){badge.textContent=count;badge.style.display='inline-block'}
  else badge.style.display='none'
}

// MEUS PEDIDOS
let pendingReqPhotos=[]

function renderReqPhotoStrip(){
  const strip=document.getElementById('req-photo-strip')
  if(!strip)return
  const thumbs=pendingReqPhotos.map((url,i)=>`<div class="photo-thumb"><img src="${url}"/><div class="rm" onclick="removeReqPhoto(${i})">✕</div></div>`).join('')
  const addBtn=pendingReqPhotos.length<4?'<div class="photo-add" onclick="document.getElementById(&quot;req-photo-file&quot;).click()">➕</div>':''
  strip.innerHTML=thumbs+addBtn
}
function removeReqPhoto(i){pendingReqPhotos.splice(i,1);renderReqPhotoStrip()}

async function handleReqPhotoSelect(input){
  const files=Array.from(input.files||[]).slice(0,4-pendingReqPhotos.length)
  input.value=''
  for(const file of files){
    if(file.size>5*1024*1024)continue
    try{
      const uploadFile=await resizeImageFile(file)
      const ext=uploadFile.name.split('.').pop()
      const path=`requests/${profileId}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`
      const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{contentType:uploadFile.type})
      if(error){console.error(error);continue}
      const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
      pendingReqPhotos.push(urlData.publicUrl)
    }catch(e){console.error(e)}
  }
  renderReqPhotoStrip()
}

async function loadMyRequests(){
  const{data}=await db.from('requests').select('*').eq('client_id',user.id).order('created_at',{ascending:false})
  const el=document.getElementById('myrequests-list')
  if(!data||!data.length){el.innerHTML='<div class="empty">Ainda não publicaste nenhum pedido.</div>';return}
  const ids=data.map(r=>r.id)
  const{data:offers}=await db.from('request_offers').select('*,profiles:professional_id(name,photo_url)').in('request_id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
  const offersByReq={}
  ;(offers||[]).forEach(o=>{(offersByReq[o.request_id]=offersByReq[o.request_id]||[]).push(o)})
  el.innerHTML=data.map(r=>{
    const budget=r.budget_from?('€'+r.budget_from+(r.budget_to?' – €'+r.budget_to:'')):'Sem orçamento definido'
    const resolved=r.status==='resolved'
    const photos=(r.photo_urls||[]).length?`<div class="req-photo-row">${r.photo_urls.map(u=>`<img src="${escapeHtml(u)}"/>`).join('')}</div>`:''
    const myOffers=offersByReq[r.id]||[]
    const offersHtml=myOffers.length
      ?`<div class="offers-box"><div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px">${myOffers.length} proposta${myOffers.length>1?'s':''} recebida${myOffers.length>1?'s':''}</div>${myOffers.map(o=>{
        const preco=o.price_from?('€'+o.price_from+(o.price_to?' – €'+o.price_to:'')):'Sem preço'
        const nome=escapeHtml((o.profiles&&o.profiles.name)||'Profissional')
        const msg=escapeHtml(o.message||'')
        return `<div class="offer-row"><div><div class="offer-row-name">${nome}</div><div class="offer-row-msg">${msg}</div></div><div style="display:flex;align-items:center;gap:8px"><div class="offer-row-price">${preco}</div><button class="btn btn-outline btn-sm" onclick="location.href='messages.html?with=${o.professional_id}'">💬</button></div></div>`
      }).join('')}</div>`
      :''
    return `<div class="list-item" style="flex-direction:column;align-items:stretch">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(r.title)}<span class="status-pill ${resolved?'status-resolved':'status-open'}">${resolved?'Resolvido':'Aberto'}</span></div>
        <div class="list-item-sub">${escapeHtml(r.category)} · ${escapeHtml(r.location)} · ${budget}</div>
      </div>
      ${photos}
      ${offersHtml}
      <div class="list-item-actions">
        <button class="btn btn-outline btn-sm" onclick="toggleRequestStatus('${r.id}','${resolved?'open':'resolved'}')">${resolved?'↩️ Reabrir':'✅ Marcar como resolvido'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMyRequest('${r.id}')"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg> Eliminar</button>
      </div>
    </div>`
  }).join('')
}

async function toggleRequestStatus(id,newStatus){
  await db.from('requests').update({status:newStatus}).eq('id',id)
  loadMyRequests()
}

async function addMyRequest(){
  const title=document.getElementById('req-title').value.trim()
  const category=document.getElementById('req-cat').value
  const _rdistrict=document.getElementById('req-district').value
const _rcity=document.getElementById('req-city').value.trim()
const location=_rdistrict?(_rcity?_rdistrict+' – '+_rcity:_rdistrict):''
  if(!title||!category||!location){showAlert('req-error','Preenche título, categoria e zona.','error');return}
  const{data:novo,error}=await db.from('requests').insert({
    client_id:user.id,title,category,location,
    description:document.getElementById('req-desc').value.trim()||null,
    budget_from:parseFloat(document.getElementById('req-bmin').value)||null,
    budget_to:parseFloat(document.getElementById('req-bmax').value)||null,
    photo_urls:pendingReqPhotos
  }).select('id').single()
  if(error){showAlert('req-error','Erro: '+error.message,'error');return}
  showAlert('req-success','Pedido publicado com sucesso!')
  ;['req-title','req-desc','req-bmin','req-bmax'].forEach(id=>document.getElementById(id).value='')
  document.getElementById('req-cat').value=''
  document.getElementById('req-district').value=''
  document.getElementById('req-city').value=''
  pendingReqPhotos=[]
  renderReqPhotoStrip()
  loadMyRequests()
  notifyMatchingProfessionalsDash(novo&&novo.id)
}

async function notifyMatchingProfessionalsDash(requestId){
  if(!requestId)return
  try{
    const{data:{session:s}}=await db.auth.getSession()
    if(!s)return
    await fetch('/.netlify/functions/notify-request',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token},
      body:JSON.stringify({requestId})
    })
  }catch(e){}
}

async function deleteMyRequest(id){
  if(!confirm('Remover este pedido?'))return
  await db.from('requests').delete().eq('id',id)
  loadMyRequests()
}

function viewPublicProfile(){
  if(!profileId){alert('Guarda o teu perfil primeiro para ver o perfil público.');return}
  window.open('profile.html?id='+profileId,'_blank')
}

// ASSISTENTE DE IA
function toggleAiChat(){
  aiChatOpen=!aiChatOpen
  document.getElementById('ai-chat-panel').classList.toggle('open',aiChatOpen)
  if(aiChatOpen)document.getElementById('ai-chat-input').focus()
}


async function sendAiChat(){
  const input=document.getElementById('ai-chat-input')
  const q=input.value.trim()
  if(!q)return
  const body=document.getElementById('ai-chat-body')
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg user">${escapeHtml(q)}</div>`)
  input.value=''
  const sendBtn=document.getElementById('ai-chat-send')
  sendBtn.disabled=true
  const typingId='typing-'+Date.now()
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot" id="${typingId}">…</div>`)
  body.scrollTop=body.scrollHeight

  // Assistente local, sem custo: responde com regras a partir dos dados já carregados.
  // (A Edge Function "ai-assistant" com IA real fica disponível para quem quiser ativá-la
  // mais tarde com uma chave da Anthropic — ver answerWithClaude() abaixo, não usada por defeito.)
  await new Promise(r=>setTimeout(r,300)) // pequena pausa para parecer natural
  const typingEl=document.getElementById(typingId)
  if(typingEl)typingEl.remove()

  const action=tryDetectAction(q)
  if(action){
    if(!planLimits||!planLimits.ai_actions){
      body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">Fazer isto por ti (não só responder) é uma funcionalidade dos planos Pro e Premium. Atualiza o teu plano no botão "Atualizar plano" no Resumo (ou em Preços) para o assistente poder executar ações como esta.</div>`)
    } else {
      proposeAiAction(action.label,action.run)
    }
  } else {
    const answer=answerLocally(q)
    body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${answer.replace(/\n/g,'<br>')}</div>`)
  }

  sendBtn.disabled=false
  body.scrollTop=body.scrollHeight
}

// Deteta pedidos de ação (em vez de pergunta) no texto do utilizador.
// Devolve null se não for uma ação reconhecida, ou {label,run} para propor confirmação.
function tryDetectAction(question){
  const q=normalizeText(question)
  const has=(...words)=>words.some(w=>q.includes(w))

  if(has('ativa o modo ferias','liga o modo ferias','ativar o modo ferias','marca-me como indisponivel','marca me como indisponivel','ativa ferias')){
    return{
      label:'Vou ativar o modo férias (indisponível) por 14 dias — podes ajustar a data depois em Perfil. Confirmas?',
      run:async()=>{
        const until=new Date(Date.now()+14*86400000).toISOString().slice(0,10)
        const{error}=await db.from('profiles').update({unavailable_until:until,unavailable_message:null}).eq('id',profileId)
        if(error)return 'Não consegui ativar o modo férias agora. Tenta pela página de Perfil.'
        profileData={...profileData,unavailable_until:until,unavailable_message:null}
        if(typeof fillProfileForm==='function')fillProfileForm(profileData)
        return `Feito — modo férias ativado até ${new Date(until+'T00:00:00').toLocaleDateString('pt-PT')}.`
      }
    }
  }

  if(has('desativa o modo ferias','desliga o modo ferias','ja estou disponivel','tira-me do modo ferias','cancela o modo ferias')){
    return{
      label:'Vou desativar o modo férias — voltas a aparecer como disponível. Confirmas?',
      run:async()=>{
        const{error}=await db.from('profiles').update({unavailable_until:null,unavailable_message:null}).eq('id',profileId)
        if(error)return 'Não consegui desativar o modo férias agora. Tenta pela página de Perfil.'
        profileData={...profileData,unavailable_until:null,unavailable_message:null}
        if(typeof fillProfileForm==='function')fillProfileForm(profileData)
        return 'Feito — já estás marcado como disponível outra vez.'
      }
    }
  }

  const pagoMatch=question.match(/marca[r]?\s+(?:o\s+trabalho\s+)?["']?(.+?)["']?\s+como\s+pago/i)
  if(pagoMatch){
    const wanted=normalizeText(pagoMatch[1])
    const matches=(allJobs||[]).filter(j=>j.status!=='pago'&&normalizeText(j.title||'').includes(wanted))
    if(!matches.length)return{label:'Não encontrei nenhum trabalho por pagar com esse nome no Pipeline. Confirma o título exato.',run:null}
    if(matches.length>1){
      return{
        label:`Encontrei ${matches.length} trabalhos parecidos com "${pagoMatch[1]}". Sê mais específico (usa o título completo) para eu marcar o certo como pago.`,
        run:null,
        noConfirm:true
      }
    }
    const job=matches[0]
    return{
      label:`Vou marcar "${escapeHtml(job.title)}" como pago. Confirmas?`,
      run:async()=>{
        await updateJobStatus(job.id,'pago')
        return `Feito — "${escapeHtml(job.title)}" está marcado como pago.`
      }
    }
  }

  return null
}

function proposeAiAction(label,run){
  const body=document.getElementById('ai-chat-body')
  if(!run){
    body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${escapeHtml(label)}</div>`)
    return
  }
  pendingAiAction=run
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${escapeHtml(label)}<div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-solid" style="padding:6px 14px;font-size:12px" onclick="confirmAiAction()">Confirmar</button><button class="btn btn-outline" style="padding:6px 14px;font-size:12px" onclick="cancelAiAction()">Cancelar</button></div></div>`)
  body.scrollTop=body.scrollHeight
}

async function confirmAiAction(){
  const run=pendingAiAction
  pendingAiAction=null
  const body=document.getElementById('ai-chat-body')
  if(!run)return
  const typingId='typing-'+Date.now()
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot" id="${typingId}">…</div>`)
  body.scrollTop=body.scrollHeight
  const result=await run()
  const typingEl=document.getElementById(typingId)
  if(typingEl)typingEl.remove()
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${result}</div>`)
  body.scrollTop=body.scrollHeight
}

function cancelAiAction(){
  pendingAiAction=null
  const body=document.getElementById('ai-chat-body')
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">Ok, não fiz nada.</div>`)
  body.scrollTop=body.scrollHeight
}

function normalizeText(s){
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
}

const AI_FAQ=[
{k:['certificacao','certificacoes'],a:'Podes adicionar certificações profissionais em Perfil > Sobre mim avançado. Aparecem no teu perfil público e ajudam a gerar confiança.'},
{k:['idiomas que falo','linguas que falo','falo ingles'],a:'Podes indicar os idiomas que falas em Perfil > Sobre mim avançado — aparece no teu perfil público.'},
{k:['seguro profissional','tenho seguro'],a:'Podes assinalar se tens seguro profissional em Perfil > Sobre mim avançado. Funciona como selo de confiança para clientes.'},
{k:['metodos de pagamento que aceito','aceito multibanco','aceito mbway','como recebo o dinheiro'],a:'Em Perfil > Sobre mim avançado indicas que métodos de pagamento aceitas (Multibanco, MB Way, transferência, numerário, etc.), visível no teu perfil público.'},
{k:['casos de sucesso','portefolio','portfolio de trabalhos'],a:'Podes mostrar casos de sucesso (fotos e descrição) no teu perfil público, em Perfil > Casos de Sucesso. O número que podes ter depende do teu plano.'},
{k:['diario de trabalhos','historico no perfil publico'],a:'O Diário no teu perfil público mostra um resumo dos trabalhos que já fizeste, para dar confiança a novos clientes.'},
{k:['conquistas','badges','distintivos'],a:'Ganhas badges automáticas conforme cresces na Proliga — perfil completo, primeiras avaliações, resposta rápida, entre outras. Aparecem no teu perfil público.'},
{k:['zona de atuacao','area que sirvo','onde presto servico'],a:'Defines a tua zona de atuação em Perfil. Ajuda os clientes dessa área a encontrar-te nas pesquisas.'},
{k:['disponibilidade semanal fixa','horario que trabalho','dias que trabalho'],a:'Podes definir a tua disponibilidade semanal fixa em Perfil, para os clientes saberem quando costumas estar disponível.'},
{k:['orcamento automatico','pedido com varios orcamentos','receber varios orcamentos'],a:'Quando um cliente publica um pedido, vários profissionais da categoria certa podem enviar orçamento — tu respondes diretamente no Pipeline.'},
{k:['sincronizar agenda','google calendar','exportar agenda','link ics'],a:'Podes sincronizar a tua Agenda da Proliga com o Google Calendar (ou outro) através de um link ICS, disponível na página Agenda.'},
{k:['instalar a app','instalar aplicacao','adicionar ao ecra principal','pwa'],a:'A Proliga funciona como app (PWA). No telemóvel, o browser mostra \'Adicionar ao ecrã principal\' — depois abre como uma app normal, com notificações.'},
{k:['notificacoes push','ativar notificacoes'],a:'Podes ativar notificações push no dashboard para receberes avisos de novas mensagens, pedidos e o resumo diário, mesmo com a app fechada.'},
{k:['resumo diario','resumo matinal','notificacao de manha'],a:'Todas as manhãs, se tiveres algo relevante (trabalhos do dia, orçamentos por responder, mensagens por ler), recebes uma notificação resumo. Podes desligar em Notificações.'},
{k:['aviso de chuva','vai chover','tempo para o trabalho','previsao do tempo'],a:'Para categorias que trabalham ao ar livre, avisamos automaticamente 2 dias antes se houver alta probabilidade de chuva num trabalho agendado.'},
{k:['lista de material','material a levar'],a:'Em cada trabalho no Pipeline podes escrever uma lista de material a levar — fica guardada e visível antes de te deslocares.'},
{k:['calculadora de orcamento','calcular preco por telefone','calculadora rapida'],a:'No Resumo tens uma calculadora rápida que sugere uma faixa de preço com base na tua categoria — útil para responderes por telefone.'},
{k:['passar trabalho a colega','encaminhar trabalho','recomendar colega'],a:'Podes passar ou recomendar um trabalho a outro profissional da Proliga — ele recebe a informação numa conversa e tu podes ganhar crédito de indicação.'},
{k:['pedir avaliacao','avaliacao automatica ao cliente'],a:'Quando marcas um trabalho como pago, enviamos automaticamente uma mensagem ao cliente a pedir avaliação, com o link do teu perfil.'},
{k:['programa de creditos','ganhar creditos'],a:'Ganhas créditos ao indicares colegas que se registam e completam o perfil, e também com avaliações positivas. Usa os créditos para destacar o teu perfil.'},
{k:['anuncio pago','destacar perfil','impulsionar perfil'],a:'Podes usar créditos para pôr o teu perfil em destaque nas pesquisas por um período, na secção de Créditos.'},
{k:['diferenca entre planos','comparar planos','fazer upgrade','mudar de plano'],a:'Há três planos: Gratuito, Pro e Premium — os planos superiores dão mais orçamentos automáticos por mês, mais casos de portefólio, painel de Finanças e outras funcionalidades. Pergunta \'qual o meu plano\' para veres os teus limites atuais.'},
{k:['painel de mercado'],a:'O painel de Mercado mostra como os teus preços comparam com outros profissionais da tua categoria.'},
{k:['saude do negocio'],a:'O painel Saúde do Negócio dá uma visão geral do teu desempenho: faturação, pipeline e avaliações.'},
{k:['registar despesas','despesas do negocio','despesas gerais'],a:'Em Finanças podes registar despesas gerais do negócio (combustível, material, ferramentas) para teres uma visão real do lucro, não só da faturação.'},
{k:['relatorio anual','relatorio do ano'],a:'Em Finanças tens um relatório anual simples com o resumo de faturação, despesas e margem do ano.'},
{k:['margem de lucro','margem do trabalho'],a:'Se preencheres o custo de material num trabalho, calculamos automaticamente a margem de lucro desse trabalho no Pipeline.'},
{k:['verificacao por sms','verificar telemovel','numero verificado'],a:'Podes verificar o teu número de telemóvel por SMS — perfis verificados têm mais confiança dos clientes.'},
{k:['verificacao manual','como sou verificado'],a:'Além da verificação por SMS, a equipa Proliga também pode verificar perfis manualmente — fica assinalado com o selo \'Verificado\'.'},
{k:['stripe','pagamento pela plataforma','receber pagamento online','pagamento por cartao'],a:'Podes ativar pagamentos online opcionais via Stripe Connect, para receberes diretamente por cartão através da Proliga.'},
{k:['avaliacoes externas','importar avaliacoes','trabalhos feitos fora da proliga'],a:'Podes adicionar avaliações e trabalhos feitos fora da Proliga (portefólio externo) para reforçares a tua reputação desde o primeiro dia.'},
{k:['nova cidade','a minha cidade nao esta','lista de espera'],a:'Se a Proliga ainda não está ativa na tua zona, os clientes podem entrar numa lista de espera — assim que houver profissionais suficientes, ativamos a zona.'},
{k:['rgpd','protecao de dados','apagar a minha conta','eliminar conta'],a:'Podes pedir a exportação dos teus dados ou a eliminação da conta diretamente aqui no painel, em "Privacidade e RGPD" — o pedido fica registado e a equipa trata-o em até 30 dias. Também podes consultar todos os teus direitos RGPD na página RGPD do site.'},
{k:['como sou encontrado','aparecer nas pesquisas','porque nao apareço'],a:'Apareces nas pesquisas com base na tua categoria, zona, perfil completo e avaliações. Perfis com foto, bio e serviços publicados aparecem primeiro.'},
{k:['diferenca entre cliente e profissional','tipos de conta'],a:'Há dois tipos de conta: Cliente (contrata profissionais) e Profissional (oferece serviços) — escolheste isto no registo.'},
{k:['contactar suporte','falar com a proliga','preciso de ajuda humana'],a:'Podes contactar o suporte da Proliga na página de Contacto do site.'},
{k:['como funciona a proliga','o que e a proliga'],a:'A Proliga liga clientes a profissionais verificados em Portugal — publicas serviços, respondes a pedidos e geres tudo (agenda, orçamentos, pagamentos) num único painel.'},
{k:['comissao','a proliga cobra comissao','quanto custa usar a proliga'],a:'A Proliga tem preços fixos e sem comissões sobre o que faturas — pagas apenas a mensalidade do plano que escolheres (o Gratuito não tem custo).'},
{k:['editar servico','apagar servico','quantos servicos posso publicar'],a:'Podes editar ou remover os teus serviços a qualquer momento em Serviços. O número que podes publicar depende do teu plano.'},
{k:['tempo de resposta','quanto tempo demoro a responder'],a:'Responder depressa aos pedidos ajuda-te a aparecer melhor nas pesquisas e conta para algumas badges de conquista.'},
{k:['cancelar um trabalho','marcar como cancelado'],a:'Podes marcar um trabalho como cancelado no Pipeline a qualquer momento — fica registado no histórico mas sai dos trabalhos ativos.'},
{k:['mudar a foto de perfil','atualizar foto'],a:'Podes atualizar a tua foto de perfil em Perfil — perfis com foto recebem mais contactos.'},
{k:['link personalizado','slug do perfil','url do meu perfil'],a:'Alguns planos permitem um link personalizado para o teu perfil público (proliga.pt/o-teu-nome) em vez do link genérico com ID.'},
{k:['exportar dados','descarregar os meus dados'],a:'Podes pedir os teus dados pessoais ao abrigo do RGPD através da página RGPD do site.'}
]

function answerLocally(question){
  const q=normalizeText(question)
  const has=(...words)=>words.some(w=>q.includes(w))

  // Cumprimentos / agradecimentos
  if(has('ola','boa tarde','bom dia','boa noite','oi ','ei proliga')){
    return 'Olá! Pergunta-me sobre faturação, orçamentos pendentes, agenda, ticket médio, avaliações, perfil, serviços, trabalhos, o teu plano, preços de mercado, o código de referência ou o modo férias.'
  }
  if(has('obrigado','obrigada','valeu','fixe respondeste','otimo obrigado')){
    return 'De nada! Qualquer coisa é só perguntar.'
  }

  // Resumo geral do mês / negócio (pergunta ampla — combina os principais números)
  if(has('como esta','como vai','resumo','o meu mes','este mes','meu negocio')){
    const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0)
    const now=new Date();const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7)
    const paidThisMonth=allJobs.filter(j=>j.status==='pago'&&j.paid_at&&new Date(j.paid_at)>=monthStart)
    const total=paidThisMonth.reduce((s,j)=>s+(Number(j.paid_amount)||0),0)
    const active=allJobs.filter(j=>j.status!=='cancelado')
    const thisWeek=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now&&new Date(j.scheduled_at)<=weekEnd)
    const parts=[]
    parts.push(total>0?`Faturaste €${total.toFixed(0)} este mês (${paidThisMonth.length} trabalho${paidThisMonth.length>1?'s':''} pago${paidThisMonth.length>1?'s':''}).`:'Ainda não faturaste nada este mês.')
    parts.push(active.length?`Tens ${active.length} trabalho${active.length>1?'s':''} ativo${active.length>1?'s':''} no Pipeline.`:'Não tens trabalhos ativos no Pipeline de momento.')
    parts.push(thisWeek.length?`${thisWeek.length} deles agendado${thisWeek.length>1?'s':''} para os próximos 7 dias.`:'Sem nada agendado para os próximos 7 dias.')
    if(reviewsCount)parts.push(`Avaliação média: ${reviewsAvg} (${reviewsCount} avaliações).`)
    return parts.join(' ')
  }

  // Faturação / ganhos
  if(has('faturei','faturacao','faturação','ganhei','recebi','dinheiro','quanto fiz','rendimento')){
    const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0)
    const paidThisMonth=allJobs.filter(j=>j.status==='pago'&&j.paid_at&&new Date(j.paid_at)>=monthStart)
    const total=paidThisMonth.reduce((s,j)=>s+(Number(j.paid_amount)||0),0)
    if(!paidThisMonth.length)return 'Ainda não marcaste nenhum trabalho como pago este mês. Assim que o fizeres no Pipeline, a faturação aparece aqui e no Resumo.'
    return `Este mês faturaste €${total.toFixed(0)}, com base em ${paidThisMonth.length} trabalho${paidThisMonth.length>1?'s':''} pago${paidThisMonth.length>1?'s':''}.`
  }

  // Orçamentos pendentes / por responder
  if(has('pendente','por responder','parado','orcamento','orçamento','follow-up','followup')){
    const now=new Date()
    const stale=allJobs.filter(j=>['novo','negociacao'].includes(j.status)&&(now-new Date(j.created_at))/86400000>3)
    const waiting=allJobs.filter(j=>j.status==='orcamento_enviado'&&j.quote_sent_at&&(now-new Date(j.quote_sent_at))/86400000>5)
    if(!stale.length&&!waiting.length)return 'Não tens orçamentos parados de momento — tudo em dia!'
    const parts=[]
    if(stale.length)parts.push(`${stale.length} trabalho${stale.length>1?'s':''} por avançar há mais de 3 dias`)
    if(waiting.length)parts.push(`${waiting.length} orçamento${waiting.length>1?'s':''} enviado${waiting.length>1?'s':''} sem resposta há mais de 5 dias`)
    return `Tens ${parts.join(' e ')}. Vale a pena dar seguimento no Pipeline.`
  }

  // Agenda / trabalhos agendados
  if(has('agenda','agendado','esta semana','proximos dias','próximos dias','calendario','calendário')){
    const now=new Date();const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7)
    const thisWeek=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now&&new Date(j.scheduled_at)<=weekEnd).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))
    if(!thisWeek.length)return 'Não tens trabalhos agendados para os próximos 7 dias. Define uma data num trabalho do Pipeline para aparecer na Agenda.'
    const list=thisWeek.slice(0,5).map(j=>`• ${escapeHtml(j.title)} — ${new Date(j.scheduled_at).toLocaleDateString('pt-PT',{weekday:'short',day:'2-digit',month:'short'})}`).join('\n')
    return `Tens ${thisWeek.length} trabalho${thisWeek.length>1?'s':''} agendado${thisWeek.length>1?'s':''} para os próximos 7 dias:\n${list}`
  }

  // Ticket médio
  if(has('ticket','medio','médio','preco medio','preço médio','valor medio','valor médio')){
    const paid=allJobs.filter(j=>j.status==='pago'&&j.paid_amount)
    if(!paid.length)return 'Ainda não tens trabalhos pagos suficientes para calcular um ticket médio.'
    const avg=paid.reduce((s,j)=>s+Number(j.paid_amount),0)/paid.length
    return `O teu ticket médio é de €${avg.toFixed(0)}, com base em ${paid.length} trabalho${paid.length>1?'s':''} pago${paid.length>1?'s':''}.`
  }

  // Avaliações
  if(has('avaliacao','avaliação','avaliacoes','avaliações','estrelas','rating','nota')){
    if(!reviewsCount)return 'Ainda não tens avaliações. Pede aos teus clientes para avaliarem depois de um trabalho concluído.'
    return `Tens ${reviewsCount} avaliação${reviewsCount>1?'ões':''} com média de ${reviewsAvg} estrelas.`
  }

  // Perfil / visibilidade
  if(has('perfil','visibilidade','completo')){
    const missing=[]
    if(profileData&&!profileData.photo_url)missing.push('foto de perfil')
    if(profileData&&!profileData.bio)missing.push('biografia')
    if(!missing.length)return 'O teu perfil está completo (foto e biografia preenchidas). Bom trabalho!'
    return `Falta-te ${missing.join(' e ')} no perfil. Perfis completos recebem mais contactos de clientes.`
  }

  // Conversas / mensagens / clientes
  if(has('conversa','mensage','cliente','contacto')){
    return msgsCount
      ? `Tens ${msgsCount} conversa${msgsCount>1?'s':''} com clientes no Chat.`
      : 'Ainda não tens conversas com clientes. Publica serviços e completa o perfil para começares a aparecer nas pesquisas.'
  }

  // Serviços
  if(has('servico','serviço','servicos','serviços')){
    return servicesCount
      ? `Tens ${servicesCount} serviço${servicesCount>1?'s':''} publicado${servicesCount>1?'s':''}.`
      : 'Ainda não publicaste nenhum serviço. Adiciona pelo menos um em "Serviços" para apareceres nas pesquisas.'
  }

  // Trabalhos em geral / estado do pipeline
  if(has('trabalho','trabalhos','pipeline','quantos')){
    const active=allJobs.filter(j=>j.status!=='cancelado')
    if(!active.length)return 'Ainda não tens nenhum trabalho registado. Usa "Novo Trabalho" na página Trabalhos para começares a acompanhar tudo.'
    const counts={}
    active.forEach(j=>counts[j.status]=(counts[j.status]||0)+1)
    const parts=Object.entries(counts).map(([k,v])=>`${v} ${JOB_STATUS_LABELS[k]||k}`).join(', ')
    return `Tens ${active.length} trabalho${active.length>1?'s':''} ativo${active.length>1?'s':''}: ${parts}.`
  }

  // Plano e limites da conta
  if(has('meu plano','o plano','quantos servicos posso','limite do plano','plano atual','sou free','sou pro','sou premium')){
    const planName=(profileData&&profileData.plan)||'free'
    const label=planName==='pro'?'Pro':planName==='premium'?'Premium':'Gratuito'
    const parts=[`O teu plano atual é o ${label}.`]
    if(planLimits&&planLimits.portfolio_max)parts.push(`Podes ter até ${planLimits.portfolio_max} casos de sucesso no portefólio.`)
    if(planLimits&&planLimits.quotes_per_month)parts.push(`Até ${planLimits.quotes_per_month} orçamentos automáticos por mês.`)
    if(planLimits&&!planLimits.finances)parts.push('O painel de Finanças não está incluído neste plano.')
    return parts.join(' ')
  }

  // Preços de mercado / concorrência (categoria)
  if(has('quanto cobrar','quanto devo cobrar','mercado','concorrencia','outros profissionais cobram','quanto cobram')){
    if(marketPriceCache&&profileData&&marketPriceCache.category===profileData.category)
      return `Profissionais de ${profileData.category} cobram, em média, entre €${marketPriceCache.lo.toFixed(0)} e €${marketPriceCache.hi.toFixed(0)}. Usa isto como referência para os teus preços.`
    return 'Ainda não tenho dados de mercado suficientes para a tua categoria. Isto aparece assim que houver serviços publicados suficientes de profissionais parecidos contigo.'
  }

  // Modo férias / indisponibilidade
  if(has('ferias','indisponivel','modo ausencia','estou de ferias')){
    if(profileData&&profileData.unavailable_until){
      const until=new Date(profileData.unavailable_until+'T00:00:00')
      if(until>=new Date())return `Estás marcado como indisponível até ${until.toLocaleDateString('pt-PT')}. Os clientes veem esse aviso no teu perfil público.`
    }
    return 'Não tens o modo de indisponibilidade ativo neste momento. Podes ativá-lo em Perfil, na secção "Modo férias".'
  }

  // Código de referência / indicações
  if(has('codigo de referencia','convidar colega','indicar colega','programa de referencia','indicacoes')){
    const code=profileData&&profileData.referral_code
    if(code)return `O teu código de referência é ${code}. Partilha-o — quando alguém se regista com ele, podes ganhar créditos.`
    return 'Ainda não tens um código de referência gerado. Consulta a secção de Indicações no menu para o criares.'
  }

  // Sugestões / o que fazer a seguir
  if(has('sugest','dica','conselho','o que devo','o que fazer','ajuda')){
    const tipsEl=document.getElementById('ai-insights')
    const firstTip=tipsEl&&tipsEl.querySelector('.insight-card div:last-child')
    if(firstTip)return 'A sugestão mais importante agora: '+firstTip.textContent
    return 'De momento não tenho nenhuma sugestão urgente — continua o bom trabalho! Podes ver mais detalhes no painel de Insights no Resumo.'
  }

  // Base alargada de perguntas sobre como cada funcionalidade da Proliga funciona
  for(const topic of AI_FAQ){
    if(has(...topic.k))return topic.a
  }

  return 'Não percebi bem a pergunta. Consigo responder sobre: faturação, orçamentos pendentes, agenda, ticket médio, avaliações, perfil, serviços, trabalhos, o teu plano, preços de mercado, o código de referência e o modo férias. Tenta perguntar, por exemplo, "como está o meu mês?" ou "quanto devo cobrar?".'
}

// Chamada opcional à Edge Function com IA real (Claude). Não é usada por defeito —
// fica aqui pronta caso um dia queiras trocar o assistente local por IA generativa
// (basta configurar ANTHROPIC_API_KEY no Supabase e chamar esta função em vez de answerLocally).
async function answerWithClaude(question){
  const{data,error}=await db.functions.invoke('ai-assistant',{body:{question}})
  if(error||!data||data.error){
    return data&&data.error==='not_configured'
      ?'O assistente de IA com Claude ainda não foi ativado. Configura ANTHROPIC_API_KEY no Supabase.'
      :'Não consegui responder agora. Tenta novamente daqui a pouco.'
  }
  return data.answer||'Não consegui gerar uma resposta.'
}

// ===== FINANÇAS =====
function quarterOf(d){return Math.floor(d.getMonth()/3)+1}
function eur(n){return '€'+Number(n||0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})}

function financePaidJobs(){
  return allJobs.filter(j=>j.status==='pago'&&(j.paid_amount!=null||j.quote_amount!=null))
    .map(j=>({...j,amount:Number(j.paid_amount??j.quote_amount??0),when:new Date(j.paid_at||j.completed_at||j.updated_at||j.created_at)}))
    .sort((a,b)=>b.when-a.when)
}

function marginPct(j){
  const rec=Number(j.paid_amount??j.quote_amount??0)
  const mat=Number(j.material_cost??0)
  if(!rec||rec<=0)return null
  if(j.material_cost==null)return null
  return ((rec-mat)/rec)*100
}
function marginClass(p){return p>=60?'bom':p>=35?'medio':'mau'}

function marginBadge(j){
  const p=marginPct(j)
  if(p===null)return ''
  const rec=Number(j.paid_amount??j.quote_amount??0)
  const lucro=rec-Number(j.material_cost??0)
  return `<div class="jc-mb ${marginClass(p)}">Margem ${p.toFixed(0)}% · ${eur(lucro)}</div>`
}

function renderMarginAnalysis(){
  const wrap=document.getElementById('mg-bars')
  const hint=document.getElementById('mg-hint')
  if(!wrap)return
  const dl=document.getElementById('job-types')
  if(dl)dl.innerHTML=[...new Set(allJobs.map(j=>j.job_type).filter(Boolean))].map(t=>`<option value="${escapeHtml(t)}"></option>`).join('')

  const comDados=allJobs.filter(j=>['concluido','pago'].includes(j.status)&&j.material_cost!=null&&Number(j.paid_amount??j.quote_amount??0)>0)
  if(!comDados.length){
    hint.style.display='block'
    hint.innerHTML='Preenche o campo <strong>Material (€)</strong> nos teus trabalhos para veres quanto sobra em cada um. Sem isso, só sabes o que entrou — não o que ganhaste.'
    wrap.innerHTML=''
    return
  }
  hint.style.display='none'

  const g={}
  comDados.forEach(j=>{
    const k=(j.job_type&&j.job_type.trim())||'Sem tipo'
    if(!g[k])g[k]={n:0,rec:0,mat:0}
    g[k].n++; g[k].rec+=Number(j.paid_amount??j.quote_amount??0); g[k].mat+=Number(j.material_cost??0)
  })
  const linhas=Object.entries(g).map(([tipo,v])=>{
    const lucro=v.rec-v.mat, pct=v.rec>0?lucro/v.rec*100:0
    return {tipo,...v,lucro,pct}
  }).sort((a,b)=>b.pct-a.pct)

  const cor=p=>p>=60?['#1A8649','#4ADE80','#146B3A']:p>=35?['#AF620A','#EFA53C','#8A4F08']:['#993C1D','#D8573A','#993C1D']
  wrap.innerHTML=linhas.map(r=>{
    const[c1,c2,ct]=cor(r.pct)
    return `<div class="mg-item">
      <div class="mg-top"><div class="mg-name">${escapeHtml(r.tipo)} <span>· ${r.n} trabalho${r.n!==1?'s':''}</span></div><div class="mg-val" style="color:${ct}">${r.pct.toFixed(0)}%</div></div>
      <div class="mg-track"><div class="mg-fill" style="width:${Math.max(2,Math.min(100,r.pct))}%;background:linear-gradient(90deg,${c1},${c2})"></div></div>
      <div class="mg-meta"><span>Faturado <strong>${eur(r.rec)}</strong></span><span>Material <strong>${eur(r.mat)}</strong></span><span>Sobrou <strong style="color:${ct}">${eur(r.lucro)}</strong></span></div>
    </div>`
  }).join('')

  if(linhas.length>=2){
    const m=linhas[0], pr=linhas[linhas.length-1]
    if(m.pct-pr.pct>=15){
      hint.style.display='block'
      hint.innerHTML=`As <strong>${escapeHtml(m.tipo)}</strong> deixam-te ${m.pct.toFixed(0)}% de margem; as <strong>${escapeHtml(pr.tipo)}</strong> só ${pr.pct.toFixed(0)}%. Vale a pena pensar se compensa aceitar as segundas ao preço atual.`
    }
  }
}

function renderFinance(){
  const rec=document.getElementById('fin-recebido')
  if(!rec)return
  const paid=financePaidJobs()
  const now=new Date(), curQ=quarterOf(now), curY=now.getFullYear()

  const doTri=paid.filter(j=>j.when.getFullYear()===curY&&quarterOf(j.when)===curQ)
  const recebido=doTri.reduce((s,j)=>s+j.amount,0)
  const pipeline=allJobs.filter(j=>['aceite','agendado','concluido'].includes(j.status)&&j.quote_amount!=null)
  const porReceber=pipeline.reduce((s,j)=>s+Number(j.quote_amount),0)

  document.getElementById('fin-period').textContent=`Trimestre T${curQ} · ${curY}`
  rec.textContent=eur(recebido)
  document.getElementById('fin-recebido-sub').textContent=doTri.length+' trabalho'+(doTri.length!==1?'s':'')+' pago'+(doTri.length!==1?'s':'')
  document.getElementById('fin-receber').textContent=eur(porReceber)
  document.getElementById('fin-receber-sub').textContent=pipeline.length+' trabalho'+(pipeline.length!==1?'s':'')+' em curso'

  const comMat=paid.filter(j=>j.material_cost!=null)
  const tr=comMat.reduce((s,j)=>s+j.amount,0), tm=comMat.reduce((s,j)=>s+Number(j.material_cost||0),0)
  document.getElementById('fin-margem').textContent=(comMat.length&&tr>0)?Math.round((tr-tm)/tr*100)+'%':'—'

  renderMarginAnalysis()

  // por trimestre
  const byQ={}
  paid.forEach(j=>{
    const k=`${j.when.getFullYear()}-T${quarterOf(j.when)}`
    if(!byQ[k])byQ[k]={label:`T${quarterOf(j.when)} ${j.when.getFullYear()}`,total:0,n:0,sort:j.when.getFullYear()*10+quarterOf(j.when)}
    byQ[k].total+=j.amount; byQ[k].n++
  })
  const qs=Object.values(byQ).sort((a,b)=>b.sort-a.sort)
  const qEl=document.getElementById('fin-quarters')
  qEl.innerHTML=qs.length?qs.map((r,i)=>`<div class="fin-row">
      <div><div class="fr-t" ${i>0?'style="color:var(--muted)"':''}>${r.label}</div><div class="fr-s">${r.n} trabalho${r.n!==1?'s':''}</div></div>
      <div class="fr-v" ${i>0?'style="color:var(--muted);font-weight:700"':''}>${eur(r.total)}</div>
    </div>`).join('')
    :'<div class="tc-empty"><div class="ico" style="background:var(--blue-light);color:var(--blue)"><svg class="ic" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg></div><p>Sem faturação registada.<br/><span>Marca um trabalho como pago.</span></p></div>'

  // trabalhos pagos
  const pEl=document.getElementById('fin-paid')
  pEl.innerHTML=paid.length?paid.slice(0,6).map(j=>`<div class="fin-row">
      <div class="fr-ico"><svg class="ic" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M20 6 9 17l-5-5"/></svg></div>
      <div style="flex:1;min-width:0"><div class="fr-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(j.title)}</div>
      <div class="fr-s">${escapeHtml(j.client_name||'Cliente')} · ${j.when.toLocaleDateString('pt-PT',{day:'numeric',month:'short'})}</div></div>
      <div class="fr-v">${eur(j.amount)}</div>
    </div>`).join('')
    :'<div class="tc-empty"><div class="ico" style="background:var(--green-light);color:var(--green)"><svg class="ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div><p>Sem trabalhos pagos ainda.</p></div>'
}

function exportFinanceCsv(){
  const paid=financePaidJobs()
  if(!paid.length){showAlert('job-error','Ainda não tens trabalhos pagos para exportar.','error');return}
  const esc=v=>{const s=String(v??'');return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  const header=['Data','Trabalho','Cliente','Valor (EUR)','Trimestre','Ano']
  const lines=paid.map(j=>[
    j.when.toLocaleDateString('pt-PT'),
    j.title,
    j.client_name||'',
    j.amount.toFixed(2).replace('.',','),
    'T'+quarterOf(j.when),
    j.when.getFullYear()
  ].map(esc).join(';'))
  const total=paid.reduce((s,j)=>s+j.amount,0)
  lines.push(['','','TOTAL',total.toFixed(2).replace('.',','),'',''].map(esc).join(';'))
  const csv='﻿'+[header.map(esc).join(';'),...lines].join('\r\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download='Proliga-trabalhos-pagos-'+new Date().toISOString().slice(0,10)+'.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ===== DESPESAS GERAIS =====
let allExpenses=[]

async function loadExpenses(){
  const{data}=await db.from('business_expenses').select('*').eq('professional_id',profileId).order('expense_date',{ascending:false})
  allExpenses=data||[]
  renderExpensesList()
  renderAnnualReport()
}

function renderExpensesList(){
  const el=document.getElementById('expenses-list')
  if(!el)return
  const now=new Date(), curQ=quarterOf(now), curY=now.getFullYear()
  const catLabel={combustivel:'Combustível',ferramentas:'Ferramentas',seguro:'Seguro',material_geral:'Material geral',outro:'Outro'}
  const doTri=allExpenses.filter(e=>{
    const d=new Date(e.expense_date)
    return d.getFullYear()===curY&&quarterOf(d)===curQ
  })
  el.innerHTML=allExpenses.length?allExpenses.slice(0,8).map(e=>`
    <div class="fin-row">
      <div style="flex:1;min-width:0"><div class="fr-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(e.description)}</div>
      <div class="fr-s">${catLabel[e.category]||e.category} · ${new Date(e.expense_date).toLocaleDateString('pt-PT',{day:'numeric',month:'short',year:'numeric'})}</div></div>
      <div class="fr-v" style="color:#DC5A5A">-${eur(e.amount)}</div>
      <button class="btn btn-ghost" style="border:1.5px solid var(--border);padding:4px 8px;font-size:11px;margin-left:8px" onclick="deleteExpense('${e.id}')">✕</button>
    </div>`).join('')
    :'<div class="tc-empty"><div class="ico" style="background:var(--bg);color:var(--muted)"><svg class="ic" viewBox="0 0 24 24"><path d="M3 3v18h18"/></svg></div><p>Sem despesas registadas.</p></div>'
  document.getElementById('exp-total').textContent=eur(doTri.reduce((s,e)=>s+Number(e.amount),0))
}

async function addExpense(){
  const desc=document.getElementById('exp-desc').value.trim()
  const amount=parseFloat(document.getElementById('exp-amount').value)
  const date=document.getElementById('exp-date').value||new Date().toISOString().slice(0,10)
  if(!desc){showAlert('exp-error','Indica uma descrição.','error');return}
  if(!amount||amount<=0){showAlert('exp-error','Indica um valor válido.','error');return}
  const{error}=await db.from('business_expenses').insert({
    professional_id:profileId,
    description:desc,
    amount,
    category:document.getElementById('exp-category').value,
    expense_date:date
  })
  if(error){showAlert('exp-error','Erro: '+error.message,'error');return}
  document.getElementById('exp-desc').value=''
  document.getElementById('exp-amount').value=''
  document.getElementById('exp-date').value=''
  loadExpenses()
}

async function deleteExpense(id){
  if(!confirm('Remover esta despesa?'))return
  await db.from('business_expenses').delete().eq('id',id)
  loadExpenses()
}

// ===== RELATÓRIO ANUAL =====
function populateReportYears(){
  const sel=document.getElementById('report-year')
  if(!sel||sel.options.length)return
  const years=new Set([new Date().getFullYear()])
  allJobs.forEach(j=>{ if(j.status==='pago'){ const d=new Date(j.paid_at||j.completed_at||j.updated_at||j.created_at); years.add(d.getFullYear()) } })
  allExpenses.forEach(e=>years.add(new Date(e.expense_date).getFullYear()))
  const sorted=[...years].sort((a,b)=>b-a)
  sel.innerHTML=sorted.map(y=>`<option value="${y}">${y}</option>`).join('')
}

function renderAnnualReport(){
  const sel=document.getElementById('report-year')
  const revEl=document.getElementById('report-revenue')
  if(!sel||!revEl)return
  if(!sel.options.length)populateReportYears()
  const year=parseInt(sel.value||new Date().getFullYear(),10)
  const paid=financePaidJobs().filter(j=>j.when.getFullYear()===year)
  const revenue=paid.reduce((s,j)=>s+j.amount,0)
  const matCost=paid.reduce((s,j)=>s+Number(j.material_cost||0),0)
  const yearExpenses=allExpenses.filter(e=>new Date(e.expense_date).getFullYear()===year)
  const expTotal=yearExpenses.reduce((s,e)=>s+Number(e.amount),0)
  const totalExpenses=matCost+expTotal
  const profit=revenue-totalExpenses
  revEl.textContent=eur(revenue)
  document.getElementById('report-expenses').textContent=eur(totalExpenses)
  const profitEl=document.getElementById('report-profit')
  profitEl.textContent=eur(profit)
  profitEl.style.color=profit>=0?'var(--green)':'#DC5A5A'
}

function exportAnnualCsv(){
  const sel=document.getElementById('report-year')
  const year=parseInt(sel?.value||new Date().getFullYear(),10)
  const paid=financePaidJobs().filter(j=>j.when.getFullYear()===year)
  const yearExpenses=allExpenses.filter(e=>new Date(e.expense_date).getFullYear()===year)
  if(!paid.length&&!yearExpenses.length){showAlert('exp-error','Sem dados para exportar em '+year+'.','error');return}
  const esc=v=>{const s=String(v??'');return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  const lines=[['Tipo','Data','Descrição','Valor (EUR)'].map(esc).join(';')]
  paid.forEach(j=>lines.push(['Receita',j.when.toLocaleDateString('pt-PT'),j.title,j.amount.toFixed(2).replace('.',',')].map(esc).join(';')))
  yearExpenses.forEach(e=>lines.push(['Despesa',new Date(e.expense_date).toLocaleDateString('pt-PT'),e.description,('-'+Number(e.amount).toFixed(2)).replace('.',',')].map(esc).join(';')))
  const revenue=paid.reduce((s,j)=>s+j.amount,0)
  const expTotal=yearExpenses.reduce((s,e)=>s+Number(e.amount),0)+paid.reduce((s,j)=>s+Number(j.material_cost||0),0)
  lines.push(['','','Lucro líquido '+year,(revenue-expTotal).toFixed(2).replace('.',',')].map(esc).join(';'))
  const csv='\ufeff'+lines.join('\r\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download='Proliga-relatorio-anual-'+year+'.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ===== ORÇAMENTOS (PDF) =====
function openQuoteModal(jobId){
  quoteJobId=jobId||null
  document.getElementById('q-client').value=''
  document.getElementById('q-valid').value=30
  document.getElementById('q-notes').value=''
  document.getElementById('q-items').innerHTML=''
  document.getElementById('quote-error').style.display='none'
  if(jobId){
    const j=allJobs.find(x=>x.id===jobId)
    if(j){
      document.getElementById('q-client').value=j.client_name||''
      addQuoteItemRow(j.title,1,j.quote_amount||'')
    }else addQuoteItemRow()
  }else addQuoteItemRow()
  updateQuoteTotal()
  document.getElementById('quote-modal-overlay').classList.add('open')
}
function closeQuoteModal(){document.getElementById('quote-modal-overlay').classList.remove('open')}

function addQuoteItemRow(desc='',qty=1,price=''){
  const row=document.createElement('div')
  row.className='q-item-row'
  row.innerHTML=`<input type="text" class="q-item-desc" placeholder="Descrição" value="${escapeHtml(desc)}" oninput="updateQuoteTotal()"/><input type="number" class="q-item-qty" min="1" value="${qty}" oninput="updateQuoteTotal()"/><input type="number" class="q-item-price" min="0" step="0.01" placeholder="€" value="${price}" oninput="updateQuoteTotal()"/><button class="q-item-remove" type="button" onclick="this.parentElement.remove();updateQuoteTotal()">✕</button>`
  document.getElementById('q-items').appendChild(row)
}

function collectQuoteItems(){
  return[...document.querySelectorAll('#q-items .q-item-row')].map(row=>({
    desc:row.querySelector('.q-item-desc').value.trim(),
    qty:parseFloat(row.querySelector('.q-item-qty').value)||1,
    price:parseFloat(row.querySelector('.q-item-price').value)||0
  })).filter(it=>it.desc)
}

function updateQuoteTotal(){
  const items=collectQuoteItems()
  const total=items.reduce((s,it)=>s+it.qty*it.price,0)
  document.getElementById('q-total').textContent='€'+total.toFixed(2).replace('.',',')
}

function buildQuotePdf({client,items,subtotal,validDays,notes}){
  const{jsPDF}=window.jspdf
  const doc=new jsPDF()
  const pro=profileData||{}
  const dateStr=new Date().toLocaleDateString('pt-PT')
  const validUntil=new Date(Date.now()+(validDays||30)*86400000).toLocaleDateString('pt-PT')
  const quoteNum='ORC-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,6).toUpperCase()

  doc.setFillColor(232,114,10)
  doc.rect(0,0,210,32,'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(18)
  doc.setFont(undefined,'bold')
  doc.text(pro.name||'Profissional',14,16)
  doc.setFontSize(10)
  doc.setFont(undefined,'normal')
  doc.text([pro.category||'',pro.location||''].filter(Boolean).join(' · '),14,23)
  doc.setFontSize(9)
  doc.text('Gerado via Proliga',196,16,{align:'right'})

  doc.setTextColor(20,24,31)
  doc.setFontSize(20)
  doc.setFont(undefined,'bold')
  doc.text('ORÇAMENTO',14,46)
  doc.setFontSize(9)
  doc.setFont(undefined,'normal')
  doc.setTextColor(91,98,112)
  doc.text('Nº '+quoteNum,14,52)

  doc.setFontSize(10)
  doc.setTextColor(20,24,31)
  doc.text('Para: '+client,120,46)
  doc.setTextColor(91,98,112)
  doc.setFontSize(9)
  doc.text('Data: '+dateStr,120,52)
  doc.text('Válido até: '+validUntil,120,57)

  const contactLine=[pro.email,pro.phone,pro.website].filter(Boolean).join('   ·   ')
  if(contactLine){doc.setFontSize(8.5);doc.text(contactLine,14,62)}

  let y=74
  doc.setFillColor(247,248,250)
  doc.rect(14,y-6,182,9,'F')
  doc.setFontSize(9)
  doc.setFont(undefined,'bold')
  doc.setTextColor(20,24,31)
  doc.text('Descrição',18,y)
  doc.text('Qtd',140,y)
  doc.text('Preço Unit.',156,y)
  doc.text('Total',192,y,{align:'right'})
  y+=10
  doc.setFont(undefined,'normal')
  items.forEach(it=>{
    doc.text(String(it.desc).slice(0,58),18,y)
    doc.text(String(it.qty),140,y)
    doc.text('€'+Number(it.price).toFixed(2),156,y)
    doc.text('€'+(it.qty*it.price).toFixed(2),192,y,{align:'right'})
    y+=8
    if(y>260){doc.addPage();y=20}
  })
  y+=4
  doc.setDrawColor(236,236,233)
  doc.line(14,y,196,y)
  y+=10
  doc.setFont(undefined,'bold')
  doc.setFontSize(12)
  doc.text('Total: €'+Number(subtotal).toFixed(2),192,y,{align:'right'})
  y+=14
  if(notes){
    doc.setFont(undefined,'bold')
    doc.setFontSize(9)
    doc.setTextColor(20,24,31)
    doc.text('Notas',14,y)
    y+=6
    doc.setFont(undefined,'normal')
    doc.setTextColor(91,98,112)
    const noteLines=doc.splitTextToSize(notes,182)
    doc.text(noteLines,14,y)
  }
  doc.setFontSize(8)
  doc.setTextColor(150,150,150)
  if(!planLimits.own_branding)doc.text('Orçamento gerado através da Proliga · proliga.pt',14,287)
  return doc
}

async function generateQuotePdf(){
  if(planLimits.quotes_per_month!=null){
    const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0)
    const{count}=await db.from('quotes').select('*',{count:'exact',head:true}).eq('professional_id',profileId).gte('created_at',m0.toISOString())
    if((count||0)>=planLimits.quotes_per_month){
      showAlert('quote-error','Atingiste os '+planLimits.quotes_per_month+' orçamentos deste mês do plano grátis. O plano Pro tem orçamentos ilimitados e com a tua marca.','error')
      return
    }
  }
  const client=document.getElementById('q-client').value.trim()
  const validDays=parseInt(document.getElementById('q-valid').value)||30
  const notes=document.getElementById('q-notes').value.trim()
  const items=collectQuoteItems()
  if(!client){showAlert('quote-error','Indica o nome do cliente.','error');return}
  if(!items.length){showAlert('quote-error','Adiciona pelo menos um item ao orçamento.','error');return}
  const subtotal=items.reduce((s,it)=>s+it.qty*it.price,0)
  const{error}=await db.from('quotes').insert({professional_id:profileId,job_id:quoteJobId,client_name:client,items,subtotal,valid_days:validDays,notes:notes||null})
  if(error){
    console.error('quote save error:',error)
    // O limite de orçamentos/mês também é aplicado no servidor (trigger
    // enforce_quote_limit), não só aqui no JS — se a verificação acima
    // ficar desatualizada por qualquer razão, o insert falha aqui em vez
    // de deixar passar. Mostramos sempre o erro em vez de gerar o PDF como
    // se tivesse sido guardado.
    const msg=(error.message&&error.message.includes('Limite de'))
      ?error.message+'. O plano Pro tem orçamentos ilimitados e com a tua marca.'
      :'Não foi possível guardar o orçamento: '+(error.message||'erro desconhecido')
    showAlert('quote-error',msg,'error')
    return
  }
  const doc=buildQuotePdf({client,items,subtotal,validDays,notes})
  doc.save('Orcamento-'+client.replace(/[^a-zA-Z0-9]+/g,'-')+'.pdf')
  closeQuoteModal()
  showAlert('job-success','Orçamento gerado e descarregado!')
  loadQuotes()
}

async function loadQuotes(){
  if(!profileId)return
  const el=document.getElementById('quotes-list')
  if(!el)return
  const{data}=await db.from('quotes').select('*').eq('professional_id',profileId).order('created_at',{ascending:false}).limit(20)
  quotesCache=data||[]
  if(!quotesCache.length){el.innerHTML='<div class="empty">Ainda não geraste nenhum orçamento.</div>';return}
  el.innerHTML=quotesCache.map((q,i)=>{
    const date=new Date(q.created_at).toLocaleDateString('pt-PT')
    const nItems=Array.isArray(q.items)?q.items.length:0
    return`<div class="quote-row">
      <div><div class="qr-client">${escapeHtml(q.client_name)}</div><div class="qr-meta">${date} · €${Number(q.subtotal).toFixed(2)} · ${nItems} item${nItems!==1?'s':''}</div></div>
      <button class="btn btn-outline btn-sm" onclick="redownloadQuote(${i})">Descarregar</button>
    </div>`
  }).join('')
}

function redownloadQuote(i){
  const q=quotesCache[i]
  if(!q)return
  const doc=buildQuotePdf({client:q.client_name,items:q.items,subtotal:q.subtotal,validDays:q.valid_days,notes:q.notes})
  doc.save('Orcamento-'+q.client_name.replace(/[^a-zA-Z0-9]+/g,'-')+'.pdf')
}

// ===== INTELIGÊNCIA DE PREÇOS DE MERCADO =====
async function loadMarketPricing(){
  const box=document.getElementById('price-hint')
  if(!profileData?.category)return
  const{data,error}=await db.from('services').select('price_from,price_to,profiles!inner(category)').eq('profiles.category',profileData.category)
  if(error||!data)return
  const froms=data.map(s=>s.price_from).filter(v=>v!=null)
  const tos=data.map(s=>s.price_to!=null?s.price_to:s.price_from).filter(v=>v!=null)
  if(froms.length<3){if(box)box.classList.remove('show');marketPriceCache=null;return}
  const lo=froms.reduce((a,b)=>a+Number(b),0)/froms.length
  const hi=Math.max(tos.reduce((a,b)=>a+Number(b),0)/tos.length,lo)
  marketPriceCache={category:profileData.category,lo,hi}
  if(box){
    box.classList.add('show')
    box.innerHTML=`<svg class="ic" viewBox="0 0 24 24" style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M15.5 9.5a2.5 2.5 0 0 0-2.5-2H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2.5 2.5 0 0 1-2.5-2"/></svg><span>Profissionais de <strong>${escapeHtml(profileData.category)}</strong> na Proliga cobram, em média, entre <strong>€${lo.toFixed(0)}</strong> e <strong>€${hi.toFixed(0)}</strong>. Usa isto como referência ao definires os teus preços.</span>`
  }
  if(typeof renderInsights==='function')renderInsights()
}

// ===== PAINEL DE MERCADO (plano Pro) =====
async function runQuickCalc(){
  if(profileData?.account_type==='client')return
  if(!profileData?.category)return
  const btn=document.getElementById('quick-calc-btn')
  btn.disabled=true;btn.textContent='A calcular...'
  const{data,error}=await db.rpc('get_market_insights',{p_category:profileData.category})
  btn.disabled=false;btn.textContent='Ver faixa de preço da minha categoria'
  const box=document.getElementById('quick-calc-result')
  box.style.display='block'
  if(error||!data||!data.price_low){
    document.getElementById('qc-range').textContent='Ainda sem dados suficientes'
    document.getElementById('qc-sub').textContent='para '+profileData.category+' na tua zona'
    return
  }
  document.getElementById('qc-range').textContent=`€${Number(data.price_low).toFixed(0)} – €${Number(data.price_high).toFixed(0)}`
  document.getElementById('qc-sub').textContent=`média €${Number(data.price_avg).toFixed(0)} · baseado em ${data.offers_sample} propostas recentes em ${profileData.category}`
}

async function loadMarketInsights(){
  if(!profileData?.category)return
  document.getElementById('mkt-cat-label').textContent=profileData.category+(profileData.location?' · '+profileData.location:'')
  const{data,error}=await db.rpc('get_market_insights',{p_category:profileData.category})
  if(error||!data){
    document.getElementById('mkt-requests').textContent='—'
    return
  }
  const d=data

  document.getElementById('mkt-requests').textContent=d.requests_30d??0
  if(d.requests_prev_30d>0){
    const delta=Math.round(((d.requests_30d-d.requests_prev_30d)/d.requests_prev_30d)*100)
    document.getElementById('mkt-requests-sub').textContent=delta>=0?`+${delta}% vs. mês anterior`:`${delta}% vs. mês anterior`
  }else{
    document.getElementById('mkt-requests-sub').textContent='publicados na tua categoria'
  }

  if(d.offers_sample>=3&&d.price_low!=null){
    document.getElementById('mkt-price').textContent=`€${Number(d.price_low).toFixed(0)}–€${Number(d.price_high).toFixed(0)}`
    document.getElementById('mkt-price-sub').textContent=`média €${Number(d.price_avg).toFixed(0)} · ${d.offers_sample} propostas`
  }else{
    document.getElementById('mkt-price').textContent='—'
    document.getElementById('mkt-price-sub').textContent='ainda sem dados suficientes'
  }

  document.getElementById('mkt-peak').textContent=d.peak_dow||'—'

  const actEl=document.getElementById('mkt-activity')
  actEl.innerHTML=`<div class="fin-row"><div><div class="fr-t">Propostas enviadas</div><div class="fr-s">nos últimos 30 dias</div></div><div class="fr-v">${d.my_offers_30d??0}</div></div>`

  const respEl=document.getElementById('mkt-response')
  const myR=d.my_response_minutes, catR=d.category_response_minutes
  if(myR!=null){
    let cmp=''
    if(catR!=null){
      cmp=myR<=catR?`<span style="color:var(--green);font-weight:700">mais rápido</span> que a média`:`<span style="color:var(--amber);font-weight:700">mais lento</span> que a média`
    }
    respEl.innerHTML=`<div class="fin-row"><div><div class="fr-t">Tu: ${fmtResponseMins(myR)}</div><div class="fr-s">${catR!=null?`Categoria: ${fmtResponseMins(catR)} · ${cmp}`:'sem média de categoria ainda'}</div></div></div>`
  }else{
    respEl.innerHTML='<div class="tc-empty"><p>Ainda não temos dados de resposta suficientes.</p></div>'
  }

  const tipsEl=document.getElementById('mkt-tips')
  const tips=[]
  if(d.offers_sample>=3)tips.push(`Usa a faixa de preço acima como referência ao responderes a pedidos parecidos — já aparece sugerida no ecrã de Pedidos.`)
  if(d.peak_dow)tips.push(`Garante que a tua disponibilidade está atualizada perto de ${d.peak_dow.toLowerCase()}, o dia com mais pedidos na tua categoria.`)
  if(myR!=null&&catR!=null&&myR>catR)tips.push(`Responder mais depressa do que a média da categoria aumenta as tuas hipóteses de fechar o trabalho antes da concorrência.`)
  if(!tips.length)tips.push('Ainda estamos a juntar dados suficientes na tua categoria. Volta a verificar dentro de umas semanas.')
  tipsEl.innerHTML=tips.map(t=>`<p style="margin-bottom:8px">• ${t}</p>`).join('')
}

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
  el.setAttribute('style','position:fixed;left:14px;right:14px;bottom:14px;z-index:9999;background:#0F1A33;color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;font-family:inherit;max-width:420px;margin:0 auto')
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
  if(q)query=query.or(`name.ilike.%${q}%,category.ilike.%${q}%,location.ilike.%${q}%`)
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
      box.innerHTML=`<input type="text" readonly value="${url}" style="margin-bottom:8px;font-size:12.5px" onclick="this.select()"/>
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
