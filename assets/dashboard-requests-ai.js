// MEUS PEDIDOS
let pendingReqPhotos=[]

function renderReqPhotoStrip(){
  const strip=document.getElementById('req-photo-strip')
  if(!strip)return
  const thumbs=pendingReqPhotos.map((url,i)=>`<div class="photo-thumb"><img src="${url}"/><div class="rm" onclick="removeReqPhoto(${i})">✕</div></div>`).join('')
  const addBtn=pendingReqPhotos.length<4?'<div class="photo-add" onclick="document.getElementById(&quot;req-photo-file&quot;).click()">➕</div>':''
  strip.innerHTML=thumbs+addBtn
}
function removeReqPhoto(i){pendingReqPhotos.splice(i,1);renderReqPhotoStrip()}

async function handleReqPhotoSelect(input){
  const files=Array.from(input.files||[]).slice(0,4-pendingReqPhotos.length)
  input.value=''
  for(const file of files){
    if(file.size>5*1024*1024)continue
    try{
      const uploadFile=await resizeImageFile(file)
      const ext=uploadFile.name.split('.').pop()
      const path=`requests/${profileId}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`
      const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{contentType:uploadFile.type})
      if(error){console.error(error);continue}
      const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
      pendingReqPhotos.push(urlData.publicUrl)
    }catch(e){console.error(e)}
  }
  renderReqPhotoStrip()
}

async function loadMyRequests(){
  const{data}=await db.from('requests').select('*').eq('client_id',user.id).order('created_at',{ascending:false})
  const el=document.getElementById('myrequests-list')
  if(!data||!data.length){el.innerHTML='<div class="empty">Ainda não publicaste nenhum pedido.</div>';return}
  // Pedidos urgentes aparecem sempre primeiro (mesmo critério usado em pedidos.html).
  const sorted=[...data].sort((a,b)=>(b.is_urgent?1:0)-(a.is_urgent?1:0))
  const ids=sorted.map(r=>r.id)
  const{data:offers}=await db.from('request_offers').select('*,profiles:professional_id(name,photo_url)').in('request_id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
  const offersByReq={}
  ;(offers||[]).forEach(o=>{(offersByReq[o.request_id]=offersByReq[o.request_id]||[]).push(o)})
  el.innerHTML=sorted.map(r=>{
    const budget=r.budget_from?('€'+r.budget_from+(r.budget_to?' – €'+r.budget_to:'')):'Sem orçamento definido'
    const resolved=r.status==='resolved'
    const photos=(r.photo_urls||[]).length?`<div class="req-photo-row">${r.photo_urls.map(u=>`<img src="${escapeHtml(u)}"/>`).join('')}</div>`:''
    const myOffers=offersByReq[r.id]||[]
    const offersHtml=myOffers.length
      ?`<div class="offers-box"><div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px">${myOffers.length} proposta${myOffers.length>1?'s':''} recebida${myOffers.length>1?'s':''}</div>${myOffers.map(o=>{
        const preco=o.price_from?('€'+o.price_from+(o.price_to?' – €'+o.price_to:'')):'Sem preço'
        const nome=escapeHtml((o.profiles&&o.profiles.name)||'Profissional')
        const msg=escapeHtml(o.message||'')
        return `<div class="offer-row"><div><div class="offer-row-name">${nome}</div><div class="offer-row-msg">${msg}</div></div><div style="display:flex;align-items:center;gap:8px"><div class="offer-row-price">${preco}</div><button class="btn btn-outline btn-sm" onclick="location.href='messages.html?with=${o.professional_id}'">💬</button></div></div>`
      }).join('')}</div>`
      :''
    const reviewCta=(resolved&&myOffers.length)?`<div class="review-cta" style="margin-top:2px;padding:10px 12px;background:#FFF7E0;border:1px solid #F5E3A8;border-radius:10px;font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>⭐ Contrataste alguém? Deixa uma avaliação:</span>${myOffers.map(o=>`<a href="profile.html?id=${o.professional_id}&tab=avaliacoes" class="btn btn-outline btn-sm" style="text-decoration:none">${escapeHtml((o.profiles&&o.profiles.name)||'Profissional')}</a>`).join('')}</div>`:'';return `<div class="list-item" style="flex-direction:column;align-items:stretch">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(r.title)}${r.is_urgent?'<span class="status-pill status-urgent">🔥 Urgente</span>':''}<span class="status-pill ${resolved?'status-resolved':'status-open'}">${resolved?'Resolvido':'Aberto'}</span></div>
        <div class="list-item-sub">${escapeHtml(r.category)} · ${escapeHtml(r.location)} · ${budget}</div>
      </div>
      ${photos}
      ${offersHtml}${reviewCta}
      <div class="list-item-actions">
        <button class="btn btn-outline btn-sm" onclick="toggleRequestStatus('${r.id}','${resolved?'open':'resolved'}')">${resolved?'↩️ Reabrir':'✅ Marcar como resolvido'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMyRequest('${r.id}')"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg> Eliminar</button>
      </div>
    </div>`
  }).join('')
}

async function toggleRequestStatus(id,newStatus){
  const{error}=await db.from('requests').update({status:newStatus}).eq('id',id)
  if(error){alert('Não foi possível atualizar: '+error.message);return}
  if(newStatus==='resolved')showAlert('req-success','Pedido marcado como resolvido! Já podes avaliar quem contrataste, mais abaixo.')
  loadMyRequests()
}

async function addMyRequest(){
  const title=document.getElementById('req-title').value.trim()
  const category=document.getElementById('req-cat').value
  const _rdistrict=document.getElementById('req-district').value
const _rcity=document.getElementById('req-city').value.trim()
const location=_rdistrict?(_rcity?_rdistrict+' – '+_rcity:_rdistrict):''
  if(!title||!category||!location){showAlert('req-error','Preenche título, categoria e zona.','error');return}
  const{data:novo,error}=await db.from('requests').insert({
    client_id:user.id,title,category,location,
    description:document.getElementById('req-desc').value.trim()||null,
    budget_from:parseFloat(document.getElementById('req-bmin').value)||null,
    budget_to:parseFloat(document.getElementById('req-bmax').value)||null,
    photo_urls:pendingReqPhotos,
    is_urgent:document.getElementById('req-urgent').checked
  }).select('id').single()
  if(error){showAlert('req-error','Erro: '+error.message,'error');return}
  showAlert('req-success','Pedido publicado com sucesso!')
  ;['req-title','req-desc','req-bmin','req-bmax'].forEach(id=>document.getElementById(id).value='')
  document.getElementById('req-cat').value=''
  document.getElementById('req-district').value=''
  document.getElementById('req-city').value=''
  document.getElementById('req-urgent').checked=false
  pendingReqPhotos=[]
  renderReqPhotoStrip()
  loadMyRequests()
  notifyMatchingProfessionalsDash(novo&&novo.id)
}

async function notifyMatchingProfessionalsDash(requestId){
  if(!requestId)return
  try{
    const{data:{session:s}}=await db.auth.getSession()
    if(!s)return
    await fetch('/.netlify/functions/notify-request',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token},
      body:JSON.stringify({requestId})
    })
  }catch(e){}
}

async function deleteMyRequest(id){
  if(!confirm('Remover este pedido?'))return
  const{error}=await db.from('requests').delete().eq('id',id)
  if(error){alert('Não foi possível remover: '+error.message);return}
  loadMyRequests()
}

function viewPublicProfile(){
  if(!profileId){alert('Guarda o teu perfil primeiro para ver o perfil público.');return}
  window.open('profile.html?id='+profileId,'_blank')
}

// ASSISTENTE DE IA
function toggleAiChat(){
  aiChatOpen=!aiChatOpen
  document.getElementById('ai-chat-panel').classList.toggle('open',aiChatOpen)
  if(aiChatOpen)document.getElementById('ai-chat-input').focus()
}


async function sendAiChat(){
  const input=document.getElementById('ai-chat-input')
  const q=input.value.trim()
  if(!q)return
  const body=document.getElementById('ai-chat-body')
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg user">${escapeHtml(q)}</div>`)
  input.value=''
  const sendBtn=document.getElementById('ai-chat-send')
  sendBtn.disabled=true
  const typingId='typing-'+Date.now()
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot" id="${typingId}">…</div>`)
  body.scrollTop=body.scrollHeight

  // Assistente local, sem custo: responde primeiro com regras a partir dos dados já carregados.
  // Quando a pergunta não é reconhecida (answerLocally devolve AI_LOCAL_FALLBACK), usa a
  // Edge Function "ai-assistant" (IA real, Claude) como resposta de recurso — ver answerWithClaude() abaixo.
  await new Promise(r=>setTimeout(r,300)) // pequena pausa para parecer natural
  const typingEl=document.getElementById(typingId)
  if(typingEl)typingEl.remove()

  const action=tryDetectAction(q)
  if(action){
    if(!planLimits||!planLimits.ai_actions){
      body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">Fazer isto por ti (não só responder) é uma funcionalidade dos planos Pro e Premium. Atualiza o teu plano no botão "Atualizar plano" no Resumo (ou em Preços) para o assistente poder executar ações como esta.</div>`)
    } else {
      proposeAiAction(action.label,action.run)
    }
  } else {
    let answer=answerLocally(q)
    if(answer===AI_LOCAL_FALLBACK){
      const thinkId='thinking-'+Date.now()
      body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot" id="${thinkId}">A pensar…</div>`)
      body.scrollTop=body.scrollHeight
      answer=await answerWithClaude(q)
      const thinkEl=document.getElementById(thinkId)
      if(thinkEl)thinkEl.remove()
    }
    body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${answer.replace(/\n/g,'<br>')}</div>`)
  }

  sendBtn.disabled=false
  body.scrollTop=body.scrollHeight
}

// Deteta pedidos de ação (em vez de pergunta) no texto do utilizador.
// Devolve null se não for uma ação reconhecida, ou {label,run} para propor confirmação.
function tryDetectAction(question){
  const q=normalizeText(question)
  const has=(...words)=>words.some(w=>q.includes(w))

  if(has('ativa o modo ferias','liga o modo ferias','ativar o modo ferias','marca-me como indisponivel','marca me como indisponivel','ativa ferias')){
    return{
      label:'Vou ativar o modo férias (indisponível) por 14 dias — podes ajustar a data depois em Perfil. Confirmas?',
      run:async()=>{
        const until=new Date(Date.now()+14*86400000).toISOString().slice(0,10)
        const{error}=await db.from('profiles').update({unavailable_until:until,unavailable_message:null}).eq('id',profileId)
        if(error)return 'Não consegui ativar o modo férias agora. Tenta pela página de Perfil.'
        profileData={...profileData,unavailable_until:until,unavailable_message:null}
        if(typeof fillProfileForm==='function')fillProfileForm(profileData)
        return `Feito — modo férias ativado até ${new Date(until+'T00:00:00').toLocaleDateString('pt-PT')}.`
      }
    }
  }

  if(has('desativa o modo ferias','desliga o modo ferias','ja estou disponivel','tira-me do modo ferias','cancela o modo ferias')){
    return{
      label:'Vou desativar o modo férias — voltas a aparecer como disponível. Confirmas?',
      run:async()=>{
        const{error}=await db.from('profiles').update({unavailable_until:null,unavailable_message:null}).eq('id',profileId)
        if(error)return 'Não consegui desativar o modo férias agora. Tenta pela página de Perfil.'
        profileData={...profileData,unavailable_until:null,unavailable_message:null}
        if(typeof fillProfileForm==='function')fillProfileForm(profileData)
        return 'Feito — já estás marcado como disponível outra vez.'
      }
    }
  }

  const pagoMatch=question.match(/marca[r]?\s+(?:o\s+trabalho\s+)?["']?(.+?)["']?\s+como\s+pago/i)
  if(pagoMatch){
    const wanted=normalizeText(pagoMatch[1])
    const matches=(allJobs||[]).filter(j=>j.status!=='pago'&&normalizeText(j.title||'').includes(wanted))
    if(!matches.length)return{label:'Não encontrei nenhum trabalho por pagar com esse nome no Pipeline. Confirma o título exato.',run:null}
    if(matches.length>1){
      return{
        label:`Encontrei ${matches.length} trabalhos parecidos com "${pagoMatch[1]}". Sê mais específico (usa o título completo) para eu marcar o certo como pago.`,
        run:null,
        noConfirm:true
      }
    }
    const job=matches[0]
    return{
      label:`Vou marcar "${escapeHtml(job.title)}" como pago. Confirmas?`,
      run:async()=>{
        await updateJobStatus(job.id,'pago')
        return `Feito — "${escapeHtml(job.title)}" está marcado como pago.`
      }
    }
  }

  return null
}

function proposeAiAction(label,run){
  const body=document.getElementById('ai-chat-body')
  if(!run){
    body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${escapeHtml(label)}</div>`)
    return
  }
  pendingAiAction=run
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${escapeHtml(label)}<div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-solid" style="padding:6px 14px;font-size:12px" onclick="confirmAiAction()">Confirmar</button><button class="btn btn-outline" style="padding:6px 14px;font-size:12px" onclick="cancelAiAction()">Cancelar</button></div></div>`)
  body.scrollTop=body.scrollHeight
}

async function confirmAiAction(){
  const run=pendingAiAction
  pendingAiAction=null
  const body=document.getElementById('ai-chat-body')
  if(!run)return
  const typingId='typing-'+Date.now()
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot" id="${typingId}">…</div>`)
  body.scrollTop=body.scrollHeight
  const result=await run()
  const typingEl=document.getElementById(typingId)
  if(typingEl)typingEl.remove()
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">${result}</div>`)
  body.scrollTop=body.scrollHeight
}

function cancelAiAction(){
  pendingAiAction=null
  const body=document.getElementById('ai-chat-body')
  body.insertAdjacentHTML('beforeend',`<div class="ai-msg bot">Ok, não fiz nada.</div>`)
  body.scrollTop=body.scrollHeight
}

function normalizeText(s){
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
}

const AI_FAQ=[
{k:['certificacao','certificacoes'],a:'Podes adicionar certificações profissionais em Perfil > Sobre mim avançado. Aparecem no teu perfil público e ajudam a gerar confiança.'},
{k:['idiomas que falo','linguas que falo','falo ingles'],a:'Podes indicar os idiomas que falas em Perfil > Sobre mim avançado — aparece no teu perfil público.'},
{k:['seguro profissional','tenho seguro'],a:'Podes assinalar se tens seguro profissional em Perfil > Sobre mim avançado. Funciona como selo de confiança para clientes.'},
{k:['metodos de pagamento que aceito','aceito multibanco','aceito mbway','como recebo o dinheiro'],a:'Em Perfil > Sobre mim avançado indicas que métodos de pagamento aceitas (Multibanco, MB Way, transferência, numerário, etc.), visível no teu perfil público.'},
{k:['casos de sucesso','portefolio','portfolio de trabalhos'],a:'Podes mostrar casos de sucesso (fotos e descrição) no teu perfil público, em Perfil > Casos de Sucesso. O número que podes ter depende do teu plano.'},
{k:['diario de trabalhos','historico no perfil publico'],a:'O Diário no teu perfil público mostra um resumo dos trabalhos que já fizeste, para dar confiança a novos clientes.'},
{k:['conquistas','badges','distintivos'],a:'Ganhas badges automáticas conforme cresces na Flinko — perfil completo, primeiras avaliações, resposta rápida, entre outras. Aparecem no teu perfil público.'},
{k:['zona de atuacao','area que sirvo','onde presto servico'],a:'Defines a tua zona de atuação em Perfil. Ajuda os clientes dessa área a encontrar-te nas pesquisas.'},
{k:['disponibilidade semanal fixa','horario que trabalho','dias que trabalho'],a:'Podes definir a tua disponibilidade semanal fixa em Perfil, para os clientes saberem quando costumas estar disponível.'},
{k:['orcamento automatico','pedido com varios orcamentos','receber varios orcamentos'],a:'Quando um cliente publica um pedido, vários profissionais da categoria certa podem enviar orçamento — tu respondes diretamente no Pipeline.'},
{k:['sincronizar agenda','google calendar','exportar agenda','link ics'],a:'Podes sincronizar a tua Agenda da Flinko com o Google Calendar (ou outro) através de um link ICS, disponível na página Agenda.'},
{k:['instalar a app','instalar aplicacao','adicionar ao ecra principal','pwa'],a:'A Flinko funciona como app (PWA). No telemóvel, o browser mostra \'Adicionar ao ecrã principal\' — depois abre como uma app normal, com notificações.'},
{k:['notificacoes push','ativar notificacoes'],a:'Podes ativar notificações push no dashboard para receberes avisos de novas mensagens, pedidos e o resumo diário, mesmo com a app fechada.'},
{k:['resumo diario','resumo matinal','notificacao de manha'],a:'Todas as manhãs, se tiveres algo relevante (trabalhos do dia, orçamentos por responder, mensagens por ler), recebes uma notificação resumo. Podes desligar em Notificações.'},
{k:['aviso de chuva','vai chover','tempo para o trabalho','previsao do tempo'],a:'Para categorias que trabalham ao ar livre, avisamos automaticamente 2 dias antes se houver alta probabilidade de chuva num trabalho agendado.'},
{k:['lista de material','material a levar'],a:'Em cada trabalho no Pipeline podes escrever uma lista de material a levar — fica guardada e visível antes de te deslocares.'},
{k:['calculadora de orcamento','calcular preco por telefone','calculadora rapida'],a:'No Resumo tens uma calculadora rápida que sugere uma faixa de preço com base na tua categoria — útil para responderes por telefone.'},
{k:['passar trabalho a colega','encaminhar trabalho','recomendar colega'],a:'Podes passar ou recomendar um trabalho a outro profissional da Flinko — ele recebe a informação numa conversa e tu podes ganhar crédito de indicação.'},
{k:['pedir avaliacao','avaliacao automatica ao cliente'],a:'Quando marcas um trabalho como pago, enviamos automaticamente uma mensagem ao cliente a pedir avaliação, com o link do teu perfil.'},
{k:['programa de creditos','ganhar creditos'],a:'Ganhas créditos ao indicares colegas que se registam e completam o perfil, e também com avaliações positivas. Usa os créditos para destacar o teu perfil.'},
{k:['anuncio pago','destacar perfil','impulsionar perfil'],a:'Podes usar créditos para pôr o teu perfil em destaque nas pesquisas por um período, na secção de Créditos.'},
{k:['diferenca entre planos','comparar planos','fazer upgrade','mudar de plano'],a:'Há três planos: Gratuito, Pro e Premium — os planos superiores dão mais orçamentos automáticos por mês, mais casos de portefólio, painel de Finanças e outras funcionalidades. Pergunta \'qual o meu plano\' para veres os teus limites atuais.'},
{k:['painel de mercado'],a:'O painel de Mercado mostra como os teus preços comparam com outros profissionais da tua categoria.'},
{k:['saude do negocio'],a:'O painel Saúde do Negócio dá uma visão geral do teu desempenho: faturação, pipeline e avaliações.'},
{k:['registar despesas','despesas do negocio','despesas gerais'],a:'Em Finanças podes registar despesas gerais do negócio (combustível, material, ferramentas) para teres uma visão real do lucro, não só da faturação.'},
{k:['relatorio anual','relatorio do ano'],a:'Em Finanças tens um relatório anual simples com o resumo de faturação, despesas e margem do ano.'},
{k:['margem de lucro','margem do trabalho'],a:'Se preencheres o custo de material num trabalho, calculamos automaticamente a margem de lucro desse trabalho no Pipeline.'},
{k:['verificacao por sms','verificar telemovel','numero verificado'],a:'Podes verificar o teu número de telemóvel por SMS — perfis verificados têm mais confiança dos clientes.'},
{k:['verificacao manual','como sou verificado'],a:'Além da verificação por SMS, a equipa Flinko também pode verificar perfis manualmente — fica assinalado com o selo \'Verificado\'.'},
{k:['stripe','pagamento pela plataforma','receber pagamento online','pagamento por cartao'],a:'Podes ativar pagamentos online opcionais via Stripe Connect, para receberes diretamente por cartão através da Flinko.'},
{k:['avaliacoes externas','importar avaliacoes','trabalhos feitos fora da proliga','trabalhos feitos fora da flinko'],a:'Podes adicionar avaliações e trabalhos feitos fora da Flinko (portefólio externo) para reforçares a tua reputação desde o primeiro dia.'},
{k:['nova cidade','a minha cidade nao esta','lista de espera'],a:'Se a Flinko ainda não está ativa na tua zona, os clientes podem entrar numa lista de espera — assim que houver profissionais suficientes, ativamos a zona.'},
{k:['rgpd','protecao de dados','apagar a minha conta','eliminar conta'],a:'Podes pedir a exportação dos teus dados ou a eliminação da conta diretamente aqui no painel, em "Privacidade e RGPD" — o pedido fica registado e a equipa trata-o em até 30 dias. Também podes consultar todos os teus direitos RGPD na página RGPD do site.'},
{k:['como sou encontrado','aparecer nas pesquisas','porque nao apareço'],a:'Apareces nas pesquisas com base na tua categoria, zona, perfil completo e avaliações. Perfis com foto, bio e serviços publicados aparecem primeiro.'},
{k:['diferenca entre cliente e profissional','tipos de conta'],a:'Há dois tipos de conta: Cliente (contrata profissionais) e Profissional (oferece serviços) — escolheste isto no registo.'},
{k:['contactar suporte','falar com a proliga','falar com a flinko','preciso de ajuda humana'],a:'Podes contactar o suporte da Flinko na página de Contacto do site.'},
{k:['como funciona a proliga','o que e a proliga','como funciona a flinko','o que e a flinko'],a:'A Flinko liga clientes a profissionais verificados em Portugal — publicas serviços, respondes a pedidos e geres tudo (agenda, orçamentos, pagamentos) num único painel.'},
{k:['comissao','a proliga cobra comissao','quanto custa usar a proliga','a flinko cobra comissao','quanto custa usar a flinko'],a:'A Flinko tem preços fixos e sem comissões sobre o que faturas — pagas apenas a mensalidade do plano que escolheres (o Gratuito não tem custo).'},
{k:['editar servico','apagar servico','quantos servicos posso publicar'],a:'Podes editar ou remover os teus serviços a qualquer momento em Serviços. O número que podes publicar depende do teu plano.'},
{k:['tempo de resposta','quanto tempo demoro a responder'],a:'Responder depressa aos pedidos ajuda-te a aparecer melhor nas pesquisas e conta para algumas badges de conquista.'},
{k:['cancelar um trabalho','marcar como cancelado'],a:'Podes marcar um trabalho como cancelado no Pipeline a qualquer momento — fica registado no histórico mas sai dos trabalhos ativos.'},
{k:['mudar a foto de perfil','atualizar foto'],a:'Podes atualizar a tua foto de perfil em Perfil — perfis com foto recebem mais contactos.'},
{k:['link personalizado','slug do perfil','url do meu perfil'],a:'Alguns planos permitem um link personalizado para o teu perfil público (flinko.pt/o-teu-nome) em vez do link genérico com ID.'},
{k:['exportar dados','descarregar os meus dados'],a:'Podes pedir os teus dados pessoais ao abrigo do RGPD através da página RGPD do site.'}
]

const AI_LOCAL_FALLBACK='Não percebi bem a pergunta. Consigo responder sobre: faturação, orçamentos pendentes, agenda, ticket médio, avaliações, perfil, serviços, trabalhos, o teu plano, preços de mercado, o código de referência e o modo férias. Tenta perguntar, por exemplo, "como está o meu mês?" ou "quanto devo cobrar?".'
function answerLocally(question){
  const q=normalizeText(question)
  const has=(...words)=>words.some(w=>q.includes(w))

  // Cumprimentos / agradecimentos
  if(has('ola','boa tarde','bom dia','boa noite','oi ','ei proliga','ei flinko')){
    return 'Olá! Pergunta-me sobre faturação, orçamentos pendentes, agenda, ticket médio, avaliações, perfil, serviços, trabalhos, o teu plano, preços de mercado, o código de referência ou o modo férias.'
  }
  if(has('obrigado','obrigada','valeu','fixe respondeste','otimo obrigado')){
    return 'De nada! Qualquer coisa é só perguntar.'
  }

  // Resumo geral do mês / negócio (pergunta ampla — combina os principais números)
  if(has('como esta','como vai','resumo','o meu mes','este mes','meu negocio')){
    const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0)
    const now=new Date();const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7)
    const paidThisMonth=allJobs.filter(j=>j.status==='pago'&&j.paid_at&&new Date(j.paid_at)>=monthStart)
    const total=paidThisMonth.reduce((s,j)=>s+(Number(j.paid_amount)||0),0)
    const active=allJobs.filter(j=>j.status!=='cancelado')
    const thisWeek=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now&&new Date(j.scheduled_at)<=weekEnd)
    const parts=[]
    parts.push(total>0?`Faturaste €${total.toFixed(0)} este mês (${paidThisMonth.length} trabalho${paidThisMonth.length>1?'s':''} pago${paidThisMonth.length>1?'s':''}).`:'Ainda não faturaste nada este mês.')
    parts.push(active.length?`Tens ${active.length} trabalho${active.length>1?'s':''} ativo${active.length>1?'s':''} no Pipeline.`:'Não tens trabalhos ativos no Pipeline de momento.')
    parts.push(thisWeek.length?`${thisWeek.length} deles agendado${thisWeek.length>1?'s':''} para os próximos 7 dias.`:'Sem nada agendado para os próximos 7 dias.')
    if(reviewsCount)parts.push(`Avaliação média: ${reviewsAvg} (${reviewsCount} avaliações).`)
    return parts.join(' ')
  }

  // Faturação / ganhos
  if(has('faturei','faturacao','faturação','ganhei','recebi','dinheiro','quanto fiz','rendimento')){
    const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0)
    const paidThisMonth=allJobs.filter(j=>j.status==='pago'&&j.paid_at&&new Date(j.paid_at)>=monthStart)
    const total=paidThisMonth.reduce((s,j)=>s+(Number(j.paid_amount)||0),0)
    if(!paidThisMonth.length)return 'Ainda não marcaste nenhum trabalho como pago este mês. Assim que o fizeres no Pipeline, a faturação aparece aqui e no Resumo.'
    return `Este mês faturaste €${total.toFixed(0)}, com base em ${paidThisMonth.length} trabalho${paidThisMonth.length>1?'s':''} pago${paidThisMonth.length>1?'s':''}.`
  }

  // Orçamentos pendentes / por responder
  if(has('pendente','por responder','parado','orcamento','orçamento','follow-up','followup')){
    const now=new Date()
    const stale=allJobs.filter(j=>['novo','negociacao'].includes(j.status)&&(now-new Date(j.created_at))/86400000>3)
    const waiting=allJobs.filter(j=>j.status==='orcamento_enviado'&&j.quote_sent_at&&(now-new Date(j.quote_sent_at))/86400000>5)
    if(!stale.length&&!waiting.length)return 'Não tens orçamentos parados de momento — tudo em dia!'
    const parts=[]
    if(stale.length)parts.push(`${stale.length} trabalho${stale.length>1?'s':''} por avançar há mais de 3 dias`)
    if(waiting.length)parts.push(`${waiting.length} orçamento${waiting.length>1?'s':''} enviado${waiting.length>1?'s':''} sem resposta há mais de 5 dias`)
    return `Tens ${parts.join(' e ')}. Vale a pena dar seguimento no Pipeline.`
  }

  // Agenda / trabalhos agendados
  if(has('agenda','agendado','esta semana','proximos dias','próximos dias','calendario','calendário')){
    const now=new Date();const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7)
    const thisWeek=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now&&new Date(j.scheduled_at)<=weekEnd).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))
    if(!thisWeek.length)return 'Não tens trabalhos agendados para os próximos 7 dias. Define uma data num trabalho do Pipeline para aparecer na Agenda.'
    const list=thisWeek.slice(0,5).map(j=>`• ${escapeHtml(j.title)} — ${new Date(j.scheduled_at).toLocaleDateString('pt-PT',{weekday:'short',day:'2-digit',month:'short'})}`).join('\n')
    return `Tens ${thisWeek.length} trabalho${thisWeek.length>1?'s':''} agendado${thisWeek.length>1?'s':''} para os próximos 7 dias:\n${list}`
  }

  // Ticket médio
  if(has('ticket','medio','médio','preco medio','preço médio','valor medio','valor médio')){
    const paid=allJobs.filter(j=>j.status==='pago'&&j.paid_amount)
    if(!paid.length)return 'Ainda não tens trabalhos pagos suficientes para calcular um ticket médio.'
    const avg=paid.reduce((s,j)=>s+Number(j.paid_amount),0)/paid.length
    return `O teu ticket médio é de €${avg.toFixed(0)}, com base em ${paid.length} trabalho${paid.length>1?'s':''} pago${paid.length>1?'s':''}.`
  }

  // Avaliações
  if(has('avaliacao','avaliação','avaliacoes','avaliações','estrelas','rating','nota')){
    if(!reviewsCount)return 'Ainda não tens avaliações. Pede aos teus clientes para avaliarem depois de um trabalho concluído.'
    return `Tens ${reviewsCount} avaliação${reviewsCount>1?'ões':''} com média de ${reviewsAvg} estrelas.`
  }

  // Perfil / visibilidade
  if(has('perfil','visibilidade','completo')){
    const missing=[]
    if(profileData&&!profileData.photo_url)missing.push('foto de perfil')
    if(profileData&&!profileData.bio)missing.push('biografia')
    if(!missing.length)return 'O teu perfil está completo (foto e biografia preenchidas). Bom trabalho!'
    return `Falta-te ${missing.join(' e ')} no perfil. Perfis completos recebem mais contactos de clientes.`
  }

  // Conversas / mensagens / clientes
  if(has('conversa','mensage','cliente','contacto')){
    return msgsCount
      ? `Tens ${msgsCount} conversa${msgsCount>1?'s':''} com clientes no Chat.`
      : 'Ainda não tens conversas com clientes. Publica serviços e completa o perfil para começares a aparecer nas pesquisas.'
  }

  // Serviços
  if(has('servico','serviço','servicos','serviços')){
    return servicesCount
      ? `Tens ${servicesCount} serviço${servicesCount>1?'s':''} publicado${servicesCount>1?'s':''}.`
      : 'Ainda não publicaste nenhum serviço. Adiciona pelo menos um em "Serviços" para apareceres nas pesquisas.'
  }

  // Trabalhos em geral / estado do pipeline
  if(has('trabalho','trabalhos','pipeline','quantos')){
    const active=allJobs.filter(j=>j.status!=='cancelado')
    if(!active.length)return 'Ainda não tens nenhum trabalho registado. Usa "Novo Trabalho" na página Trabalhos para começares a acompanhar tudo.'
    const counts={}
    active.forEach(j=>counts[j.status]=(counts[j.status]||0)+1)
    const parts=Object.entries(counts).map(([k,v])=>`${v} ${JOB_STATUS_LABELS[k]||k}`).join(', ')
    return `Tens ${active.length} trabalho${active.length>1?'s':''} ativo${active.length>1?'s':''}: ${parts}.`
  }

  // Plano e limites da conta
  if(has('meu plano','o plano','quantos servicos posso','limite do plano','plano atual','sou free','sou pro','sou premium')){
    const planName=(profileData&&profileData.plan)||'free'
    const label=planName==='pro'?'Pro':planName==='premium'?'Premium':'Gratuito'
    const parts=[`O teu plano atual é o ${label}.`]
    if(planLimits&&planLimits.portfolio_max)parts.push(`Podes ter até ${planLimits.portfolio_max} casos de sucesso no portefólio.`)
    if(planLimits&&planLimits.quotes_per_month)parts.push(`Até ${planLimits.quotes_per_month} orçamentos automáticos por mês.`)
    if(planLimits&&!planLimits.finances)parts.push('O painel de Finanças não está incluído neste plano.')
    return parts.join(' ')
  }

  // Preços de mercado / concorrência (categoria)
  if(has('quanto cobrar','quanto devo cobrar','mercado','concorrencia','outros profissionais cobram','quanto cobram')){
    if(marketPriceCache&&profileData&&marketPriceCache.category===profileData.category)
      return `Profissionais de ${profileData.category} cobram, em média, entre €${marketPriceCache.lo.toFixed(0)} e €${marketPriceCache.hi.toFixed(0)}. Usa isto como referência para os teus preços.`
    return 'Ainda não tenho dados de mercado suficientes para a tua categoria. Isto aparece assim que houver serviços publicados suficientes de profissionais parecidos contigo.'
  }

  // Modo férias / indisponibilidade
  if(has('ferias','indisponivel','modo ausencia','estou de ferias')){
    if(profileData&&profileData.unavailable_until){
      const until=new Date(profileData.unavailable_until+'T00:00:00')
      if(until>=new Date())return `Estás marcado como indisponível até ${until.toLocaleDateString('pt-PT')}. Os clientes veem esse aviso no teu perfil público.`
    }
    return 'Não tens o modo de indisponibilidade ativo neste momento. Podes ativá-lo em Perfil, na secção "Modo férias".'
  }

  // Código de referência / indicações
  if(has('codigo de referencia','convidar colega','indicar colega','programa de referencia','indicacoes')){
    const code=profileData&&profileData.referral_code
    if(code)return `O teu código de referência é ${code}. Partilha-o — quando alguém se regista com ele, podes ganhar créditos.`
    return 'Ainda não tens um código de referência gerado. Consulta a secção de Indicações no menu para o criares.'
  }

  // Sugestões / o que fazer a seguir
  if(has('sugest','dica','conselho','o que devo','o que fazer','ajuda')){
    const tipsEl=document.getElementById('ai-insights')
    const firstTip=tipsEl&&tipsEl.querySelector('.insight-card div:last-child')
    if(firstTip)return 'A sugestão mais importante agora: '+firstTip.textContent
    return 'De momento não tenho nenhuma sugestão urgente — continua o bom trabalho! Podes ver mais detalhes no painel de Insights no Resumo.'
  }

  // Base alargada de perguntas sobre como cada funcionalidade da Flinko funciona
  for(const topic of AI_FAQ){
    if(has(...topic.k))return topic.a
  }

  return AI_LOCAL_FALLBACK
}

// Chamada à Edge Function com IA real (Claude), usada como resposta de recurso quando
// o assistente local (answerLocally) não reconhece a pergunta. Requer ANTHROPIC_API_KEY
// configurada no Supabase.
async function answerWithClaude(question){
  const{data,error}=await db.functions.invoke('ai-assistant',{body:{question}})
  if(error||!data||data.error){
    return data&&data.error==='not_configured'
      ?'O assistente de IA com Claude ainda não foi ativado. Configura ANTHROPIC_API_KEY no Supabase.'
      :'Não consegui responder agora. Tenta novamente daqui a pouco.'
  }
  return data.answer||'Não consegui gerar uma resposta.'
}

