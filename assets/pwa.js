(function(){
  'use strict';

  // ---- Registar service worker ----
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }

  // ---- Instalar a app ----
  // Android/Chrome/Edge: o browser dispara "beforeinstallprompt" e nós
  // mostramos o nosso aviso com o botão "Instalar". No iPhone/iPad o Safari
  // nunca dispara esse evento: a instalação é sempre manual (Partilhar →
  // Adicionar ao ecrã principal), por isso mostramos os passos.
  var deferredPrompt = null;
  var DISMISS_KEY = 'proliga_install_dismissed_at';
  var DISMISS_DAYS = 14;
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\//i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isMobile = isIOS || isAndroid;

  function store(fn){ try{ return fn(); }catch(e){ return null; } }
  function wasDismissedRecently(){
    var t = store(function(){ return localStorage.getItem(DISMISS_KEY); });
    if(!t) return false;
    return (Date.now() - Number(t)) / 86400000 < DISMISS_DAYS;
  }
  function isInstalled(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  var SHARE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

  function showInstallBanner(tentativa){
    if(document.getElementById('pwa-install-banner')) return;
    if(wasDismissedRecently() || isInstalled()) return;
    // Não aparece por cima do aviso de cookies: espera que a pessoa decida.
    if(document.querySelector('.fk-cookie-bar')){
      if((tentativa || 0) < 30) setTimeout(function(){ showInstallBanner((tentativa || 0) + 1); }, 2000);
      return;
    }
    var el = document.createElement('div');
    el.id = 'pwa-install-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Instalar a app Flinko');
    el.setAttribute('style', 'position:fixed;left:14px;right:14px;bottom:88px;z-index:9998;background:#132420;color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;font-family:Inter,system-ui,sans-serif;max-width:420px;margin:0 auto');
    var texto = deferredPrompt
      ? 'Acesso num toque e avisos de mensagens, sem abrir o browser.'
      : 'Toca em ' + SHARE_ICON + ' e depois em “Adicionar ao ecrã principal”.';
    el.innerHTML =
      '<img src="/icon-192.png" alt="" width="38" height="38" style="border-radius:10px;flex-shrink:0">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:700">Instala a app Flinko</div>'+
        '<div style="font-size:11.5px;color:rgba(255,255,255,.72);line-height:1.4">' + texto + '</div>'+
      '</div>'+
      (deferredPrompt ? '<button id="pwa-install-btn" style="background:#BB5C08;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Instalar</button>' : '')+
      '<button id="pwa-install-close" aria-label="Fechar" style="background:transparent;border:none;color:rgba(255,255,255,.6);font-size:20px;cursor:pointer;padding:0 2px;line-height:1">&times;</button>';
    document.body.appendChild(el);

    var btn = document.getElementById('pwa-install-btn');
    if(btn) btn.addEventListener('click', function(){ el.remove(); window.flinkoInstallApp(); });
    document.getElementById('pwa-install-close').addEventListener('click', function(){
      store(function(){ localStorage.setItem(DISMISS_KEY, String(Date.now())); });
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
    closeGuide();
    deferredPrompt = null;
    if(window.flinkoTrack) window.flinkoTrack('app_instalada', {});
    document.dispatchEvent(new CustomEvent('flinko:installed'));
  });

  // No iPhone (Safari) o aviso com os passos aparece a partir da segunda
  // visita, uma vez de cada vez, e só no telemóvel.
  if(isIOSSafari && !isInstalled()){
    var visits = Number(store(function(){ return localStorage.getItem('flinko_visits'); }) || 0) + 1;
    store(function(){ localStorage.setItem('flinko_visits', String(visits)); });
    if(visits >= 2) window.addEventListener('load', function(){ setTimeout(showInstallBanner, 4000); });
  }

  // ---- Guia de instalação (quando o browser não deixa instalar com um botão) ----
  function closeGuide(){
    var g = document.getElementById('fk-install-guide');
    if(g) g.remove();
  }
  function passos(){
    if(isIOS && !isIOSSafari) return ['Abre <b>flinko.pt</b> no <b>Safari</b> (no iPhone só o Safari instala apps de sites).', 'Toca em ' + SHARE_ICON + ' <b>Partilhar</b>.', 'Escolhe <b>“Adicionar ao ecrã principal”</b> e confirma.'];
    if(isIOS) return ['Toca em ' + SHARE_ICON + ' <b>Partilhar</b>, na barra do Safari.', 'Desce e escolhe <b>“Adicionar ao ecrã principal”</b>.', 'Toca em <b>Adicionar</b>. A Flinko fica junto das outras apps.'];
    if(isAndroid) return ['Toca no menu <b>⋮</b> do browser (canto superior direito).', 'Escolhe <b>“Instalar app”</b> ou <b>“Adicionar ao ecrã principal”</b>.', 'Confirma. A Flinko fica junto das outras apps.'];
    return ['No Chrome ou no Edge, clica no ícone de <b>instalar</b> na barra de endereço (à direita).', 'Ou abre o menu do browser e escolhe <b>“Instalar Flinko”</b>.', 'No telemóvel é ainda mais simples: abre <b>flinko.pt</b> e segue os passos que aparecem.'];
  }
  function showGuide(){
    closeGuide();
    var wrap = document.createElement('div');
    wrap.id = 'fk-install-guide';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'fk-install-title');
    wrap.setAttribute('style', 'position:fixed;inset:0;z-index:10000;background:rgba(19,36,32,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif');
    wrap.innerHTML =
      '<div style="background:#fff;color:#132420;border-radius:18px;max-width:420px;width:100%;padding:22px 22px 18px;box-shadow:0 20px 50px rgba(0,0,0,.3)">'+
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'+
          '<img src="/icon-192.png" alt="" width="44" height="44" style="border-radius:12px">'+
          '<div><div id="fk-install-title" style="font-weight:800;font-size:17px">Instalar a app Flinko</div>'+
          '<div style="font-size:13px;color:#4E5C57">Grátis, sem loja de apps, ocupa quase nada.</div></div>'+
        '</div>'+
        '<ol style="margin:0 0 16px;padding-left:20px;font-size:14.5px;line-height:1.6">' + passos().map(function(p){ return '<li style="margin-bottom:6px">' + p + '</li>'; }).join('') + '</ol>'+
        '<button type="button" id="fk-install-ok" style="width:100%;background:#132420;color:#fff;border:none;border-radius:999px;padding:12px;font-weight:700;font-size:14px;cursor:pointer">Percebi</button>'+
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function(e){ if(e.target === wrap) closeGuide(); });
    document.getElementById('fk-install-ok').addEventListener('click', closeGuide);
    document.addEventListener('keydown', function esc(e){ if(e.key === 'Escape'){ closeGuide(); document.removeEventListener('keydown', esc); } });
    document.getElementById('fk-install-ok').focus();
  }

  // ---- API para botões próprios (homepage, menu, dashboard) ----
  // Instala logo se o browser deixar; senão mostra os passos certos para o aparelho.
  window.flinkoInstallApp = function(){
    if(window.flinkoTrack) window.flinkoTrack('app_instalar_clique', { modo: deferredPrompt ? 'botao' : 'guia' });
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function(){ deferredPrompt = null; });
      return;
    }
    showGuide();
  };
  window.flinkoCanInstall = function(){ return !!deferredPrompt; };
  window.flinkoIsInstalled = isInstalled;
  window.flinkoIsMobile = function(){ return isMobile; };
})();
