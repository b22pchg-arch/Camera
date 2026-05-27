# Các file STT cần bổ sung

Gói này không kèm model lớn và không kèm runtime Whisper build sẵn.

## Bắt buộc nếu dùng Vosk

```text
stt/vosk/vosk.js
```

Tải bằng script trên Windows:

```cmd
tools\download_stt_assets.bat
```

Hoặc bằng PowerShell nếu máy cho phép:

```powershell
.\tools\download_stt_assets.ps1
```

hoặc thủ công từ:

```text
https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js
```

Model Vosk có thể:

1. Chọn file ZIP chính thức trong app rồi app tự chuyển/lưu nội bộ.
2. Nhập link ngoài Google Drive/OneDrive/Release rồi bấm tải model.
3. Đặt sẵn file `stt/vosk/model-vn.tar.gz` nếu triển khai nội bộ.

## Bắt buộc nếu dùng chức năng ZIP → TAR.GZ trong PWA

```text
fflate.min.js
```

Tải bằng script ở trên hoặc từ:

```text
https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
```

## Nếu dùng Whisper

Cần bổ sung:

```text
stt/whisper/whisper-worker.js
stt/whisper/whisper.wasm
stt/whisper/ggml-tiny-q5_1.bin
```

Whisper trong browser nặng hơn Vosk và cần bản worker khớp với WASM. Không nên dùng file worker giả.
