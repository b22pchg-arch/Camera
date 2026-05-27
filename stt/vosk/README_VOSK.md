# Vosk runtime cho PWA

Thư mục này cần có:

- `vosk.js`: runtime vosk-browser WebAssembly.
- `model-vn.tar.gz`: model tiếng Việt nếu muốn đặt sẵn trong PWA. Không bắt buộc, vì app có thể tải/chọn model lần đầu rồi lưu IndexedDB.

## Tải vosk.js

Chạy một trong hai script tại thư mục gốc:

```powershell
.\tools\download_stt_assets.ps1
```

hoặc:

```bash
./tools/download_stt_assets.sh
```

Link thủ công:

```text
https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js
```

## Model tiếng Việt

Tải model chính thức tại:

```text
https://alphacephei.com/vosk/models
```

Nên dùng `vosk-model-small-vn-0.4` trước. Nếu chỉ có file ZIP, trong app dùng nút chọn ZIP Vosk để chuyển sang TAR.GZ và lưu nội bộ.
