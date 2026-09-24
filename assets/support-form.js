// Pedidos de apoio e denúncias que chegam diretamente ao painel de gestão
// (tabela support_tickets; ver admin.html › Apoio a clientes e › Moderação).
//
// Usado em contacto.html (formulário de contacto) e profile.html (botão
// "Denunciar perfil"). Fala com a API do Supabase diretamente, sem o SDK, com
// a chave pública: a política da tabela só deixa criar pedidos novos, nunca
// ler nem alterar os de outras pessoas.
(function () {
  var SUPABASE_URL = 'https://cdwinidhtfxfxowflize.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_G1U9iSJLR2JkhD9gvfyY3Q_qaqnMaUk';

  function send(t) {
    return fetch(SUPABASE_URL + '/rest/v1/support_tickets', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        kind: t.kind === 'denuncia' ? 'denuncia' : 'contacto',
        name: String(t.name || '').trim().slice(0, 120),
        email: String(t.email || '').trim().slice(0, 200),
        subject: String(t.subject || '').trim().slice(0, 200),
        message: String(t.message || '').trim().slice(0, 5000),
        target_profile_id: t.target_profile_id || null,
        page: String(location.pathname + location.search).slice(0, 300)
      })
    }).then(function (r) {
      if (r.ok) return true;
      return r.json().catch(function () { return {}; }).then(function (j) {
        var m = j && j.message || '';
        if (/Demasiados pedidos/i.test(m)) throw new Error('Enviaste vários pedidos seguidos. Tenta de novo daqui a uma hora.');
        if (/check constraint|violates/i.test(m)) throw new Error('Confirma o email e escreve uma mensagem com pelo menos 5 caracteres.');
        throw new Error('Não foi possível enviar. Tenta de novo ou escreve para flinkogeral@gmail.com.');
      });
    });
  }

  // Liga um <form> com campos name/email/subject/message (+ honeypot "website").
  function bindForm(form, opts) {
    opts = opts || {};
    var status = form.querySelector('[data-status]');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      if (f.website && f.website.value) { done(); return; } // robô: finge sucesso
      if (btn) btn.disabled = true;
      if (status) { status.textContent = 'A enviar…'; status.className = 'sf-status'; }
      send({ kind: opts.kind, name: f.name.value, email: f.email.value, subject: f.subject ? f.subject.value : opts.subject, message: f.message.value, target_profile_id: opts.targetProfileId })
        .then(done)
        .catch(function (err) {
          if (btn) btn.disabled = false;
          if (status) { status.textContent = err.message; status.className = 'sf-status sf-err'; }
        });
    });
    function done() {
      form.reset();
      if (btn) btn.disabled = false;
      if (status) { status.textContent = opts.okText || 'Recebemos a tua mensagem. Respondemos por email, normalmente em 1 a 2 dias úteis.'; status.className = 'sf-status sf-ok'; }
      if (opts.onDone) opts.onDone();
    }
  }

  var CSS = '.sf-ov{position:fixed;inset:0;background:rgba(10,12,25,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.sf-box{background:#fff;color:#14181F;border-radius:16px;padding:22px;max-width:440px;width:100%;max-height:92vh;overflow:auto;font-family:inherit}' +
    '.sf-box h3{margin:0 0 6px;font-size:18px}.sf-box p{margin:0 0 12px;font-size:13px;color:#5B6270;line-height:1.5}' +
    '.sf-box label{display:block;font-size:12px;font-weight:600;color:#5B6270;margin:10px 0 4px}' +
    '.sf-box input,.sf-box select,.sf-box textarea{width:100%;box-sizing:border-box;border:1px solid #ECECE9;border-radius:10px;padding:9px 11px;font:inherit}' +
    '.sf-row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}.sf-row button{border:0;border-radius:10px;padding:9px 15px;font-weight:600;cursor:pointer;font:inherit}' +
    '.sf-send{background:#E8720A;color:#fff}.sf-cancel{background:#F7F8FA;color:#14181F}.sf-hp{position:absolute;left:-9999px}' +
    '.sf-status{font-size:13px;margin-top:10px}.sf-ok{color:#166534}.sf-err{color:#b91c1c}';

  // Janela "Denunciar perfil" (profile.html).
  function openReport(profileId, profileName) {
    if (!document.getElementById('sf-css')) { var st = document.createElement('style'); st.id = 'sf-css'; st.textContent = CSS; document.head.appendChild(st); }
    var ov = document.createElement('div');
    ov.className = 'sf-ov';
    ov.innerHTML = '<form class="sf-box" novalidate><h3>Denunciar perfil</h3><p>Diz-nos o que se passa com este perfil. A equipa do Flinko analisa todas as denúncias e pode suspender a conta. A pessoa denunciada não vê quem denunciou.</p>' +
      '<label>Motivo</label><select name="subject"><option>Perfil falso ou enganador</option><option>Não fez o trabalho ou burla</option><option>Comportamento ofensivo ou assédio</option><option>Conteúdo impróprio</option><option>Outro</option></select>' +
      '<label>O que aconteceu?</label><textarea name="message" rows="5" required minlength="5" maxlength="5000"></textarea>' +
      '<label>O teu nome</label><input name="name" required maxlength="120" autocomplete="name">' +
      '<label>O teu email (para te respondermos)</label><input name="email" type="email" required maxlength="200" autocomplete="email">' +
      '<input class="sf-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="sf-status" data-status role="status"></div>' +
      '<div class="sf-row"><button type="button" class="sf-cancel">Fechar</button><button type="submit" class="sf-send">Enviar denúncia</button></div></form>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.sf-cancel').addEventListener('click', close);
    bindForm(ov.querySelector('form'), {
      kind: 'denuncia',
      targetProfileId: profileId,
      okText: 'Obrigado. Recebemos a denúncia e vamos analisá-la.',
      onDone: function () { var b = ov.querySelector('.sf-send'); if (b) b.style.display = 'none'; }
    });
    // mostra o nome do perfil no assunto, para o admin saber logo de quem se trata
    var sel = ov.querySelector('select[name="subject"]');
    if (profileName) Array.prototype.forEach.call(sel.options, function (o) { o.value = o.text + ' · ' + String(profileName).slice(0, 80); });
    ov.querySelector('textarea').focus();
  }

  window.flinkoSupport = { send: send, bindForm: bindForm, openReport: openReport };
})();
