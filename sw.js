// GSHT PWA Service Worker - SAFE UPDATE BUILD
// Bản này ưu tiên ổn định cập nhật PWA. Không ép COOP/COEP trong Service Worker
// vì GitHub Pages/PWA mobile có thể làm Service Worker update fail hoặc Whisper abort khó kiểm soát.
const GSHT_CACHE = 'gsht-pwa-v74-safe-update-20260527';
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
  './icon-192.png',
  './icon-512.png',
  'webfonts/fa-solid-900.woff2',  // <-- Khóa cứng file font icon hay dùng dưới hiện trường
  'webfonts/fa-regular-400.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(GSHT_CACHE)
      .then(cache => Promise.allSettled(
        APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })))
      ))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('gsht-pwa-') && k !== GSHT_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') self.skipWaiting();
});

function isSameOrigin(url) {
  try { return url.origin === self.location.origin; } catch (_) { return false; }
}

function addCrossOriginIsolationHeaders(response, requestUrl) {
  if (!response) return response;
  const url = new URL(requestUrl || self.location.href);
  // Chỉ thêm header cho tài nguyên cùng origin của app. Tài nguyên ngoài như model từ Drive/HF giữ nguyên CORS của nguồn.
  if (!isSameOrigin(url)) return response;

  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isLargeModelRequest(url) {
  return /\.(tar\.gz|tgz|zip|bin)$/i.test(url.pathname) && /stt|model|vosk|whisper/i.test(url.pathname + url.search);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Model STT lớn: app tự tải và lưu IndexedDB; không ép Cache Storage.
  if (isLargeModelRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then(res => addCrossOriginIsolationHeaders(res, event.request.url))
        .catch(() => caches.match(event.request).then(r => r ? addCrossOriginIsolationHeaders(r, event.request.url) : r))
    );
    return;
  }

  // HTML/navigation: network-first để nhận bản mới, nhưng luôn thêm COOP/COEP.
  if (event.request.mode === 'navigate' || /index\.html$/i.test(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(GSHT_CACHE).then(cache => cache.put('./index.html', copy));
        return addCrossOriginIsolationHeaders(res, event.request.url);
      }).catch(() => caches.match('./index.html')
        .then(r => r || caches.match('./offline.html'))
        .then(r => r ? addCrossOriginIsolationHeaders(r, event.request.url) : r))
    );
    return;
  }

  // Asset nhỏ: cache-first, update nền, luôn thêm COOP/COEP cho tài nguyên cùng origin.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // cập nhật nền nhưng trả cache ngay
        fetch(event.request).then(res => {
          if (res && res.ok) caches.open(GSHT_CACHE).then(cache => cache.put(event.request, res.clone()));
        }).catch(() => {});
        return addCrossOriginIsolationHeaders(cached, event.request.url);
      }
      return fetch(event.request).then(res => {
        if (res && res.ok) caches.open(GSHT_CACHE).then(cache => cache.put(event.request, res.clone()));
        return addCrossOriginIsolationHeaders(res, event.request.url);
      }).catch(() => caches.match('./offline.html').then(r => r ? addCrossOriginIsolationHeaders(r, event.request.url) : r));
    })
  );
});

