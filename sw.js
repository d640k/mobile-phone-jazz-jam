// Minimal service worker: makes the app installable and lets it open offline.
// Network-first, so updates show up right away; the cache is only a fallback.
const CACHE='jazzjam-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
      return r;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}))
  );
});
