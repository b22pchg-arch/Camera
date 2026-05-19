// 🛠️ MẸO QUẢN LÝ CỦA ANH: Không cần sửa tên Cache cứng.
// Mỗi lần anh sửa code HTML xong đưa lên Host, anh chỉ cần vào đây gõ thêm hoặc sửa vài chữ 
// ở dòng bình luận ngày tháng này (Ví dụ đổi ngày: 19/05/2026). File sw.js thay đổi 1 byte là app bắt được.
// Nhật ký cập nhật: Bản vá lỗi đồng bộ và nút check thủ công - Ngày 19/05/2026

const CACHE_NAME = 'AirGapCamera-Static-Storage'; 

const ASSETS = [
    './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'qrcode.min.js',
  'bootstrap.min.css',
  'all.min.css',
  'bootstrap.bundle.min.js',
    'webfonts/fa-solid-900.woff2',  // <-- Khóa cứng file font icon hay dùng dưới hiện trường
    'webfonts/fa-regular-400.woff2' // <-- Khóa cứng file font icon hay dùng dưới hiện trường
];

// Cài đặt và tải tài nguyên
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Lệnh addAll khi chạy sẽ tự động kéo các file mới từ Server về ghi đè thẳng vào tên Cache cũ
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

// 🌟 CHIẾN LƯỢC ĐỘC QUYỀN HIỆN TRƯỜNG: 100% CACHE-FIRST (Tốc độ tối thượng)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Nếu tìm thấy file trong bộ nhớ đệm PWA, trả kết quả lập tức trong 0.01 giây, không màng tới mạng mạng
            if (cachedResponse) return cachedResponse;
            
            // Nếu là tài nguyên phát sinh ngoài danh mục (Ví dụ ảnh bản đồ từ OpenStreetMap trực tuyến)
            return fetch(event.request);
        })
    );
});
