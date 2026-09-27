// Diz ao painel se os alertas no WhatsApp estão disponíveis (ver _whatsapp.js).
// Enquanto não estiverem, o painel nem mostra a opção.
const{enabled}=require('./_whatsapp')

exports.handler=async()=>({
  statusCode:200,
  headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'},
  body:JSON.stringify({enabled:enabled()&&!!process.env.TWILIO_TPL_PEDIDO})
})
