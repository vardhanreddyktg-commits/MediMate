const CACHE = 'medimate-v2';
const FILES = ['./', 'index.html', 'style.css', 'script.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
// Network first, so edits show up while developing. Falls back to the cache when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
// Buttons on the notification (Taken, Snooze) and taps on the notification itself.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, act = e.action;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const msg = { type: 'dose-action', action: act, medId: d.medId, t: d.t, date: d.date };
    if (list.length) { if (act) list[0].postMessage(msg); return list[0].focus(); }
    const url = 'index.html' + (act ? '?act=' + act + '&m=' + encodeURIComponent(d.medId) + '&t=' + encodeURIComponent(d.t) + '&d=' + d.date : '');
    return self.clients.openWindow(url);
  }));
});