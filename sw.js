// Cache léger de l'application : réseau d'abord, cache en secours hors ligne.
const CACHE = 'tandem-v24';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/program.js', '/exercises.js', '/animations.js', '/frigo.js', '/breath.js', '/manifest.webmanifest', '/icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Toujours demander la dernière version au serveur (sans passer par le cache du navigateur).
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
});

// Notifications push
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Tandem Forme', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Tandem Forme', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag, data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin)) { c.postMessage({ go: new URL(url).searchParams.get('go') || 'today' }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
