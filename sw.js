// GSHT PWA cache update V91 - camera display optimization, no crop preview
// GSHT PWA Service Worker - SAFE UPDATE BUILD
// Bản này ưu tiên ổn định cập nhật PWA. Không ép COOP/COEP trong Service Worker
// vì GitHub Pages/PWA mobile có thể làm Service Worker update fail hoặc Whisper abort khó kiểm soát.
const GSHT_CACHE = 'gsht-pwa-v94-camerafullfarme';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './bootstrap.min.css',
  './bootstrap.bundle.min.js',
  './all.min.css',
  './qrcode.min.js',
  './jsQR.min.js',
  './fflate.min.js',
  './stt/vosk/vosk.js',
  './stt/whisper/whisper-worker.js',
  './stt/whisper/gsht-whisper-worker-runner.js',
  './icon-192.png',
  './icon-512.png',
  'webfonts/fa-solid-900.woff2',  // <-- Khóa cứng file font icon hay dùng dưới hiện trường
  'webfonts/fa-regular-400.woff2'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(GSHT_CACHE).then(cache => {
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })))
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('gsht-pwa-') && key !== GSHT_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.action === 'skipWaiting') self.skipWaiting();
});

function isLargeModelRequest(url) {
  return /\.(tar\.gz|tgz|zip|bin)$/i.test(url.pathname) && /stt|model|vosk|whisper/i.test(url.pathname + url.search);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Model lớn: không ép Cache Storage; app tự lưu IndexedDB.
  if (isLargeModelRequest(url)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // HTML/navigation: network-first để cập nhật chủ động lấy bản mới.
  if (event.request.mode === 'navigate' || /index\.html$/i.test(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(GSHT_CACHE).then(cache => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html')))
    );
    return;
  }

  // Asset nhỏ: cache-first + cập nhật nền.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        fetch(event.request)
          .then(response => {
            if (response && response.ok) {
              caches.open(GSHT_CACHE).then(cache => cache.put(event.request, response.clone())).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            caches.open(GSHT_CACHE).then(cache => cache.put(event.request, response.clone())).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('./offline.html'));
    })
  );
});

// GSHT V85 record temp audio + adaptive Whisper chunks

// GSHT V87 cache bump: stt advanced hidden fix

// GSHT V88: video full-frame quality sync + photo-style video footer

// GSHT V91: camera display optimization - default no crop, real aspect ratio preview.
