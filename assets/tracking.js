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
 var fila=window.__fkq||[];
 window.flinkoTrack=function(name,props){sendEvent(name,props)};
 fila.forEach(function(e){sendEvent(e[0],e[1],e[2])});
 window.__fkq=[];
})();
