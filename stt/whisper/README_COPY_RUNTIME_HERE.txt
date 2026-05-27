Đặt thêm các file sau vào chính thư mục này:

- whisper-worker.js              (đã có trong gói)
- libmain.js                     (copy từ whisper.cpp/build-em/bin/libmain.js)
- libmain.wasm                   (copy từ whisper.cpp/build-em/bin/libmain.wasm)
- ggml-tiny-q5_1.bin             (model đa ngôn ngữ tải từ Hugging Face, có thể lưu qua IndexedDB thay vì đặt file trực tiếp)

Không dùng model .en nếu cần tiếng Việt.
