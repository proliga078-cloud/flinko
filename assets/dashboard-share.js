// ---------- DIVULGAR O PERFIL (todos os planos) ----------
// Link, WhatsApp e cartaz com QR para o profissional levar clientes ao seu perfil.
// O link próprio (/o-nome) é do plano Pro; sem ele usa-se profile.html?id=...
function shareUrl(){
  if(!profileData||!profileId)return ''
  return location.origin+(profileData.slug?'/'+encodeURIComponent(profileData.slug):'/profile.html?id='+encodeURIComponent(profileId))
}

function renderShare(){
  const el=document.getElementById('share-url')
  if(!el)return
  const url=shareUrl()
  el.textContent=url.replace(/^https?:\/\//,'')
  el.href=url||'#'
  const wa=document.getElementById('share-wa')
  if(wa){
    const txt='Olá! Podes ver o meu perfil e pedir-me orçamento grátis na Flinko: '+url
    wa.href='https://wa.me/?text='+encodeURIComponent(txt)
  }
  const poster=document.getElementById('share-poster')
  if(poster&&profileId)poster.href='cartaz.html?id='+encodeURIComponent(profileId)
  const cards=document.getElementById('share-cards'),img=document.getElementById('share-image')
  if(cards&&profileId)cards.href='cartaz.html?formato=cartoes&id='+encodeURIComponent(profileId)
  if(img&&profileId)img.href='cartaz.html?formato=imagem&id='+encodeURIComponent(profileId)
}

function copyShareUrl(){
  const url=shareUrl()
  if(!url)return
  navigator.clipboard.writeText(url)
    .then(()=>showAlert('profile-success','Link copiado.'))
    .catch(()=>showAlert('profile-error','Não consegui copiar. Seleciona o link à mão.','error'))
}
