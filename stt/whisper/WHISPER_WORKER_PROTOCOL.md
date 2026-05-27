# Giao thức `stt/whisper/whisper-worker.js` cho PWA

File HTML đã gọi Whisper qua Web Worker ở đường dẫn mặc định:

```text
stt/whisper/whisper-worker.js
```

Worker thật cần hỗ trợ các message sau:

## 1. Khởi tạo

Main thread gửi:

```js
{
  type: "init",
  modelPath: "blob:... hoặc stt/whisper/ggml-tiny-q5_1.bin",
  originalModelPath: "gsht-idb://whisper-tiny hoặc stt/whisper/ggml-tiny-q5_1.bin",
  wasmPath: "stt/whisper/whisper.wasm",
  language: "vi",
  task: "transcribe",
  translate: false
}
```

Worker trả về một trong các dạng:

```js
{ type: "ready" }
```

hoặc:

```js
{ type: "error", message: "..." }
```

## 2. Nghe micro theo đoạn

Main thread gửi:

```js
{ type: "start", sampleRate: 16000, language: "vi", task: "transcribe" }
{ type: "audio", sampleRate: 16000, audio: Float32Array }
{ type: "stop" }
```

Worker có thể trả:

```js
{ type: "partial", text: "..." }
{ type: "result", text: "..." }
{ type: "progress", progress: 50, message: "Đang xử lý..." }
{ type: "error", message: "..." }
```

## 3. Bóc băng từ file audio đã ghi

Main thread gửi:

```js
{ type: "transcribeFile", sampleRate: 44100, audio: Float32Array }
```

Worker trả:

```js
{ type: "result", text: "nội dung" }
```

## Ghi chú

Không nên đặt file giả tên `whisper-worker.js` nếu chưa có runtime thật. Nếu đặt file giả, app có thể khởi tạo worker nhưng sẽ không nhận dạng được.
