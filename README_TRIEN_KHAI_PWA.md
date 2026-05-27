# GSHT PWA - Gói triển khai hoàn chỉnh

## 1. Cấu trúc bắt buộc
Đưa toàn bộ thư mục này lên HTTPS hoặc máy chủ nội bộ có HTTPS:

- `index.html`: phần mềm chính.
- `manifest.json`: cấu hình cài PWA.
- `sw.js`: Service Worker chạy offline/cache-first.
- `offline.html`: trang dự phòng khi chưa cache đủ.
- `bootstrap.min.css`, `bootstrap.bundle.min.js`, `all.min.css`: thư viện giao diện/icon đang dùng bởi HTML.
- `qrcode.min.js`, `jsQR.min.js`: QR phát/đọc.
- `fflate.min.js`: dùng để chuyển ZIP chính thức của Vosk sang `model.tar.gz` ngay trong PWA.
- `icon-192.png`, `icon-512.png`: icon PWA.

Gói này có sẵn `index.html`, `manifest.json`, `sw.js`, `offline.html`, icon và thư mục hướng dẫn. Các thư viện `.css/.js` nhỏ nếu anh đã có ở dự án cũ thì copy vào cùng thư mục.

## 2. Tải thư viện nhỏ cần đặt kèm
Không mở trực tiếp `file:///`. Hãy chạy qua HTTPS hoặc localhost.

Các file cần tải thủ công nếu thư mục chưa có:

- `bootstrap.min.css`
- `bootstrap.bundle.min.js`
- `all.min.css`
- `qrcode.min.js`
- `jsQR.min.js`
- `fflate.min.js`

Link fflate:
`https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js`
Lưu tên file là `fflate.min.js`.

## 3. Model STT offline
Không đưa model lớn vào GitHub repo. Người dùng tải/chọn model lần đầu trong app:

- Vào Máy Ảnh → Tiện ích mở rộng → Bóc băng độc lập.
- Nhập URL ngoài hoặc bấm CHỌN FILE / ZIP VOSK.
- Nếu chọn ZIP Vosk chính thức, app sẽ chuyển ZIP → TAR.GZ bằng `fflate.min.js` rồi lưu vào IndexedDB.
- Sau khi lưu, đường dẫn model trong app sẽ là `gsht-idb://vosk-vn-small`.

## 4. Triển khai

### Local test
Dùng Python:
```bash
python -m http.server 8080
```
Mở:
`http://localhost:8080`

### Máy chủ thật
Nên dùng HTTPS. Sau đó mở app, vào tab Đồng Bộ → Triển khai PWA offline hoàn chỉnh → KIỂM TRA FILE PWA.

## 5. Kiểm thử offline

1. Mở app khi có mạng.
2. Bấm Kiểm tra bản cập nhật mới.
3. Vào Đồng Bộ → KIỂM TRA FILE PWA.
4. Cài PWA/Thêm vào màn hình chính.
5. Tải/chọn model STT lần đầu nếu cần bóc băng offline.
6. Bật chế độ máy bay.
7. Mở lại app, thử camera, xem ảnh, QR, lưu cấu hình và STT offline.

## Bổ sung STT runtime

Gói này có sẵn thư mục và script tải runtime STT:

```text
tools/download_stt_assets.ps1
tools/download_stt_assets.sh
stt/vosk/README_VOSK.md
stt/whisper/README_WHISPER.md
STT_ASSETS_REQUIRED.md
```

Chạy script để tải `stt/vosk/vosk.js` và `fflate.min.js`. Model lớn không commit vào GitHub; dùng nút tải/chọn model trong app để lưu vào IndexedDB.

## Bổ sung: chọn model từ thư mục chia sẻ

Trong mục **Nhận dạng tiếng Việt offline**, app có khung **Chọn model từ thư mục chia sẻ / kho model**.

Ưu tiên triển khai bằng `stt-models.json` để PWA đọc danh sách file ổn định nhất. Xem `STT_SHARED_FOLDER_GUIDE.md` và `stt-models.sample.json`.
