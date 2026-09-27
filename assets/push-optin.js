// Notificações push: pedir autorização na altura certa.
//
// Em vez de um aviso genérico ao abrir a página, cada página chama
// flinkoPushAsk() logo a seguir a um momento em que a pessoa quer mesmo ser
// avisada (enviou a 1.ª mensagem, publicou um pedido, acabou o perfil). O texto
// diz o que ganha. Quem fecha o aviso não o volta a ver durante 14 dias.
// Quem já autorizou fica com a subscrição guardada neste dispositivo
// (flinkoPushEnsure), sem perguntar nada.
;(function(){
  'use strict'
  var VAPID_PUBLIC_KEY = 'BA2gyreUT3GkDevWZvkMxc3zW-DLTEnbn9LQwrNkdLDSRlcPbi-5luCy6AxWwSdpXpDbo201QbhfgRvq4pvXAnM'
  var UNTIL_KEY = 'fk_push_ask_until'
  var PAUSA_DIAS = 14

  function supported(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }
  function key(b64){
    var pad = '='.repeat((4 - b64.length % 4) % 4)
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
    var out = new Uint8Array(raw.length)
    for(var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  }
  function paused(){
    try{ return Number(localStorage.getItem(UNTIL_KEY) || 0) > Date.now() }catch(e){ return false }
  }
  function pause(){
    try{ localStorage.setItem(UNTIL_KEY, String(Date.now() + PAUSA_DIAS * 864e5)) }catch(e){}
  }

  // Guarda (ou atualiza) a subscrição deste dispositivo. Só corre com a
  // autorização já dada; nunca abre o pedido do browser.
  async function save(db, userId, criar){
    var reg = await navigator.serviceWorker.ready
    var sub = await reg.pushManager.getSubscription()
    if(!sub && criar) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID_PUBLIC_KEY) })
    if(!sub) return false
    var j = sub.toJSON()
    var r = await db.from('push_subscriptions').upsert({ profile_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
    return !r.error
  }

  window.flinkoPushEnsure = async function(db, userId){
    if(!supported() || !db || !userId || Notification.permission !== 'granted') return false
    try{ return await save(db, userId, true) }catch(e){ return false }
  }

  // opts: { db, userId, title, text, delay }
  window.flinkoPushAsk = function(opts){
    opts = opts || {}
    if(!supported() || !opts.db || !opts.userId) return false
    if(Notification.permission !== 'default' || paused() || document.getElementById('fk-push-ask')) return false
    setTimeout(function(){
      if(document.getElementById('fk-push-ask')) return
      var el = document.createElement('div')
      el.id = 'fk-push-ask'
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-label', 'Ativar notificações')
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:9998;max-width:420px;margin:0 auto;background:#132420;color:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 14px 40px rgba(0,0,0,.3);display:flex;gap:12px;align-items:flex-start;font-family:inherit;animation:fkPushIn .25s ease-out'
      el.innerHTML =
        '<style>@keyframes fkPushIn{from{transform:translateY(20px);opacity:0}}#fk-push-ask button{font:inherit;cursor:pointer;border:0;border-radius:10px}</style>' +
        '<div style="width:40px;height:40px;border-radius:12px;background:#E8720A;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px" aria-hidden="true">🔔</div>' +
        '<div style="flex:1;min-width:0"><div data-t style="font-size:14px;font-weight:800;line-height:1.3"></div><div data-x style="font-size:12.5px;color:rgba(255,255,255,.72);margin-top:3px;line-height:1.4"></div>' +
        '<div style="display:flex;gap:8px;margin-top:10px"><button data-ok style="background:#E8720A;color:#fff;padding:8px 14px;font-size:13px;font-weight:800">Ativar notificações</button><button data-no style="background:transparent;color:rgba(255,255,255,.7);padding:8px 10px;font-size:13px;font-weight:600">Agora não</button></div></div>'
      el.querySelector('[data-t]').textContent = opts.title || 'Ativar notificações'
      el.querySelector('[data-x]').textContent = opts.text || 'Sabe logo quando tens novidades, mesmo com a Flinko fechada.'
      document.body.appendChild(el)
      el.querySelector('[data-no]').onclick = function(){ pause(); el.remove() }
      el.querySelector('[data-ok]').onclick = async function(){
        el.remove()
        try{
          var perm = await Notification.requestPermission()
          if(perm !== 'granted'){ pause(); return }
          await save(opts.db, opts.userId, true)
        }catch(e){}
      }
    }, opts.delay == null ? 800 : opts.delay)
    return true
  }
})()
