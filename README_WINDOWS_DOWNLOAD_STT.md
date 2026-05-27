# Tải STT assets trên Windows khi PowerShell bị chặn

Nếu chạy:

```powershell
.\tools\download_stt_assets.ps1
```

và gặp lỗi `running scripts is disabled on this system`, hãy dùng một trong các cách sau.

## Cách khuyến nghị: dùng file BAT

Mở thư mục gốc PWA, rồi chạy:

```cmd
tools\download_stt_assets.bat
```

Hoặc double-click file:

```text
tools\download_stt_assets.bat
```

File này tải:

```text
stt\vosk\vosk.js
fflate.min.js
```

## Cách chạy PowerShell chỉ một lần, không đổi chính sách lâu dài

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\download_stt_assets.ps1
```

## Cách bỏ khóa cho riêng file script đã tải

```powershell
Unblock-File .\tools\download_stt_assets.ps1
.\tools\download_stt_assets.ps1
```

## Không khuyến nghị nếu không cần

Không nên đổi chính sách PowerShell toàn hệ thống nếu chỉ cần chạy script này một lần.
