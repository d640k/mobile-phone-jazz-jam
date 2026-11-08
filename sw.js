// Minimal service worker: makes the app installable and lets it open offline.
// Network-first, so updates show up right away; the cache is only a fallback.
const CACHE='jazzjam-v27';   // keep in step with ?v= in index.html
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(new URL(e.request.url).origin!==self.location.origin)return;   // never cache Google sign-in or Drive traffic
  e.respondWith(
    // cache:'no-cache' asks the server whether each file changed, so a new index.html never
    // runs with an old script from the browser's HTTP cache
    fetch(new Request(e.request.url,{cache:'no-cache',credentials:'same-origin'})).then(r=>{
      if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
      return r;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}))
  );
});
