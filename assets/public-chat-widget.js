(function () {
  'use strict';

  if (window.__flinkoChatWidgetLoaded) return;
  window.__flinkoChatWidgetLoaded = true;

  var SUPABASE_URL = 'https://cdwinidhtfxfxowflize.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_G1U9iSJLR2JkhD9gvfyY3Q_qaqnMaUk';
  var ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkd2luaWRodGZ4Znhvd2ZsaXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTM4MzUsImV4cCI6MjA5NzEyOTgzNX0.GVaz_WZYP3Rtr7grTrTAkE-3QX5t5d-l-dMMlgcaEwo'; // chave anon publica (formato JWT) - exigida pela verificacao de JWT do gateway Supabase para esta funcao publica
  var FN_URL = SUPABASE_URL + '/functions/v1/public-assistant';

  var history = [];
  var sending = false;

  function injectStyle() {
    if (document.getElementById('fk-chat-style')) return;
    var css = ''
      + '#fk-chat-root{position:fixed;right:20px;bottom:20px;z-index:999990;font-family:Inter,system-ui,-apple-system,sans-serif}'
      + '#fk-chat-toggle{width:58px;height:58px;border-radius:50%;border:none;background:#BB5C08;color:#fff;box-shadow:0 8px 24px rgba(187,92,8,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s ease,box-shadow .18s ease}'
      + '#fk-chat-toggle:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(187,92,8,.45)}'
      + '#fk-chat-toggle svg{width:26px;height:26px}'
      + '#fk-chat-toggle .fk-chat-badge{position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#0F8B5F;border:2px solid #fff}'
      + '#fk-chat-panel{position:fixed;right:20px;bottom:90px;width:360px;max-width:calc(100vw - 32px);height:min(520px,70vh);background:#FFFFFF;border-radius:16px;box-shadow:0 20px 48px rgba(19,36,32,.22);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease}'
      + '#fk-chat-panel.fk-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}'
      + '.fk-chat-header{background:#132420;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}'
      + '.fk-chat-header-title{display:flex;flex-direction:column;gap:1px}'
      + '.fk-chat-header-title strong{font-size:14px;font-weight:700}'
      + '.fk-chat-header-title span{font-size:11px;color:#B7C4BF}'
      + '.fk-chat-close{background:none;border:none;color:#fff;opacity:.75;cursor:pointer;font-size:20px;line-height:1;padding:4px}'
      + '.fk-chat-close:hover{opacity:1}'
      + '.fk-chat-messages{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px;background:#F3FBF6}'
      + '.fk-msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}'
      + '.fk-msg-assistant{align-self:flex-start;background:#fff;color:#132420;border:1px solid #E1EEE6;border-bottom-left-radius:4px}'
      + '.fk-msg-user{align-self:flex-end;background:#BB5C08;color:#fff;border-bottom-right-radius:4px}'
      + '.fk-msg-error{align-self:flex-start;background:#FFF3E4;color:#B85608;border:1px solid #FFE7CE;border-bottom-left-radius:4px}'
      + '.fk-typing{align-self:flex-start;display:flex;gap:4px;padding:10px 14px;background:#fff;border:1px solid #E1EEE6;border-radius:14px;border-bottom-left-radius:4px}'
      + '.fk-typing span{width:6px;height:6px;border-radius:50%;background:#69756F;animation:fkBlink 1.2s infinite ease-in-out}'
      + '.fk-typing span:nth-child(2){animation-delay:.15s}'
      + '.fk-typing span:nth-child(3){animation-delay:.3s}'
      + '@keyframes fkBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}'
      + '.fk-chat-suggestions{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px;flex-shrink:0}'
      + '.fk-chat-suggestion{border:1px solid #E1EEE6;background:#fff;color:#132420;font-size:12px;padding:6px 10px;border-radius:99px;cursor:pointer}'
      + '.fk-chat-suggestion:hover{background:#F3FBF6;border-color:#BB5C08}'
      + '.fk-chat-form{display:flex;gap:8px;padding:10px;border-top:1px solid #E1EEE6;background:#fff;flex-shrink:0}'
      + '.fk-chat-form input{flex:1;border:1px solid #E1EEE6;border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;color:#132420;background:#F3FBF6}'
      + '.fk-chat-form input:focus{outline:2px solid #BB5C08;outline-offset:1px}'
      + '.fk-chat-form button{width:40px;height:40px;flex-shrink:0;border:none;border-radius:10px;background:#BB5C08;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}'
      + '.fk-chat-form button:disabled{opacity:.5;cursor:default}'
      + '.fk-chat-form button svg{width:18px;height:18px}'
      + '@media (max-width:480px){#fk-chat-panel{right:16px;left:16px;width:auto;bottom:86px}#fk-chat-root{right:16px;bottom:16px}}';
    var style = document.createElement('style');
    style.id = 'fk-chat-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  var svgChat = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var svgClose = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var svgSend = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>';

  var SUGGESTIONS = ['Como funciona a Flinko?', 'Preciso de um eletricista', 'Quanto custa contratar?'];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function build() {
    injectStyle();

    var root = document.createElement('div');
    root.id = 'fk-chat-root';
    root.innerHTML = ''
      + '<button id="fk-chat-toggle" aria-label="Abrir assistente Flinko" aria-expanded="false">' + svgChat + '</button>'
      + '<div id="fk-chat-panel" role="dialog" aria-label="Assistente Flinko">'
      + '  <div class="fk-chat-header">'
      + '    <div class="fk-chat-header-title"><strong>Assistente Flinko</strong><span>Normalmente responde em segundos</span></div>'
      + '    <button class="fk-chat-close" aria-label="Fechar chat">' + svgClose + '</button>'
      + '  </div>'
      + '  <div class="fk-chat-messages" id="fk-chat-messages"></div>'
      + '  <div class="fk-chat-suggestions" id="fk-chat-suggestions"></div>'
      + '  <form class="fk-chat-form" id="fk-chat-form">'
      + '    <input type="text" id="fk-chat-input" maxlength="500" placeholder="Escreve a tua pergunta..." autocomplete="off" aria-label="Mensagem"/>'
      + '    <button type="submit" aria-label="Enviar">' + svgSend + '</button>'
      + '  </form>'
      + '</div>';
    document.body.appendChild(root);

    var toggleBtn = document.getElementById('fk-chat-toggle');
    var panel = document.getElementById('fk-chat-panel');
    var closeBtn = panel.querySelector('.fk-chat-close');
    var messagesEl = document.getElementById('fk-chat-messages');
    var suggestionsEl = document.getElementById('fk-chat-suggestions');
    var form = document.getElementById('fk-chat-form');
    var input = document.getElementById('fk-chat-input');
    var opened = false;

    function addMessage(role, text) {
      var div = document.createElement('div');
      div.className = 'fk-msg ' + (role === 'user' ? 'fk-msg-user' : role === 'error' ? 'fk-msg-error' : 'fk-msg-assistant');
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showTyping() {
      var div = document.createElement('div');
      div.className = 'fk-typing';
      div.id = 'fk-chat-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      var el = document.getElementById('fk-chat-typing');
      if (el) el.remove();
    }

    function renderSuggestions() {
      suggestionsEl.innerHTML = '';
      SUGGESTIONS.forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fk-chat-suggestion';
        b.textContent = s;
        b.addEventListener('click', function () { sendQuestion(s); });
        suggestionsEl.appendChild(b);
      });
    }

    function open() {
      opened = true;
      panel.classList.add('fk-open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      if (!messagesEl.childElementCount) {
        addMessage('assistant', 'Olá! Sou o assistente da Flinko. Posso ajudar-te a encontrar o profissional certo ou a perceber como a plataforma funciona. Em que posso ajudar?');
        renderSuggestions();
      }
      setTimeout(function () { input.focus(); }, 150);
    }

    function close() {
      opened = false;
      panel.classList.remove('fk-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }

    toggleBtn.addEventListener('click', function () { opened ? close() : open(); });
    closeBtn.addEventListener('click', close);

    function sendQuestion(text) {
      if (sending || !text) return;
      sending = true;
      suggestionsEl.innerHTML = '';
      addMessage('user', text);
      history.push({ role: 'user', content: text });
      showTyping();
      input.value = '';
      input.disabled = true;

      fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + ANON_JWT
        },
        body: JSON.stringify({ question: text, history: history.slice(-10) })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          hideTyping();
          if (data && data.answer) {
            addMessage('assistant', data.answer);
            history.push({ role: 'assistant', content: data.answer });
          } else {
            addMessage('error', 'Não consegui responder agora. Tenta novamente daqui a pouco.');
          }
        })
        .catch(function () {
          hideTyping();
          addMessage('error', 'Não foi possível ligar ao assistente. Verifica a tua ligação e tenta de novo.');
        })
        .finally(function () {
          sending = false;
          input.disabled = false;
          input.focus();
        });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (text) sendQuestion(text);
    });
  }

  function init() {
    try { build(); } catch (e) { /* nunca deixar o widget partir a pagina */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
