(()=>{
  const BUILD='2.8.12';
  const CACHE_PREFIX='frame-v';
  function fixBadge(){
    document.querySelectorAll('.aiBadge').forEach(el=>{
      if(el.textContent!=='FRAME · '+BUILD)el.textContent='FRAME · '+BUILD;
    });
  }
  const observer=new MutationObserver(fixBadge);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('pageshow',()=>{fixBadge();navigator.serviceWorker?.getRegistration?.().then(r=>r?.update?.()).catch(()=>{})});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){fixBadge();navigator.serviceWorker?.getRegistration?.().then(r=>r?.update?.()).catch(()=>{})}});
  setTimeout(fixBadge,0);
  setTimeout(fixBadge,600);
  window.FRAME_PUBLISHED_BUILD=BUILD;
})();
