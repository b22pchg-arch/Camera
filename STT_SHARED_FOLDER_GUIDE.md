# Hướng dẫn dùng thư mục chia sẻ để chọn model STT

Bản PWA này cho phép nhập **đường dẫn thư mục chia sẻ** và chọn file model trong thư mục đó.

## Cách ổn định nhất: dùng file stt-models.json

Trong thư mục chứa model, tạo file `stt-models.json`:

```json
{
  "files": [
    {
      "name": "model-vn.tar.gz",
      "url": "model-vn.tar.gz",
      "size": 33554432
    },
    {
      "name": "ggml-tiny-q5_1.bin",
      "url": "ggml-tiny-q5_1.bin",
      "size": 32505856
    }
  ]
}
```

Sau đó trong app nhập link tới thư mục hoặc nhập thẳng link tới `stt-models.json`, bấm **QUÉT FILE**, chọn file, rồi bấm **DÙNG FILE** và **TẢI MODEL**.

## GitHub public folder

Có thể nhập link dạng:

```text
https://github.com/<user>/<repo>/tree/main/stt/models
```

App sẽ dùng GitHub API để đọc danh sách file và lấy `download_url`.

## Google Drive folder

Có thể nhập link thư mục Google Drive, nhưng để app tự liệt kê file cần có **Google Drive API key**. Nếu không có API key, hãy bấm **MỞ THƯ MỤC**, tải file về máy rồi dùng **CHỌN FILE**.

## OneDrive folder

PWA thường không thể liệt kê file trong thư mục OneDrive public nếu không dùng Graph API/auth/proxy. Nên dùng cách:

1. Bấm **MỞ THƯ MỤC**.
2. Tải file model về máy.
3. Quay lại app, bấm **CHỌN FILE** để lưu vào IndexedDB.

## Lưu ý

- Sau khi lưu vào IndexedDB, app dùng đường dẫn dạng `gsht-idb://ten-model` và có thể chạy offline.
- Nếu người dùng xóa dữ liệu trang web/PWA thì model trong IndexedDB sẽ mất, cần lưu lại.
