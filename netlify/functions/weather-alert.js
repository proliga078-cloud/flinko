const{createClient}=require('@supabase/supabase-js')
const{sendPush}=require('./_push')

const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

// Categorias onde chuva costuma obrigar a reagendar.
const OUTDOOR_CATEGORIES=['Jardineiros','Pedreiros','Pintores','Mudanças']

// Mesma tabela de zonas usada no mapa da homepage e no perfil publico.
const PT_PLACES={
'Matosinhos':[41.1839,-8.6910],'Gondomar':[41.1425,-8.5321],'Vila Nova de Gaia':[41.1239,-8.6118],
'Guimarães':[41.4425,-8.2918],'Barcelos':[41.5388,-8.6151],'Vila Verde':[41.6489,-8.4382],
'Penafiel':[41.2072,-8.2837],'Vila Nova de Famalicão':[41.4084,-8.5187],
'Porto':[41.1579,-8.6291],'Braga':[41.5454,-8.4265],'Aveiro':[40.6405,-8.6538],'Beja':[38.0150,-7.8632],
'Bragança':[41.8073,-6.7573],'Castelo Branco':[39.8222,-7.4909],'Coimbra':[40.2033,-8.4103],
'Évora':[38.5714,-7.9135],'Faro':[37.0194,-7.9304],'Guarda':[40.5364,-7.2683],'Leiria':[39.7436,-8.8071],
'Lisboa':[38.7223,-9.1393],'Portalegre':[39.2967,-7.4281],'Santarém':[39.2362,-8.6857],
'Setúbal':[38.5244,-8.8882],'Viana do Castelo':[41.6932,-8.8329],'Vila Real':[41.3006,-7.7441],
'Viseu':[40.6566,-7.9122],'Açores':[37.7412,-25.6756],'Madeira':[32.6669,-16.9241]
}
function normalizeTxt(s){return(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function matchPlace(location){
  const norm=normalizeTxt(location)
  if(!norm)return null
  let best=null
  for(const name in PT_PLACES){
    if(norm.includes(normalizeTxt(name))){
      if(!best||name.length>best.length)best=name
    }
  }
  return best
}

const RAIN_THRESHOLD=60 // % de probabilidade a partir do qual vale a pena avisar

// Corre uma vez por dia. Avisa quando um trabalho esta marcado para daqui a
// exatamente 2 dias e ha grande probabilidade de chuva nesse dia — tempo
// suficiente para o profissional reagendar com o cliente sem pressa.
//
// Bug encontrado em auditoria: a versao anterior fazia um pedido HTTP ao
// Open-Meteo POR PROFISSIONAL, dentro de um for..await sequencial. Como
// PT_PLACES so tem ~28 zonas fixas, dezenas de profissionais acabam quase
// sempre a partilhar a mesma zona (ex: todos os jardineiros do Porto) — o
// que significava o MESMO pedido, com a MESMA resposta, repetido uma vez
// por profissional, um a seguir ao outro. Numa zona com muitos
// profissionais isto multiplicava o tempo de execucao (arriscando o limite
// de tempo da function e deixando profissionais mais tarde na lista sem
// aviso nenhum) e o numero de pedidos ao Open-Meteo, sem nenhum beneficio.
// Agora: os profissionais sao agrupados por zona, os trabalhos do dia
// sao lidos numa unica consulta a BD (em vez de uma por profissional), e o
// Open-Meteo so e consultado uma vez por zona que tenha mesmo alguem com
// trabalho agendado nesse dia.
exports.handler=async()=>{
  try{
    const{data:pros}=await admin.from('profiles').select('id,name,category,location')
      .eq('is_demo',false).in('category',OUTDOOR_CATEGORIES)
    if(!pros||!pros.length)return{statusCode:200,body:JSON.stringify({checked:0,alerted:0})}

    const targetDate=new Date(Date.now()+2*86400000)
    const targetStr=targetDate.toISOString().slice(0,10)
    const dayStart=targetStr+'T00:00:00Z'
    const dayEnd=targetStr+'T23:59:59Z'

    const placeByProId={}
    const prosByPlace={}
    for(const pro of pros){
      const place=matchPlace(pro.location)
      if(!place)continue
      placeByProId[pro.id]=place
      ;(prosByPlace[place]=prosByPlace[place]||[]).push(pro)
    }
    const relevantProIds=Object.keys(placeByProId)
    if(!relevantProIds.length)return{statusCode:200,body:JSON.stringify({checked:pros.length,alerted:0})}

    const{data:allJobs}=await admin.from('jobs').select('id,title,professional_id')
      .in('professional_id',relevantProIds)
      .gte('scheduled_at',dayStart).lte('scheduled_at',dayEnd)
      .in('status',['novo','negociacao','orcamento_enviado','aceite','agendado'])
    const jobsByProId={}
    ;(allJobs||[]).forEach(j=>{(jobsByProId[j.professional_id]=jobsByProId[j.professional_id]||[]).push(j)})

    const dateLabel=targetDate.toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})
    let alerted=0

    for(const place of Object.keys(prosByPlace)){
      const prosComTrabalho=prosByPlace[place].filter(p=>jobsByProId[p.id]&&jobsByProId[p.id].length)
      if(!prosComTrabalho.length)continue // ninguem desta zona tem trabalho nesse dia — poupa o pedido ao Open-Meteo

      const[lat,lon]=PT_PLACES[place]
      let rainProb=null
      try{
        const resp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max&timezone=Europe%2FLisbon&forecast_days=7`)
        if(resp.ok){
          const wjson=await resp.json()
          const idx=(wjson.daily&&wjson.daily.time||[]).indexOf(targetStr)
          if(idx>=0)rainProb=wjson.daily.precipitation_probability_max[idx]
        }
      }catch(e){console.error('weather fetch error:',e)}

      if(rainProb==null||rainProb<RAIN_THRESHOLD)continue

      for(const pro of prosComTrabalho){
        const jobs=jobsByProId[pro.id]
        await sendPush(pro.id,{
          title:'Previsão de chuva',
          body:`${rainProb}% de chuva em ${place} para ${dateLabel} — tens ${jobs.length} trabalho${jobs.length>1?'s':''} agendado${jobs.length>1?'s':''} nesse dia.`,
          url:'/dashboard.html',
          tag:'weather-'+targetStr
        })
        alerted++
      }
    }
    return{statusCode:200,body:JSON.stringify({checked:pros.length,alerted})}
  }catch(err){
    console.error('weather-alert error:',err)
    return{statusCode:500,body:JSON.stringify({error:err.message})}
  }
}
