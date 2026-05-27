# Whisper runtime cho PWA

Thư mục này dành cho Whisper chạy trong trình duyệt bằng WebAssembly.

Cần có nếu muốn bật Whisper:

- `whisper-worker.js`
- `whisper.wasm`
- model dạng `ggml-*.bin`, ví dụ `ggml-tiny-q5_1.bin`

Không có một file `whisper-worker.js` chuẩn duy nhất cho mọi dự án. Worker phải khớp với bản build `whisper.wasm` của `whisper.cpp` hoặc wrapper WASM mà anh chọn. Vì vậy gói PWA này không tạo file giả để tránh báo chạy được nhưng thực tế không nhận dạng.

Nguồn tham khảo:

- Demo browser: https://ggml.ai/whisper.cpp/
- Source whisper.cpp: https://github.com/ggml-org/whisper.cpp
- Model ggml: https://huggingface.co/ggerganov/whisper.cpp/tree/main

Khuyến nghị hiện trường: dùng Vosk trước. Whisper chỉ nên bật trên máy Android mạnh hoặc khi đã có bản worker/wasm đã kiểm thử.
