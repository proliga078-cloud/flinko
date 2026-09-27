// "Click to WhatsApp": links oficiais wa.me com a mensagem pré-preenchida.
//
// Nada é enviado automaticamente: o link abre a app do WhatsApp (telemóvel)
// ou o WhatsApp Web (computador) com o texto já escrito, e é a pessoa que
// decide se envia. Sem APIs pagas nem não oficiais, sem custos.
//
// Usado no browser (window.flinkoWhatsApp) e nos testes (require).
;(function(root){
  'use strict'

  var SEM_NUMERO = 'Este profissional não tem um número de WhatsApp disponível.'

  // Número no formato que o wa.me pede: só dígitos, com indicativo, sem "+".
  //   912 345 678       → 351912345678
  //   +351 912 345 678  → 351912345678 (nunca 351351…)
  //   00351912345678    → 351912345678
  //   +33 6 12 34 56 78 → 33612345678
  // Devolve null para números inválidos e para fixos portugueses (sem WhatsApp).
  function numero(v){
    if(v == null) return null
    var t = String(v).trim().replace(/[\s().\-\/]/g, '')
    if(!t) return null
    var internacional = false
    if(t.charAt(0) === '+'){ t = t.slice(1); internacional = true }
    else if(t.slice(0, 2) === '00'){ t = t.slice(2); internacional = true }
    if(!/^\d+$/.test(t)) return null
    if(!internacional && /^9\d{8}$/.test(t)) return '351' + t
    if(t.slice(0, 3) === '351') return /^3519\d{8}$/.test(t) ? t : null
    if(!internacional) return null
    return /^[1-9]\d{7,14}$/.test(t) ? t : null
  }

  function link(telefone, texto){
    var n = numero(telefone)
    if(!n) return null
    return 'https://wa.me/' + n + (texto ? '?text=' + encodeURIComponent(texto) : '')
  }

  function limpa(s, max){
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s
  }

  // Mensagem de um pedido. Só leva o que está no pedido público (serviço, zona,
  // descrição e link): nunca contactos, emails ou nomes de clientes.
  function mensagemPedido(p){
    p = p || {}
    var linhas = [p.intro || 'Olá! Recebeste um novo pedido através da Flinko.', '']
    linhas.push('Serviço: ' + (limpa(p.servico, 140) || '—'))
    linhas.push('Localização: ' + (limpa(p.localizacao, 100) || '—'))
    var d = limpa(p.descricao, 300)
    if(d) linhas.push('Descrição: ' + d)
    if(p.url){ linhas.push('', 'Podes consultar todos os detalhes do pedido na Flinko:', String(p.url)) }
    linhas.push('', p.fecho || 'Obrigado,\nFlinko')
    return linhas.join('\n')
  }

  var api = { numero: numero, link: link, mensagemPedido: mensagemPedido, SEM_NUMERO: SEM_NUMERO }
  if(typeof module !== 'undefined' && module.exports) module.exports = api
  else root.flinkoWhatsApp = api
})(this)
