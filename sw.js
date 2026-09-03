const CACHE='frame-v275-field-safe';
const FRAME_CACHE_PREFIX='frame-v';
const ASSETS=[
  './',
  './index.html',
  './styles.css?v=262',
  './ai-chat.css?v=272',
  './app.js?v=275',
  './ai-chat.js?v=275',
  './ai-guard.js?v=275',
  './manifest.webmanifest?v=275',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

function isFrameCache(key){return String(key||'').startsWith(FRAME_CACHE_PREFIX)}
function bypassFrameServiceWorker(url){
  const path=url.pathname;
  return path==='/future'||path.startsWith('/future/')||path==='/frame-field'||path.startsWith('/frame-field/');
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>isFrameCache(key)&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='CLEAR_CACHES'){
    event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(isFrameCache).map(key=>caches.delete(key)))));
  }
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||bypassFrameServiceWorker(url))return;

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response&&response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put('./index.html',copy)).catch(()=>{});
          }
          return response;
        })
        .catch(async()=>await caches.match('./index.html')||Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(async()=>await caches.match(event.request)||Response.error())
  );
});
