// アプリの「外側」(画面の部品)だけを保存して起動を速くする。売上などのデータは一切保存しない。
const CACHE = 'kate-shell-v5';
const SHELL = ['./', './index.html', './css/app.css', './js/main.js', './js/config.js', './js/api.js', './js/auth.js', './js/engine.js', './js/ui.js',
  './js/screens/home.js', './js/screens/sales.js', './js/screens/analysis.js', './js/screens/profit.js', './js/screens/cash.js', './js/screens/maint.js', './js/screens/incentive.js', './manifest.webmanifest', './icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/data/')) return; // データ・他サイトは素通し
  // 新しい版があればそれを使い、つながらない時だけ保存分を使う
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
