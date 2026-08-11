(function(){
  'use strict';
  var script=document.currentScript;
  var key=script&&script.getAttribute('data-site-key')||'';
  var endpoint=script&&script.getAttribute('data-endpoint')||'/local/api/pbxpuls/event.php';
  if(!key)return;
  function session(){var k='pbxpuls_click_session',v='';try{v=sessionStorage.getItem(k)||'';if(!v){v=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));sessionStorage.setItem(k,v)}}catch(e){}return v}
  function utm(){var q=new URLSearchParams(location.search);return{source:q.get('utm_source')||'',medium:q.get('utm_medium')||'',campaign:q.get('utm_campaign')||'',content:q.get('utm_content')||'',term:q.get('utm_term')||''}}
  function phoneLink(target){for(var node=target;node&&node!==document;node=node.parentElement){if(node.tagName==='A'&&/^\s*tel:/i.test(node.getAttribute('href')||''))return node}return null}
  function send(body){if(navigator.sendBeacon&&navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'})))return;var xhr=new XMLHttpRequest();xhr.open('POST',endpoint,true);xhr.setRequestHeader('Content-Type','application/json');xhr.send(body)}
  document.addEventListener('click',function(event){var link=phoneLink(event.target);if(!link)return;var payload={siteKey:key,eventId:(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)),eventType:'phone_click',timestamp:new Date().toISOString(),pageUrl:location.href,referrer:document.referrer||'',phoneText:(link.textContent||'').trim().slice(0,120),phoneHref:(link.getAttribute('href')||'').trim().slice(0,160),sessionId:session(),utm:utm()};send(JSON.stringify(payload))},true);
})();
