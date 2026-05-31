// GSHT PWA cache update V95 - full-mode main capture buttons
// GSHT PWA Service Worker - SAFE UPDATE BUILD
// Bản này ưu tiên ổn định cập nhật PWA. Không ép COOP/COEP trong Service Worker
// vì GitHub Pages/PWA mobile có thể làm Service Worker update fail hoặc Whisper abort khó kiểm soát.
const GSHT_CACHE = 'gsht-pwa-v119-v117-plus-exiftool-safe-loader-link';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './2FA.html',
  './bootstrap.min.css',
  './bootstrap.bundle.min.js',
  './all.min.css',
  './qrcode.min.js',
  './jsQR.min.js',
  './fflate.min.js',
  './exifreader.min.js',
  './exifr.full.umd.js',
  './mp4box.all.min.js',
  './exiftool_wasm_tool_v119_safe_loader.html',
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


function isExifToolStandalonePage(url) {
  return /exiftool_wasm_tool_v119_safe_loader\.html$/i.test(url.pathname);
}

function isLargeOptionalWasmAsset(url) {
  return /\.(wasm|zip|data|mem)$/i.test(url.pathname) && /exiftool|zeroperl|perl|wasm/i.test(url.pathname + url.search);
}

function bytesToHex(arr) {
  return Array.from(arr || []).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

async function assertOptionalBinaryResponse(request, url) {
  const response = await fetch(request, { cache: 'no-store' });
  if (!response || !response.ok) {
    throw new Error('Không tải được asset tùy chọn: HTTP ' + (response && response.status));
  }
  const buf = await response.clone().arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 16));
  const textHead = new TextDecoder().decode(head).trim();
  const isHtml = /^<!doctype|^<html/i.test(textHead);
  if (/\.wasm$/i.test(url.pathname)) {
    const ok = head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d;
    if (!ok || isHtml) throw new Error('WASM sai định dạng. Header=' + bytesToHex(head.slice(0, 4)) + '. Có thể server đang trả HTML/404 thay vì file .wasm.');
    return new Response(buf, { status: response.status, statusText: response.statusText, headers: {'Content-Type':'application/wasm','Cache-Control':'no-store'} });
  }
  if (/\.zip$/i.test(url.pathname)) {
    const ok = head[0] === 0x50 && head[1] === 0x4b;
    if (!ok || isHtml) throw new Error('ZIP sai định dạng. Có thể server đang trả HTML/404 thay vì file .zip.');
    return new Response(buf, { status: response.status, statusText: response.statusText, headers: {'Content-Type':'application/zip','Cache-Control':'no-store'} });
  }
  if (isHtml) throw new Error('Asset tùy chọn trả về HTML, không phải dữ liệu nhị phân.');
  return new Response(buf, { status: response.status, statusText: response.statusText, headers: {'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream','Cache-Control':'no-store'} });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // ExifTool WASM/ZIP/DATA: không cache và tuyệt đối không trả fallback HTML.
  if (isLargeOptionalWasmAsset(url)) {
    event.respondWith(
      assertOptionalBinaryResponse(event.request, url).catch(err => new Response(String(err && err.message || err), {
        status: 404,
        headers: {'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'}
      }))
    );
    return;
  }

  // Trang ExifTool riêng: cache theo đúng tên file, không ghi đè cache index.html.
  if (isExifToolStandalonePage(url)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(GSHT_CACHE).then(cache => cache.put('./exiftool_wasm_tool_v119_safe_loader.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./exiftool_wasm_tool_v119_safe_loader.html').then(r => r || caches.match('./offline.html')))
    );
    return;
  }

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

// GSHT V119: standalone ExifTool safe loader; never return HTML fallback for WASM/ZIP/DATA assets.
