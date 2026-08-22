window.requestUpgrade=async function(plan,evt){
evt=evt||window.event
if(typeof db==='undefined'){alert('Erro a carregar o sistema de pagamentos. Recarrega a página.');return}
const{data:{session}}=await db.auth.getSession()
if(!session){location.href='auth.html?tab=login&redirect=pricing.html';return}
const btn=evt&&evt.target?evt.target:null
const original=btn?btn.textContent:null
if(btn){btn.textContent='A processar...';btn.disabled=true}
try{
const billing=(typeof isYearly!=='undefined'&&isYearly)?'yearly':'monthly'
const res=await fetch('/.netlify/functions/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({plan,billing})})
const data=await res.json()
if(res.ok&&data.url){location.href=data.url}else{alert(data.error||'Não foi possível iniciar o pagamento. Tenta novamente.')}
}catch(e){
alert('Erro ao iniciar pagamento: '+e.message)
}finally{
if(btn){btn.textContent=original;btn.disabled=false}
}
}

window.manageBilling=async function(){
if(typeof db==='undefined'){alert('Erro a carregar o sistema de pagamentos. Recarrega a página.');return}
const{data:{session}}=await db.auth.getSession()
if(!session){location.href='auth.html?tab=login&redirect=dashboard.html';return}
try{
const res=await fetch('/.netlify/functions/create-portal-session',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:'{}'})
const data=await res.json()
if(res.ok&&data.url){location.href=data.url}else{alert(data.error||'Erro ao abrir o portal de gestão da subscrição.')}
}catch(e){
alert('Erro: '+e.message)
}
}

window.checkUpgrade=function(){
const plan=(typeof profileData!=='undefined'&&profileData&&profileData.plan)||'free'
const banner=document.getElementById('upgrade-banner-wrap')
if(banner){
if(plan==='free'){
banner.innerHTML='<div class="upgrade-banner"><div><h3>🚀 Aumenta a visibilidade do teu perfil</h3><p>Plano Pro: portfólio, badge verificado, destaque nas pesquisas. A partir de €9,99/mês.</p></div><button class="btn btn-gold" onclick="location.href=\'pricing.html\'">Atualizar plano →</button></div>'
}else if(plan==='pro'){
banner.innerHTML='<div class="upgrade-banner" style="background:linear-gradient(135deg,#C25A06,#E8720A)"><div><h3>🚀 Estás no plano Pro</h3><p>Portefólio, selo verificado e destaque nas pesquisas — tudo ativo.</p></div><button class="btn btn-outline" style="background:#fff" onclick="manageBilling()">Gerir subscrição</button></div>'
}else if(plan==='premium'){
banner.innerHTML='<div class="upgrade-banner" style="background:linear-gradient(135deg,#0f172a,#1d4ed8)"><div><h3>👑 Estás no plano Premium</h3><p>Tens o destaque máximo na Proliga.</p></div><button class="btn btn-outline" style="background:#fff" onclick="manageBilling()">Gerir subscrição</button></div>'
}
}
if(typeof loadPortfolio==='function')loadPortfolio()
if(typeof loadDiaryDash==='function')loadDiaryDash()
if(typeof loadFaqsDash==='function')loadFaqsDash()
}

document.addEventListener('DOMContentLoaded',function(){
const params=new URLSearchParams(location.search)
if(params.get('checkout')==='success'){
setTimeout(()=>alert('🎉 Pagamento confirmado! O teu plano foi atualizado (pode demorar alguns segundos a refletir-se).'),600)
}else if(params.get('checkout')==='cancel'){
setTimeout(()=>alert('Pagamento cancelado. Podes tentar novamente quando quiseres.'),300)
}
})
