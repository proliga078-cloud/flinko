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

;(()=>{
const main=document.querySelector('.main-content')
if(!main)return
main.addEventListener('mousemove',e=>{
const card=e.target.closest('.list-item,.job-card')
if(!card)return
const r=card.getBoundingClientRect()
card.style.setProperty('--mx',(e.clientX-r.left)+'px')
card.style.setProperty('--my',(e.clientY-r.top)+'px')
})
})()
let refJobId=null,refSelectedPro=null
let marketPriceCache=null
let planLimits={portfolio_max:3,quotes_per_month:3,finances:false,market_insights:false,own_branding:false,custom_link:false,ai_actions:false}
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
if(navMkt)navMkt.style.display=planLimits.market_insights?'':'none'
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
mktLock.style.display=planLimits.market_insights?'none':'block'
mktBody.style.display=planLimits.market_insights?'':'none'
}
}

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
const{data:proRows}=await db.rpc('get_my_profile')
const pro=proRows&&proRows[0]
if(pro){profileData=pro;profileId=pro.id;await loadPrivatePhone();fillProfileForm(profileData)}
else await createProfile()
updateSidebar()
if(profileId){
loadStats()
loadRecentMsgs()
loadRecentReviews()
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
checkUpgrade();if(profileData?.account_type==='client'){
var qc=document.getElementById('quick-calc-card');if(qc)qc.style.display='none';
document.querySelectorAll('[data-audience="pro"]').forEach(function(el){el.style.display='none'});
document.querySelectorAll('[data-audience="client"]').forEach(function(el){el.style.display=''});
var mobPro=document.getElementById('mobile-nav-pro-items');if(mobPro)mobPro.style.display='none';
var mobClient=document.getElementById('mobile-nav-client-items');if(mobClient)mobClient.style.display='';
fillClientProfileForm();
showPage('client-home')
}
} catch(e) {
console.error('init error:',e)
}
}

function renderClientWelcome(){var host=document.getElementById('page-myrequests');if(!host||document.getElementById('client-welcome'))return;var first=(profileData&&profileData.name)?profileData.name.split(' ')[0]:'';var el=document.createElement('div');el.id='client-welcome';el.style.cssText='background:linear-gradient(135deg,#0f231b,#1a3a2c);border-radius:16px;padding:20px 22px;margin-bottom:20px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px';var txt=document.createElement('div');var h=document.createElement('div');h.style.cssText='font-size:19px;font-weight:800';h.textContent='Olá'+(first?', '+first:'')+'!';var p=document.createElement('div');p.style.cssText='font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;max-width:420px';p.textContent='Publica o que precisas abaixo, ou procura diretamente um profissional perto de ti.';txt.appendChild(h);txt.appendChild(p);var btn=document.createElement('button');btn.className='btn';btn.style.cssText='background:#fff;color:#0f231b;white-space:nowrap';btn.textContent='🔎 Procurar profissionais';btn.onclick=function(){location.href='index.html#heroSearchForm'};el.appendChild(txt);el.appendChild(btn);host.insertBefore(el,host.firstChild)}async function createProfile(){
const name=user.user_metadata?.name||user.email.split('@')[0]
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
const chGreet=document.getElementById('ch-greet')
if(chGreet)chGreet.textContent=`Olá, ${name.split(' ')[0]}`
const chDate=document.getElementById('ch-date')
if(chDate)chDate.textContent=new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})
updateCreditsBadge()
}

function updateCreditsBadge(){
const credits=Number(profileData?.credits)||0
const label=credits>0?(credits.toLocaleString('pt-PT',{maximumFractionDigits:1})+' créditos'):'Ganhar créditos'
const el=document.getElementById('sidebar-credits-text')
if(el)el.textContent=label
const elM=document.getElementById('sidebar-credits-text-mobile')
if(elM)elM.textContent=label
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
if(error){showAlert('profile-error','Erro ao guardar: '+error.message,'error');return}
const{error:phoneErr}=await db.from('profile_private').upsert({profile_id:profileId,phone:phoneVal,updated_at:new Date().toISOString()},{onConflict:'profile_id'})
if(phoneErr){showAlert('profile-error','Perfil guardado, mas o telefone não foi atualizado: '+phoneErr.message,'error');return}
profileData={...profileData,...updates,phone:phoneVal}
updateSidebar()
showAlert('profile-success','Perfil guardado com sucesso!')
}
