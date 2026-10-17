// QRCode falso para os testes (a biblioteca verdadeira vem do cdnjs, que os
// testes bloqueiam). Desenha um canvas e guarda o texto para se verificar.
window.QRCode = function (el, opts) {
  const c = document.createElement('canvas');
  c.width = opts.width; c.height = opts.height;
  c.dataset.text = opts.text;
  el.appendChild(c);
};
window.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
