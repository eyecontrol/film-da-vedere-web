/* Service worker della versione web: l'app si apre anche senza rete.
   Prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata. */
const CACHE = 'fdv-0-mv4a16jp';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r, c)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match('./')))
  );
});
