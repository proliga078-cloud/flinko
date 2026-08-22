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

