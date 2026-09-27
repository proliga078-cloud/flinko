// ===== FINANÇAS =====
function quarterOf(d){return Math.floor(d.getMonth()/3)+1}
function eur(n){return '€'+Number(n||0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})}

function financePaidJobs(){
  return allJobs.filter(j=>j.status==='pago'&&(j.paid_amount!=null||j.quote_amount!=null))
    .map(j=>({...j,amount:Number(j.paid_amount??j.quote_amount??0),when:new Date(j.paid_at||j.completed_at||j.updated_at||j.created_at)}))
    .sort((a,b)=>b.when-a.when)
}

function marginPct(j){
  const rec=Number(j.paid_amount??j.quote_amount??0)
  const mat=Number(j.material_cost??0)
  if(!rec||rec<=0)return null
  if(j.material_cost==null)return null
  return ((rec-mat)/rec)*100
}
function marginClass(p){return p>=60?'bom':p>=35?'medio':'mau'}

function marginBadge(j){
  const p=marginPct(j)
  if(p===null)return ''
  const rec=Number(j.paid_amount??j.quote_amount??0)
  const lucro=rec-Number(j.material_cost??0)
  return `<div class="jc-mb ${marginClass(p)}">Margem ${p.toFixed(0)}% · ${eur(lucro)}</div>`
}

function renderMarginAnalysis(){
  const wrap=document.getElementById('mg-bars')
  const hint=document.getElementById('mg-hint')
  if(!wrap)return
  const dl=document.getElementById('job-types')
  if(dl)dl.innerHTML=[...new Set(allJobs.map(j=>j.job_type).filter(Boolean))].map(t=>`<option value="${escapeHtml(t)}"></option>`).join('')

  const comDados=allJobs.filter(j=>['concluido','pago'].includes(j.status)&&j.material_cost!=null&&Number(j.paid_amount??j.quote_amount??0)>0)
  if(!comDados.length){
    hint.style.display='block'
    hint.innerHTML='Preenche o campo <strong>Material (€)</strong> nos teus trabalhos para veres quanto sobra em cada um. Sem isso, só sabes o que entrou — não o que ganhaste.'
    wrap.innerHTML=''
    return
  }
  hint.style.display='none'

  const g={}
  comDados.forEach(j=>{
    const k=(j.job_type&&j.job_type.trim())||'Sem tipo'
    if(!g[k])g[k]={n:0,rec:0,mat:0}
    g[k].n++; g[k].rec+=Number(j.paid_amount??j.quote_amount??0); g[k].mat+=Number(j.material_cost??0)
  })
  const linhas=Object.entries(g).map(([tipo,v])=>{
    const lucro=v.rec-v.mat, pct=v.rec>0?lucro/v.rec*100:0
    return {tipo,...v,lucro,pct}
  }).sort((a,b)=>b.pct-a.pct)

  const cor=p=>p>=60?['#1A8649','#4ADE80','#146B3A']:p>=35?['#AF620A','#EFA53C','#8A4F08']:['#993C1D','#D8573A','#993C1D']
  wrap.innerHTML=linhas.map(r=>{
    const[c1,c2,ct]=cor(r.pct)
    return `<div class="mg-item">
      <div class="mg-top"><div class="mg-name">${escapeHtml(r.tipo)} <span>· ${r.n} trabalho${r.n!==1?'s':''}</span></div><div class="mg-val" style="color:${ct}">${r.pct.toFixed(0)}%</div></div>
      <div class="mg-track"><div class="mg-fill" style="width:${Math.max(2,Math.min(100,r.pct))}%;background:linear-gradient(90deg,${c1},${c2})"></div></div>
      <div class="mg-meta"><span>Faturado <strong>${eur(r.rec)}</strong></span><span>Material <strong>${eur(r.mat)}</strong></span><span>Sobrou <strong style="color:${ct}">${eur(r.lucro)}</strong></span></div>
    </div>`
  }).join('')

  if(linhas.length>=2){
    const m=linhas[0], pr=linhas[linhas.length-1]
    if(m.pct-pr.pct>=15){
      hint.style.display='block'
      hint.innerHTML=`As <strong>${escapeHtml(m.tipo)}</strong> deixam-te ${m.pct.toFixed(0)}% de margem; as <strong>${escapeHtml(pr.tipo)}</strong> só ${pr.pct.toFixed(0)}%. Vale a pena pensar se compensa aceitar as segundas ao preço atual.`
    }
  }
}

function renderFinance(){
  const rec=document.getElementById('fin-recebido')
  if(!rec)return
  const paid=financePaidJobs()
  const now=new Date(), curQ=quarterOf(now), curY=now.getFullYear()

  const doTri=paid.filter(j=>j.when.getFullYear()===curY&&quarterOf(j.when)===curQ)
  const recebido=doTri.reduce((s,j)=>s+j.amount,0)
  const pipeline=allJobs.filter(j=>['aceite','agendado','concluido'].includes(j.status)&&j.quote_amount!=null)
  const porReceber=pipeline.reduce((s,j)=>s+Number(j.quote_amount),0)

  document.getElementById('fin-period').textContent=`Trimestre T${curQ} · ${curY}`
  rec.textContent=eur(recebido)
  document.getElementById('fin-recebido-sub').textContent=doTri.length+' trabalho'+(doTri.length!==1?'s':'')+' pago'+(doTri.length!==1?'s':'')
  document.getElementById('fin-receber').textContent=eur(porReceber)
  document.getElementById('fin-receber-sub').textContent=pipeline.length+' trabalho'+(pipeline.length!==1?'s':'')+' em curso'

  const comMat=paid.filter(j=>j.material_cost!=null)
  const tr=comMat.reduce((s,j)=>s+j.amount,0), tm=comMat.reduce((s,j)=>s+Number(j.material_cost||0),0)
  document.getElementById('fin-margem').textContent=(comMat.length&&tr>0)?Math.round((tr-tm)/tr*100)+'%':'—'

  renderMarginAnalysis()

  // por trimestre
  const byQ={}
  paid.forEach(j=>{
    const k=`${j.when.getFullYear()}-T${quarterOf(j.when)}`
    if(!byQ[k])byQ[k]={label:`T${quarterOf(j.when)} ${j.when.getFullYear()}`,total:0,n:0,sort:j.when.getFullYear()*10+quarterOf(j.when)}
    byQ[k].total+=j.amount; byQ[k].n++
  })
  const qs=Object.values(byQ).sort((a,b)=>b.sort-a.sort)
  const qEl=document.getElementById('fin-quarters')
  qEl.innerHTML=qs.length?qs.map((r,i)=>`<div class="fin-row">
      <div><div class="fr-t" ${i>0?'style="color:var(--muted)"':''}>${r.label}</div><div class="fr-s">${r.n} trabalho${r.n!==1?'s':''}</div></div>
      <div class="fr-v" ${i>0?'style="color:var(--muted);font-weight:700"':''}>${eur(r.total)}</div>
    </div>`).join('')
    :'<div class="tc-empty"><div class="ico" style="background:var(--blue-light);color:var(--blue)"><svg class="ic" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg></div><p>Sem faturação registada.<br/><span>Marca um trabalho como pago.</span></p></div>'

  // trabalhos pagos
  const pEl=document.getElementById('fin-paid')
  pEl.innerHTML=paid.length?paid.slice(0,6).map(j=>`<div class="fin-row">
      <div class="fr-ico"><svg class="ic" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M20 6 9 17l-5-5"/></svg></div>
      <div style="flex:1;min-width:0"><div class="fr-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(j.title)}</div>
      <div class="fr-s">${escapeHtml(j.client_name||'Cliente')} · ${j.when.toLocaleDateString('pt-PT',{day:'numeric',month:'short'})}</div></div>
      <div class="fr-v">${eur(j.amount)}</div>
    </div>`).join('')
    :'<div class="tc-empty"><div class="ico" style="background:var(--green-light);color:var(--green)"><svg class="ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div><p>Sem trabalhos pagos ainda.</p></div>'
}

function exportFinanceCsv(){
  const paid=financePaidJobs()
  if(!paid.length){showAlert('job-error','Ainda não tens trabalhos pagos para exportar.','error');return}
  const esc=v=>{const s=String(v??'');return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  const header=['Data','Trabalho','Cliente','Valor (EUR)','Trimestre','Ano']
  const lines=paid.map(j=>[
    j.when.toLocaleDateString('pt-PT'),
    j.title,
    j.client_name||'',
    j.amount.toFixed(2).replace('.',','),
    'T'+quarterOf(j.when),
    j.when.getFullYear()
  ].map(esc).join(';'))
  const total=paid.reduce((s,j)=>s+j.amount,0)
  lines.push(['','','TOTAL',total.toFixed(2).replace('.',','),'',''].map(esc).join(';'))
  const csv='﻿'+[header.map(esc).join(';'),...lines].join('\r\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download='Flinko-trabalhos-pagos-'+new Date().toISOString().slice(0,10)+'.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ===== DESPESAS GERAIS =====
let allExpenses=[]

async function loadExpenses(){
  const{data}=await db.from('business_expenses').select('*').eq('professional_id',profileId).order('expense_date',{ascending:false})
  allExpenses=data||[]
  renderExpensesList()
  renderAnnualReport()
}

function renderExpensesList(){
  const el=document.getElementById('expenses-list')
  if(!el)return
  const now=new Date(), curQ=quarterOf(now), curY=now.getFullYear()
  const catLabel={combustivel:'Combustível',ferramentas:'Ferramentas',seguro:'Seguro',material_geral:'Material geral',outro:'Outro'}
  const doTri=allExpenses.filter(e=>{
    const d=new Date(e.expense_date)
    return d.getFullYear()===curY&&quarterOf(d)===curQ
  })
  el.innerHTML=allExpenses.length?allExpenses.slice(0,8).map(e=>`
    <div class="fin-row">
      <div style="flex:1;min-width:0"><div class="fr-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(e.description)}</div>
      <div class="fr-s">${catLabel[e.category]||e.category} · ${new Date(e.expense_date).toLocaleDateString('pt-PT',{day:'numeric',month:'short',year:'numeric'})}</div></div>
      <div class="fr-v" style="color:#DC5A5A">-${eur(e.amount)}</div>
      <button class="btn btn-ghost" style="border:1.5px solid var(--border);padding:4px 8px;font-size:11px;margin-left:8px" onclick="deleteExpense('${e.id}')">✕</button>
    </div>`).join('')
    :'<div class="tc-empty"><div class="ico" style="background:var(--bg);color:var(--muted)"><svg class="ic" viewBox="0 0 24 24"><path d="M3 3v18h18"/></svg></div><p>Sem despesas registadas.</p></div>'
  document.getElementById('exp-total').textContent=eur(doTri.reduce((s,e)=>s+Number(e.amount),0))
}

async function addExpense(){
  const desc=document.getElementById('exp-desc').value.trim()
  const amount=parseFloat(document.getElementById('exp-amount').value)
  const date=document.getElementById('exp-date').value||new Date().toISOString().slice(0,10)
  if(!desc){showAlert('exp-error','Indica uma descrição.','error');return}
  if(!amount||amount<=0){showAlert('exp-error','Indica um valor válido.','error');return}
  const{error}=await db.from('business_expenses').insert({
    professional_id:profileId,
    description:desc,
    amount,
    category:document.getElementById('exp-category').value,
    expense_date:date
  })
  if(error){showAlert('exp-error','Erro: '+error.message,'error');return}
  document.getElementById('exp-desc').value=''
  document.getElementById('exp-amount').value=''
  document.getElementById('exp-date').value=''
  loadExpenses()
}

async function deleteExpense(id){
  if(!confirm('Remover esta despesa?'))return
  const{error}=await db.from('business_expenses').delete().eq('id',id)
  if(error){alert('Não foi possível remover: '+error.message);return}
  loadExpenses()
}

// ===== RELATÓRIO ANUAL =====
function populateReportYears(){
  const sel=document.getElementById('report-year')
  if(!sel||sel.options.length)return
  const years=new Set([new Date().getFullYear()])
  allJobs.forEach(j=>{ if(j.status==='pago'){ const d=new Date(j.paid_at||j.completed_at||j.updated_at||j.created_at); years.add(d.getFullYear()) } })
  allExpenses.forEach(e=>years.add(new Date(e.expense_date).getFullYear()))
  const sorted=[...years].sort((a,b)=>b-a)
  sel.innerHTML=sorted.map(y=>`<option value="${y}">${y}</option>`).join('')
}

function renderAnnualReport(){
  const sel=document.getElementById('report-year')
  const revEl=document.getElementById('report-revenue')
  if(!sel||!revEl)return
  if(!sel.options.length)populateReportYears()
  const year=parseInt(sel.value||new Date().getFullYear(),10)
  const paid=financePaidJobs().filter(j=>j.when.getFullYear()===year)
  const revenue=paid.reduce((s,j)=>s+j.amount,0)
  const matCost=paid.reduce((s,j)=>s+Number(j.material_cost||0),0)
  const yearExpenses=allExpenses.filter(e=>new Date(e.expense_date).getFullYear()===year)
  const expTotal=yearExpenses.reduce((s,e)=>s+Number(e.amount),0)
  const totalExpenses=matCost+expTotal
  const profit=revenue-totalExpenses
  revEl.textContent=eur(revenue)
  document.getElementById('report-expenses').textContent=eur(totalExpenses)
  const profitEl=document.getElementById('report-profit')
  profitEl.textContent=eur(profit)
  profitEl.style.color=profit>=0?'var(--green)':'#DC5A5A'
}

function exportAnnualCsv(){
  const sel=document.getElementById('report-year')
  const year=parseInt(sel?.value||new Date().getFullYear(),10)
  const paid=financePaidJobs().filter(j=>j.when.getFullYear()===year)
  const yearExpenses=allExpenses.filter(e=>new Date(e.expense_date).getFullYear()===year)
  if(!paid.length&&!yearExpenses.length){showAlert('exp-error','Sem dados para exportar em '+year+'.','error');return}
  const esc=v=>{const s=String(v??'');return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  const lines=[['Tipo','Data','Descrição','Valor (EUR)'].map(esc).join(';')]
  paid.forEach(j=>lines.push(['Receita',j.when.toLocaleDateString('pt-PT'),j.title,j.amount.toFixed(2).replace('.',',')].map(esc).join(';')))
  yearExpenses.forEach(e=>lines.push(['Despesa',new Date(e.expense_date).toLocaleDateString('pt-PT'),e.description,('-'+Number(e.amount).toFixed(2)).replace('.',',')].map(esc).join(';')))
  const revenue=paid.reduce((s,j)=>s+j.amount,0)
  const expTotal=yearExpenses.reduce((s,e)=>s+Number(e.amount),0)+paid.reduce((s,j)=>s+Number(j.material_cost||0),0)
  lines.push(['','','Lucro líquido '+year,(revenue-expTotal).toFixed(2).replace('.',',')].map(esc).join(';'))
  const csv='\ufeff'+lines.join('\r\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download='Flinko-relatorio-anual-'+year+'.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ===== ORÇAMENTOS (PDF) =====
function openQuoteModal(jobId){
  quoteJobId=jobId||null
  document.getElementById('q-client').value=''
  document.getElementById('q-valid').value=30
  document.getElementById('q-notes').value=''
  document.getElementById('q-items').innerHTML=''
  document.getElementById('quote-error').style.display='none'
  if(jobId){
    const j=allJobs.find(x=>x.id===jobId)
    if(j){
      document.getElementById('q-client').value=j.client_name||''
      addQuoteItemRow(j.title,1,j.quote_amount||'')
    }else addQuoteItemRow()
  }else addQuoteItemRow()
  updateQuoteTotal()
  document.getElementById('quote-modal-overlay').classList.add('open')
}
function closeQuoteModal(){document.getElementById('quote-modal-overlay').classList.remove('open')}

function addQuoteItemRow(desc='',qty=1,price=''){
  const row=document.createElement('div')
  row.className='q-item-row'
  row.innerHTML=`<input type="text" class="q-item-desc" placeholder="Descrição" value="${escapeHtml(desc)}" oninput="updateQuoteTotal()"/><input type="number" class="q-item-qty" min="1" value="${qty}" oninput="updateQuoteTotal()"/><input type="number" class="q-item-price" min="0" step="0.01" placeholder="€" value="${price}" oninput="updateQuoteTotal()"/><button class="q-item-remove" type="button" onclick="this.parentElement.remove();updateQuoteTotal()">✕</button>`
  document.getElementById('q-items').appendChild(row)
}

function collectQuoteItems(){
  return[...document.querySelectorAll('#q-items .q-item-row')].map(row=>({
    desc:row.querySelector('.q-item-desc').value.trim(),
    qty:parseFloat(row.querySelector('.q-item-qty').value)||1,
    price:parseFloat(row.querySelector('.q-item-price').value)||0
  })).filter(it=>it.desc)
}

function updateQuoteTotal(){
  const items=collectQuoteItems()
  const total=items.reduce((s,it)=>s+it.qty*it.price,0)
  document.getElementById('q-total').textContent='€'+total.toFixed(2).replace('.',',')
}

function buildQuotePdf({client,items,subtotal,validDays,notes}){
  const{jsPDF}=window.jspdf
  const doc=new jsPDF()
  const pro=profileData||{}
  const dateStr=new Date().toLocaleDateString('pt-PT')
  const validUntil=new Date(Date.now()+(validDays||30)*86400000).toLocaleDateString('pt-PT')
  const quoteNum='ORC-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,6).toUpperCase()

  doc.setFillColor(232,114,10)
  doc.rect(0,0,210,32,'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(18)
  doc.setFont(undefined,'bold')
  doc.text(pro.name||'Profissional',14,16)
  doc.setFontSize(10)
  doc.setFont(undefined,'normal')
  doc.text([pro.category||'',pro.location||''].filter(Boolean).join(' · '),14,23)
  doc.setFontSize(9)
  doc.text('Gerado via Flinko',196,16,{align:'right'})

  doc.setTextColor(20,24,31)
  doc.setFontSize(20)
  doc.setFont(undefined,'bold')
  doc.text('ORÇAMENTO',14,46)
  doc.setFontSize(9)
  doc.setFont(undefined,'normal')
  doc.setTextColor(91,98,112)
  doc.text('Nº '+quoteNum,14,52)

  doc.setFontSize(10)
  doc.setTextColor(20,24,31)
  doc.text('Para: '+client,120,46)
  doc.setTextColor(91,98,112)
  doc.setFontSize(9)
  doc.text('Data: '+dateStr,120,52)
  doc.text('Válido até: '+validUntil,120,57)

  const contactLine=[pro.email,pro.phone,pro.website].filter(Boolean).join('   ·   ')
  if(contactLine){doc.setFontSize(8.5);doc.text(contactLine,14,62)}

  let y=74
  doc.setFillColor(247,248,250)
  doc.rect(14,y-6,182,9,'F')
  doc.setFontSize(9)
  doc.setFont(undefined,'bold')
  doc.setTextColor(20,24,31)
  doc.text('Descrição',18,y)
  doc.text('Qtd',140,y)
  doc.text('Preço Unit.',156,y)
  doc.text('Total',192,y,{align:'right'})
  y+=10
  doc.setFont(undefined,'normal')
  items.forEach(it=>{
    doc.text(String(it.desc).slice(0,58),18,y)
    doc.text(String(it.qty),140,y)
    doc.text('€'+Number(it.price).toFixed(2),156,y)
    doc.text('€'+(it.qty*it.price).toFixed(2),192,y,{align:'right'})
    y+=8
    if(y>260){doc.addPage();y=20}
  })
  y+=4
  doc.setDrawColor(236,236,233)
  doc.line(14,y,196,y)
  y+=10
  doc.setFont(undefined,'bold')
  doc.setFontSize(12)
  doc.text('Total: €'+Number(subtotal).toFixed(2),192,y,{align:'right'})
  y+=14
  if(notes){
    doc.setFont(undefined,'bold')
    doc.setFontSize(9)
    doc.setTextColor(20,24,31)
    doc.text('Notas',14,y)
    y+=6
    doc.setFont(undefined,'normal')
    doc.setTextColor(91,98,112)
    const noteLines=doc.splitTextToSize(notes,182)
    doc.text(noteLines,14,y)
  }
  doc.setFontSize(8)
  doc.setTextColor(150,150,150)
  if(!planLimits.own_branding)doc.text('Orçamento gerado através da Flinko · flinko.pt',14,287)
  return doc
}

async function generateQuotePdf(){
  if(planLimits.quotes_per_month!=null){
    const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0)
    const{count}=await db.from('quotes').select('*',{count:'exact',head:true}).eq('professional_id',profileId).gte('created_at',m0.toISOString())
    if((count||0)>=planLimits.quotes_per_month){
      showAlert('quote-error','Atingiste os '+planLimits.quotes_per_month+' orçamentos deste mês do plano grátis. O plano Pro tem orçamentos ilimitados e com a tua marca.','error')
      return
    }
  }
  const client=document.getElementById('q-client').value.trim()
  const validDays=parseInt(document.getElementById('q-valid').value)||30
  const notes=document.getElementById('q-notes').value.trim()
  const items=collectQuoteItems()
  if(!client){showAlert('quote-error','Indica o nome do cliente.','error');return}
  if(!items.length){showAlert('quote-error','Adiciona pelo menos um item ao orçamento.','error');return}
  const subtotal=items.reduce((s,it)=>s+it.qty*it.price,0)
  const{error}=await db.from('quotes').insert({professional_id:profileId,job_id:quoteJobId,client_name:client,items,subtotal,valid_days:validDays,notes:notes||null})
  if(error){
    console.error('quote save error:',error)
    // O limite de orçamentos/mês também é aplicado no servidor (trigger
    // enforce_quote_limit), não só aqui no JS — se a verificação acima
    // ficar desatualizada por qualquer razão, o insert falha aqui em vez
    // de deixar passar. Mostramos sempre o erro em vez de gerar o PDF como
    // se tivesse sido guardado.
    const msg=(error.message&&error.message.includes('Limite de'))
      ?error.message+'. O plano Pro tem orçamentos ilimitados e com a tua marca.'
      :'Não foi possível guardar o orçamento: '+(error.message||'erro desconhecido')
    showAlert('quote-error',msg,'error')
    return
  }
  try{await loadLib('jspdf')}catch(e){showAlert('quote-error','O orçamento foi guardado, mas não foi possível gerar o PDF agora. Descarrega-o de novo na lista.','error');return}
  const doc=buildQuotePdf({client,items,subtotal,validDays,notes})
  doc.save('Orcamento-'+client.replace(/[^a-zA-Z0-9]+/g,'-')+'.pdf')
  closeQuoteModal()
  showAlert('job-success','Orçamento gerado e descarregado!')
  loadQuotes()
}

async function loadQuotes(){
  if(!profileId)return
  const el=document.getElementById('quotes-list')
  if(!el)return
  const{data}=await db.from('quotes').select('*').eq('professional_id',profileId).order('created_at',{ascending:false}).limit(20)
  quotesCache=data||[]
  if(!quotesCache.length){el.innerHTML='<div class="empty">Ainda não geraste nenhum orçamento.</div>';return}
  el.innerHTML=quotesCache.map((q,i)=>{
    const date=new Date(q.created_at).toLocaleDateString('pt-PT')
    const nItems=Array.isArray(q.items)?q.items.length:0
    return`<div class="quote-row">
      <div><div class="qr-client">${escapeHtml(q.client_name)}</div><div class="qr-meta">${date} · €${Number(q.subtotal).toFixed(2)} · ${nItems} item${nItems!==1?'s':''}</div></div>
      <button class="btn btn-outline btn-sm" onclick="redownloadQuote(${i})">Descarregar</button>
    </div>`
  }).join('')
}

async function redownloadQuote(i){
  const q=quotesCache[i]
  if(!q)return
  try{await loadLib('jspdf')}catch(e){alert('Não foi possível gerar o PDF agora. Verifica a ligação e tenta outra vez.');return}
  const doc=buildQuotePdf({client:q.client_name,items:q.items,subtotal:q.subtotal,validDays:q.valid_days,notes:q.notes})
  doc.save('Orcamento-'+q.client_name.replace(/[^a-zA-Z0-9]+/g,'-')+'.pdf')
}

// ===== INTELIGÊNCIA DE PREÇOS DE MERCADO =====
async function loadMarketPricing(){
  const box=document.getElementById('price-hint')
  if(!profileData?.category)return
  const{data,error}=await db.from('services').select('price_from,price_to,profiles!inner(category)').eq('profiles.category',profileData.category)
  if(error||!data)return
  const froms=data.map(s=>s.price_from).filter(v=>v!=null)
  const tos=data.map(s=>s.price_to!=null?s.price_to:s.price_from).filter(v=>v!=null)
  if(froms.length<3){if(box)box.classList.remove('show');marketPriceCache=null;return}
  const lo=froms.reduce((a,b)=>a+Number(b),0)/froms.length
  const hi=Math.max(tos.reduce((a,b)=>a+Number(b),0)/tos.length,lo)
  marketPriceCache={category:profileData.category,lo,hi}
  if(box){
    box.classList.add('show')
    box.innerHTML=`<svg class="ic" viewBox="0 0 24 24" style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M15.5 9.5a2.5 2.5 0 0 0-2.5-2H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2.5 2.5 0 0 1-2.5-2"/></svg><span>Profissionais de <strong>${escapeHtml(profileData.category)}</strong> na Flinko cobram, em média, entre <strong>€${lo.toFixed(0)}</strong> e <strong>€${hi.toFixed(0)}</strong>. Usa isto como referência ao definires os teus preços.</span>`
  }
  if(typeof renderInsights==='function')renderInsights()
}

// ===== PAINEL DE MERCADO (plano Pro) =====
async function runQuickCalc(){
  if(profileData?.account_type==='client')return
  if(!profileData?.category)return
  const btn=document.getElementById('quick-calc-btn')
  btn.disabled=true;btn.textContent='A calcular...'
  const{data,error}=await db.rpc('get_market_insights',{p_category:profileData.category})
  btn.disabled=false;btn.textContent='Ver faixa de preço da minha categoria'
  const box=document.getElementById('quick-calc-result')
  box.style.display='block'
  if(error||!data||!data.price_low){
    document.getElementById('qc-range').textContent='Ainda sem dados suficientes'
    document.getElementById('qc-sub').textContent='para '+profileData.category+' na tua zona'
    return
  }
  document.getElementById('qc-range').textContent=`€${Number(data.price_low).toFixed(0)} – €${Number(data.price_high).toFixed(0)}`
  document.getElementById('qc-sub').textContent=`média €${Number(data.price_avg).toFixed(0)} · baseado em ${data.offers_sample} propostas recentes em ${profileData.category}`
}

async function loadMarketInsights(){
  if(!profileData?.category)return
  document.getElementById('mkt-cat-label').textContent=profileData.category+(profileData.location?' · '+profileData.location:'')
  const{data,error}=await db.rpc('get_market_insights',{p_category:profileData.category})
  if(error||!data){
    document.getElementById('mkt-requests').textContent='—'
    return
  }
  const d=data

  document.getElementById('mkt-requests').textContent=d.requests_30d??0
  if(d.requests_prev_30d>0){
    const delta=Math.round(((d.requests_30d-d.requests_prev_30d)/d.requests_prev_30d)*100)
    document.getElementById('mkt-requests-sub').textContent=delta>=0?`+${delta}% vs. mês anterior`:`${delta}% vs. mês anterior`
  }else{
    document.getElementById('mkt-requests-sub').textContent='publicados na tua categoria'
  }

  if(d.offers_sample>=3&&d.price_low!=null){
    document.getElementById('mkt-price').textContent=`€${Number(d.price_low).toFixed(0)}–€${Number(d.price_high).toFixed(0)}`
    document.getElementById('mkt-price-sub').textContent=`média €${Number(d.price_avg).toFixed(0)} · ${d.offers_sample} propostas`
  }else{
    document.getElementById('mkt-price').textContent='—'
    document.getElementById('mkt-price-sub').textContent='ainda sem dados suficientes'
  }

  document.getElementById('mkt-peak').textContent=d.peak_dow||'—'

  const actEl=document.getElementById('mkt-activity')
  actEl.innerHTML=`<div class="fin-row"><div><div class="fr-t">Propostas enviadas</div><div class="fr-s">nos últimos 30 dias</div></div><div class="fr-v">${d.my_offers_30d??0}</div></div>`

  const respEl=document.getElementById('mkt-response')
  const myR=d.my_response_minutes, catR=d.category_response_minutes
  if(myR!=null){
    let cmp=''
    if(catR!=null){
      cmp=myR<=catR?`<span style="color:var(--green);font-weight:700">mais rápido</span> que a média`:`<span style="color:var(--amber);font-weight:700">mais lento</span> que a média`
    }
    respEl.innerHTML=`<div class="fin-row"><div><div class="fr-t">Tu: ${fmtResponseMins(myR)}</div><div class="fr-s">${catR!=null?`Categoria: ${fmtResponseMins(catR)} · ${cmp}`:'sem média de categoria ainda'}</div></div></div>`
  }else{
    respEl.innerHTML='<div class="tc-empty"><p>Ainda não temos dados de resposta suficientes.</p></div>'
  }

  const tipsEl=document.getElementById('mkt-tips')
  const tips=[]
  if(d.offers_sample>=3)tips.push(`Usa a faixa de preço acima como referência ao responderes a pedidos parecidos — já aparece sugerida no ecrã de Pedidos.`)
  if(d.peak_dow)tips.push(`Garante que a tua disponibilidade está atualizada perto de ${d.peak_dow.toLowerCase()}, o dia com mais pedidos na tua categoria.`)
  if(myR!=null&&catR!=null&&myR>catR)tips.push(`Responder mais depressa do que a média da categoria aumenta as tuas hipóteses de fechar o trabalho antes da concorrência.`)
  if(!tips.length)tips.push('Ainda estamos a juntar dados suficientes na tua categoria. Volta a verificar dentro de umas semanas.')
  tipsEl.innerHTML=tips.map(t=>`<p style="margin-bottom:8px">• ${t}</p>`).join('')
}

