(function(){
  try{
    var raw=localStorage.getItem('proliga_cookie_consent');
    if(!raw)return;
    var consent=JSON.parse(raw);
    if(!consent||!consent.analytics)return;
  }catch(e){return}

 var SUPABASE_URL='https://cdwinidhtfxfxowflize.supabase.co';
  var SUPABASE_KEY='sb_publishable_G1U9iSJLR2JkhD9gvfyY3Q_qaqnMaUk';

 var visitorId;
  try{
    visitorId=localStorage.getItem('proliga_visitor_id');
    if(!visitorId){
      visitorId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('v-'+Date.now()+'-'+Math.random().toString(36).slice(2));
      localStorage.setItem('proliga_visitor_id',visitorId);
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
})();
})();
