// GSHT PWA Service Worker - update-check fixed, cache app shell, không cache model STT lớn mặc định
const GSHT_CACHE = 'gsht-pwa-v72-update-check-fixed-202605271457';
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
      // Không gọi skipWaiting tự động để nút NÂNG CẤP trong app hoạt động đúng.
  );
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(GSHT_CACHE)
      .then(cache => Promise.allSettled(
        APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })))
      ))
      // Không gọi skipWaiting tự động để nút NÂNG CẤP trong app hoạt động đúng.
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

function isLargeModelRequest(url) {
  return /\.(tar\.gz|tgz|zip|bin|wasm)$/i.test(url.pathname) && /stt|model|vosk|whisper/i.test(url.pathname + url.search);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Model STT lớn: để app tự tải và lưu IndexedDB; không ép cache ở SW để tránh đầy Cache Storage.
  if (isLargeModelRequest(url)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // HTML/navigation: network-first để nhận bản mới nhanh, fallback cache/offline.
  if (event.request.mode === 'navigate' || /index\.html$/i.test(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(GSHT_CACHE).then(cache => cache.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html')))
    );
    return;
  }

  // Asset nhỏ: cache-first, update nền.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res && res.ok) caches.open(GSHT_CACHE).then(cache => cache.put(event.request, res.clone()));
        return res;
      }).catch(() => cached || caches.match('./offline.html'));
      return cached || network;
    })
  );
});
