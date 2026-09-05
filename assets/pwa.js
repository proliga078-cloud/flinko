(function(){
  'use strict';

  // ---- Registar service worker ----
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }

  // ---- Banner "Instalar app" ----
  var deferredPrompt = null;
  var DISMISS_KEY = 'proliga_install_dismissed_at';
  var DISMISS_DAYS = 14;

  function wasDismissedRecently(){
    var t = localStorage.getItem(DISMISS_KEY);
    if(!t) return false;
    var days = (Date.now() - Number(t)) / 86400000;
    return days < DISMISS_DAYS;
  }

  function showInstallBanner(){
    if(document.getElementById('pwa-install-banner')) return;
    if(wasDismissedRecently()) return;
    var el = document.createElement('div');
    el.id = 'pwa-install-banner';
    el.setAttribute('style', 'position:fixed;left:14px;right:14px;bottom:14px;z-index:9999;background:var(--ink,#132420);color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;font-family:inherit;max-width:420px;margin:0 auto');
    el.innerHTML =
      '<div style="width:38px;height:38px;border-radius:10px;background:#E8720A;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px">F</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:700">Instalar a Flinko</div>'+
        '<div style="font-size:11.5px;color:rgba(255,255,255,.65)">Acesso rápido e notificações, sem abrir o browser.</div>'+
      '</div>'+
      '<button id="pwa-install-btn" style="background:#E8720A;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Instalar</button>'+
      '<button id="pwa-install-close" aria-label="Fechar" style="background:transparent;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;padding:0 2px;line-height:1">&times;</button>';
    document.body.appendChild(el);

    document.getElementById('pwa-install-btn').addEventListener('click', function(){
      el.remove();
      if(deferredPrompt){
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function(){ deferredPrompt = null; });
      }
    });
    document.getElementById('pwa-install-close').addEventListener('click', function(){
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      el.remove();
    });
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    document.dispatchEvent(new CustomEvent('flinko:can-install'));
    setTimeout(showInstallBanner, 1500);
  });

  window.addEventListener('appinstalled', function(){
    var el = document.getElementById('pwa-install-banner');
    if(el) el.remove();
    deferredPrompt = null;
    document.dispatchEvent(new CustomEvent('flinko:installed'));
  });

  // ---- API para botões próprios (ex: secção da homepage) ----
  window.flinkoInstallApp = function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function(){ deferredPrompt = null; });
    }
  };
  window.flinkoCanInstall = function(){
    return !!deferredPrompt;
  };
  window.flinkoIsInstalled = function(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  };
})();
