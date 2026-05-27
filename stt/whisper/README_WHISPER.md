# Whisper offline local cho PWA

Thư mục này dành cho runtime Whisper chạy cục bộ trong trình duyệt/PWA.

Cần có ít nhất:

```text
stt/whisper/whisper-worker.js
stt/whisper/whisper.wasm
stt/whisper/ggml-tiny-q5_1.bin  (hoặc model tương thích khác)
```

Bản HTML đã gọi worker qua giao thức mô tả trong:

```text
stt/whisper/WHISPER_WORKER_PROTOCOL.md
```

Không nên dùng file `whisper-worker.js` giả. Worker phải tương thích với bản `whisper.wasm` và model đã chọn.

Khuyến nghị trên điện thoại: dùng model tiny/base quantized trước, vì Whisper nặng hơn Vosk nhiều.
