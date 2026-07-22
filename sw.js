const CACHE_NAME = 'trip-planner-v51'; // mobile: global 16px form-control floor (no iOS zoom) + category tag never wraps
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon128.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 只處理同網域的請求，Firebase API 一律走網路（不快取，確保資料即時）
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // 改為「網路優先」策略：先試著拿最新版本，網路失敗時才退回快取（離線可用）。
  // 之前用「快取優先」會導致 app.js 更新後手機永遠抓不到新版，只能等快取自然過期。
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return res;
    }).catch(() => caches.match(event.request))
  );
});
