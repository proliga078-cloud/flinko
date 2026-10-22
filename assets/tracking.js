(function(){
  try{
    var raw=localStorage.getItem('flinko_cookie_consent')||localStorage.getItem('proliga_cookie_consent');
    if(!raw)return;
    var consent=JSON.parse(raw);
    if(!consent||!consent.analytics)return;
  }catch(e){return}

 var SUPABASE_URL='https://cdwinidhtfxfxowflize.supabase.co';
  var SUPABASE_KEY='sb_publishable_G1U9iSJLR2JkhD9gvfyY3Q_qaqnMaUk';

 var visitorId;
  try{
    visitorId=localStorage.getItem('flinko_visitor_id')||localStorage.getItem('proliga_visitor_id');
    if(!visitorId){
      visitorId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('v-'+Date.now()+'-'+Math.random().toString(36).slice(2));
      localStorage.setItem('flinko_visitor_id',visitorId);
    }
  }catch(e){visitorId='anon-'+Date.now()}

 function sendVisit(){
   fetch(SUPABASE_URL+'/rest/v1/site_visits',{
     method:'POST',
     headers:{
       'Content-Type':'application/json',
       'apikey':SUPABASE_KEY,
       'Authorization':'Bearer '+SUPABASE_KEY,
       'Prefer':'return=minimal'
     },
     body:JSON.stringify({
       visitor_id:visitorId,
       path:location.pathname,
       referrer:document.referrer||null,
       user_agent:navigator.userAgent
     }),
     keepalive:true
   }).catch(function(){})
 }

 if(document.readyState==='complete'){sendVisit()}else{window.addEventListener('load',sendVisit)}

 // Eventos do funil (tabela site_events). Os dados são curtos e sem
 // identificar a pessoa: o texto pesquisado, a categoria, o id do perfil.
 function sendEvent(name,props,path){
   var clean={};
   try{Object.keys(props||{}).slice(0,6).forEach(function(k){var v=props[k];if(v==null)return;clean[k]=typeof v==='number'?v:String(v).slice(0,80)})}catch(e){}
   fetch(SUPABASE_URL+'/rest/v1/site_events',{
     method:'POST',
     headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Prefer':'return=minimal'},
     body:JSON.stringify({name:name,visitor_id:visitorId,path:path||location.pathname,props:clean}),
     keepalive:true
   }).catch(function(){})
 }
 // Google Ads: mede que anúncios trazem contas, pedidos e contactos. Só corre
 // aqui, depois do consentimento de análise e medição de anúncios. Fica
 // desligado enquanto o id (AW-...) estiver vazio; as etiquetas vêm das
 // "ações de conversão" criadas na conta Google Ads (Objetivos > Conversões).
 var GOOGLE_ADS=window.FLINKO_GOOGLE_ADS||{
   id:'',
   conversoes:{conta_criada:'',pedido_publicado:'',perfil_contactar:''}
 };
 var adsLigado=/^AW-\d+$/.test(GOOGLE_ADS.id||'');
 if(adsLigado){
   window.dataLayer=window.dataLayer||[];
   window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
   window.gtag('js',new Date());
   // Só medição: sem listas de remarketing nem anúncios personalizados (é o
   // que a política de cookies promete).
   window.gtag('config',GOOGLE_ADS.id,{allow_ad_personalization_signals:false});
   var g=document.createElement('script');
   g.async=true;
   g.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GOOGLE_ADS.id);
   document.head.appendChild(g);
 }
 function conversao(name){
   var etiqueta=adsLigado&&(GOOGLE_ADS.conversoes||{})[name];
   if(etiqueta)try{window.gtag('event','conversion',{send_to:GOOGLE_ADS.id+'/'+etiqueta})}catch(e){}
 }

 var fila=window.__fkq||[];
 window.flinkoTrack=function(name,props){sendEvent(name,props);conversao(name)};
 fila.forEach(function(e){sendEvent(e[0],e[1],e[2]);conversao(e[0])});
 window.__fkq=[];
})();
