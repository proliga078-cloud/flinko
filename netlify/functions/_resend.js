// Envio de emails pela Resend, em lotes de 100, à prova de um endereço mau.
//
// A Resend recusa o lote inteiro quando um dos endereços não serve (aconteceu
// a 17/10: 14 convites falharam de uma vez). Quando um lote é recusado, este
// módulo volta a tentar um a um: só falha quem tem de falhar, com o motivo.
//
//   enviarEmails([{from,to,subject,html,...}, ...])
//     -> [{ ok: true } | { ok: false, motivo: 'texto' }, ...] na mesma ordem
const LOTE = 100;

async function motivoDe(res) {
  const t = await res.text().catch(() => '');
  let m = t;
  try { const j = JSON.parse(t); m = j.message || j.error || t; } catch (e) { }
  return ('Resend ' + res.status + (m ? ': ' + String(m).slice(0, 160) : '')).trim();
}

async function enviarEmails(emails) {
  const key = process.env.RESEND_API_KEY;
  const headers = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const out = new Array(emails.length);
  for (let i = 0; i < emails.length; i += LOTE) {
    const lote = emails.slice(i, i + LOTE);
    const res = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers, body: JSON.stringify(lote) });
    if (res.ok) { lote.forEach((_, k) => { out[i + k] = { ok: true }; }); continue; }
    console.error('Resend recusou o lote; a enviar um a um:', await motivoDe(res));
    for (let k = 0; k < lote.length; k++) {
      try {
        const r1 = await fetch('https://api.resend.com/emails', { method: 'POST', headers, body: JSON.stringify(lote[k]) });
        out[i + k] = r1.ok ? { ok: true } : { ok: false, motivo: await motivoDe(r1) };
      } catch (e) { out[i + k] = { ok: false, motivo: e.message }; }
    }
  }
  return out;
}

module.exports = { enviarEmails };
