// Escapa texto para inserção segura dentro de HTML (evita XSS quando se usa
// innerHTML/template strings com dados vindos do utilizador ou da BD).
//
// Esta MESMA função estava copiada, à mão, em 24 páginas diferentes.
// Duplicar assim um "helper" de segurança tem um risco real, não só
// teórico: em auditoria encontrou-se que uma das 24 cópias
// (porque-escolher.html) já tinha divergido silenciosamente para uma
// versão com bug — usava `(s||'')` em vez de `String(s==null?'':s)`, o
// que: (a) rebentava com TypeError ("s.replace is not a function") se
// alguma vez fosse chamada com um valor truthy que não fosse string (ex:
// um número), e (b) tratava valores falsy válidos como 0 como se fossem
// vazios. Com uma única cópia partilhada, as 24 páginas nunca mais podem
// divergir sozinhas, e qualquer correção futura (ex: reforçar o conjunto
// de caracteres escapados) só precisa de ser feita aqui.
//
// Script clássico (sem defer/async, sem type="module") de propósito: tem
// de estar carregado e executado ANTES do <script> inline de cada página
// que a chama, tal como o SDK do Supabase que é sempre carregado logo a
// seguir a este.
function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// Devolve o URL só se for http(s) (ou mailto/tel quando pedido); caso contrário
// devolve ''. Serve para hrefs/srcs vindos de dados de utilizador: escapeHtml()
// sozinho NÃO impede "javascript:..." dentro de um href.
function safeUrl(u,allowContact){
  var s=String(u==null?'':u).trim()
  if(/^https?:\/\//i.test(s))return s
  if(allowContact&&/^(mailto|tel):/i.test(s))return s
  return ''
}

// Escapa um valor para uso dentro de url('...') em CSS inline.
function cssUrl(u){
  var s=safeUrl(u)
  return s.replace(/[\'"()\s]/g,function(c){return '%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')})
}

// Limpa texto de pesquisa antes de o meter numa string de filtro .or(...) do
// PostgREST, onde vírgulas, parênteses e aspas separam/fecham condições. Sem
// isto, "Lisboa, Porto" parte a pesquisa e dá para injetar filtros.
function orSafe(s){
  return String(s==null?'':s).replace(/[,()\\"%*:]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)
}
