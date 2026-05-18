// TỰ ĐỘNG lấy số phiên bản từ tham số URL truyền vào
const params = new URL(self.location).searchParams;
const VERSION = params.get('v') || '1.0.0'; 
const CACHE_NAME = 'AirGapCamera-v' + VERSION; // Kết quả tự động sinh ra: 'AirGapCamera-v53.2'

const ASSETS = [
    './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'
];

// Cài đặt và lưu vào bộ nhớ cache tĩnh
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Lắng nghe lệnh kích hoạt cưỡng bách từ giao diện chính
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

// TỰ ĐỘNG dọn dẹp các bản Cache cũ khi bản mới được kích hoạt
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('🧹 Đã xóa bộ nhớ Cache cũ:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Chiến lược lấy dữ liệu (Fetch)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
