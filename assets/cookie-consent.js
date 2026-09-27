/* Flinko — banner de consentimento de cookies (RGPD)
   - Enquanto nao houver decisao guardada, mostra o banner e NAO carrega
     nada de analytics (assets/tracking.js so corre depois de consentimento).
   - Guarda a decisao em localStorage: flinko_cookie_consent
     = {necessary:true, analytics:bool, ts:<epoch ms>}
     (migra automaticamente decisoes antigas guardadas sob o nome
     anterior, proliga_cookie_consent, para nao mostrar o banner outra
     vez a quem ja tinha decidido)
   - Rejeitar e tao facil como aceitar (sem dark patterns): duas acoes,
     mesmo tamanho e destaque visual equivalente.
   - Enquanto o banner esta visivel, reserva espaco no fundo da pagina
     (padding-bottom no body) para nao tapar botoes/links que por acaso
     fiquem na mesma zona do ecra — sem isto, um botao "Criar conta" ou
     "Enviar pedido" perto do fundo ficava por baixo do banner e nao dava
     para clicar nele enquanto a pessoa nao decidisse sobre os cookies. */
// Eventos do funil (pesquisar, contactar, publicar pedido...): as páginas
// chamam window.flinkoTrack(nome, dados). Ficam numa fila e só são enviados se
// houver consentimento de análise: assets/tracking.js esvazia a fila e passa a
// enviar diretamente. Sem consentimento, a fila nunca sai do browser.
if(!window.flinkoTrack){
  window.__fkq=window.__fkq||[];
  window.flinkoTrack=function(name,props){
    window.__fkq.push([name,props||{},location.pathname]);
    if(window.__fkq.length>50)window.__fkq.shift();
  };
}

(function(){
  'use strict';
  var STORAGE_KEY = 'flinko_cookie_consent';
  var LEGACY_STORAGE_KEY = 'proliga_cookie_consent';
  var bodyPadReserved = false;
  var origBodyPad = '';

  function getConsent(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw){
        // Migracao: quem ja tinha decidido antes desta chave mudar de
        // nome continua com a decisao guardada, sem ver o banner outra vez.
        var legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if(!legacy) return null;
        try{
          localStorage.setItem(STORAGE_KEY, legacy);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }catch(e){}
        raw = legacy;
      }
      var c = JSON.parse(raw);
      return (c && typeof c === 'object') ? c : null;
    }catch(e){ return null; }
  }

  function setConsent(analytics){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        necessary: true,
        analytics: !!analytics,
        ts: Date.now()
      }));
    }catch(e){}
  }

  function loadTracking(){
    if(document.querySelector('script[data-flinko-tracking]')) return;
    var s = document.createElement('script');
    s.src = '/assets/tracking.js';
    s.defer = true;
    s.setAttribute('data-flinko-tracking', '1');
    document.body.appendChild(s);
  }

  function injectStyles(){
    if(document.getElementById('flinko-cookie-style')) return;
    var css = ''
      + '.fk-cookie-bar{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;'
      + 'max-width:640px;margin:0 auto;background:#FFFFFF;color:#132420;'
      + 'border:1px solid #E1EEE6;border-radius:16px;'
      + 'box-shadow:0 6px 10px rgba(19,36,32,.06),0 18px 34px rgba(19,36,32,.16);'
      + 'padding:18px 20px;font-family:Inter,system-ui,-apple-system,sans-serif;'
      + 'display:flex;flex-direction:column;gap:14px;opacity:0;transform:translateY(12px);'
      + 'transition:opacity .25s ease,transform .25s ease}'
      + '.fk-cookie-bar.fk-show{opacity:1;transform:translateY(0)}'
      + '.fk-cookie-text{font-size:13.5px;line-height:1.55;color:#4E5C57;margin:0}'
      + '.fk-cookie-text a{color:#E8720A;font-weight:600;text-decoration:none}'
      + '.fk-cookie-text a:hover{text-decoration:underline}'
      + '.fk-cookie-actions{display:flex;gap:10px;flex-wrap:wrap}'
      + '.fk-cookie-btn{flex:1;min-width:140px;padding:10px 16px;border-radius:8px;'
      + 'font-size:13.5px;font-weight:700;font-family:inherit;cursor:pointer;'
      + 'border:1.5px solid transparent;transition:filter .15s ease,background .15s ease}'
      + '.fk-cookie-btn:hover{filter:brightness(0.96)}'
      + '.fk-cookie-accept{background:#E8720A;color:#fff}'
      + '.fk-cookie-reject{background:#fff;color:#132420;border-color:#E1EEE6}'
      + '@media(max-width:480px){.fk-cookie-bar{left:10px;right:10px;bottom:10px;padding:16px}}';
    var style = document.createElement('style');
    style.id = 'flinko-cookie-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Reserva espaco no fundo da pagina do tamanho do banner, para que
  // botoes/links que estejam perto do fundo do ecra nao fiquem tapados
  // e continuem clicaveis enquanto o banner esta visivel.
  function reserveSpace(bar){
    if(bodyPadReserved) return;
    origBodyPad = document.body.style.paddingBottom || '';
    bodyPadReserved = true;
    updateReservedSpace(bar);
  }
  function updateReservedSpace(bar){
    if(!bodyPadReserved || !bar || !bar.isConnected) return;
    var h = bar.offsetHeight;
    if(h > 0) document.body.style.paddingBottom = 'calc(' + (origBodyPad || '0px') + ' + ' + (h + 16) + 'px)';
  }
  function releaseSpace(){
    if(!bodyPadReserved) return;
    document.body.style.paddingBottom = origBodyPad;
    bodyPadReserved = false;
  }

  function showBanner(){
    injectStyles();
    var bar = document.createElement('div');
    bar.className = 'fk-cookie-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Consentimento de cookies');
    bar.innerHTML =
      '<p class="fk-cookie-text">Usamos cookies essenciais para o site funcionar e, só com a tua autorização, '
      + 'cookies de analytics para percebermos como é usado e melhorá-lo. '
      + 'Podes ler mais na <a href="/cookies.html">política de cookies</a>.</p>'
      + '<div class="fk-cookie-actions">'
      + '<button type="button" class="fk-cookie-btn fk-cookie-reject" data-fk-action="reject">Rejeitar não essenciais</button>'
      + '<button type="button" class="fk-cookie-btn fk-cookie-accept" data-fk-action="accept">Aceitar todos</button>'
      + '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function(){
      bar.classList.add('fk-show');
      reserveSpace(bar);
      // O texto pode dar wrap de forma diferente consoante a largura do
      // ecra (ex: rodar o telemovel) — reajusta o espaco reservado.
      window.addEventListener('resize', function onResize(){
        if(!bar.isConnected){ window.removeEventListener('resize', onResize); return; }
        updateReservedSpace(bar);
      });
    });

    bar.addEventListener('click', function(ev){
      var action = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-fk-action');
      if(!action) return;
      setConsent(action === 'accept');
      if(action === 'accept') loadTracking();
      bar.classList.remove('fk-show');
      releaseSpace();
      setTimeout(function(){ bar.remove(); }, 250);
    });
  }

  function init(){
    var consent = getConsent();
    // Na propria pagina de preferencias de cookies ja ha um painel completo
    // para escolher — mostrar tambem o banner flutuante seria redundante.
    var onPrefsPage = !!document.getElementById('pref-analytics');
    if(consent === null){
      if(!onPrefsPage) showBanner();
      return;
    }
    if(consent.analytics) loadTracking();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }

  // Exposto para a pagina de definicoes de cookies (cookies.html) poder
  // deixar o utilizador mudar de ideias mais tarde.
  window.flinkoCookieConsent = {
    get: getConsent,
    set: function(analytics){
      setConsent(analytics);
      if(analytics) loadTracking();
    }
  };
})();
