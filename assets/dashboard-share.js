// ---------- DIVULGAR O PERFIL (todos os planos) ----------
// Link, QR, WhatsApp e cartaz para o profissional levar clientes ao seu perfil.
// Com link próprio (/o-nome) usa-se esse; sem ele, profile.html?id=...
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
  drawShareQr(url)
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

// O QR fica no painel para todos os planos (antes só aparecia com o link próprio).
let shareQrText=''
function drawShareQr(url){
  const alvo=document.getElementById('share-qr')
  if(!alvo||!url||url===shareQrText)return
  if(typeof QRCode==='undefined'){loadLib('qrcode').then(()=>drawShareQr(url)).catch(()=>{alvo.innerHTML='<div style="font-size:11px;color:var(--muted-2);padding:8px">QR indisponível</div>'});return}
  alvo.innerHTML=''
  shareQrText=url
  new QRCode(alvo,{text:url,width:120,height:120,correctLevel:QRCode.CorrectLevel.M})
}

function downloadShareQr(){
  const img=document.querySelector('#share-qr img')
  const canvas=document.querySelector('#share-qr canvas')
  const fonte=img&&img.src?img.src:(canvas?canvas.toDataURL('image/png'):null)
  if(!fonte){showAlert('profile-error','O QR ainda não está pronto. Tenta daqui a um segundo.','error');return}
  const a=document.createElement('a')
  a.href=fonte
  a.download='flinko-'+((profileData&&profileData.slug)||'perfil')+'-qr.png'
  document.body.appendChild(a);a.click();a.remove()
}

function copyShareUrl(){
  const url=shareUrl()
  if(!url)return
  navigator.clipboard.writeText(url)
    .then(()=>showAlert('profile-success','Link copiado.'))
    .catch(()=>showAlert('profile-error','Não consegui copiar. Seleciona o link à mão.','error'))
}
