/*
 * GSHT Whisper Worker adapter SAFE MODE for whisper.cpp WASM (libmain.js/libmain.wasm)
 * Place this file in: stt/whisper/whisper-worker.js
 * Required in the same folder:
 *   - libmain.js
 *   - libmain.wasm
 * Optional model path:
 *   - ggml-tiny-q5_1.bin (or use gsht-idb://... from the main app)
 *
 * Worker protocol used by GSHT PWA:
 *   init { modelPath, language='vi', task='transcribe', translate=false }
 *   start { sampleRate, language, task }
 *   audio { sampleRate, audio: Float32Array }
 *   stop
 *   transcribeFile { sampleRate, audio: Float32Array }
 */

var Module = null;
let runtimeReadyPromise = null;
let whisperInstance = null;
let modelLoaded = false;
let currentLanguage = 'vi';
let currentTask = 'transcribe';
let currentTranslate = false;
let currentThreads = 1;
let micChunks = [];
let micSamples = 0;
let isMicMode = false;
let isProcessing = false;
let pendingStop = false;
const TARGET_SAMPLE_RATE = 16000;
const MIC_SEGMENT_SECONDS = 8; // safe mode: short chunks reduce mobile WASM memory pressure

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function toErrorMessage(err) {
  return err && err.message ? err.message : String(err || 'Unknown error');
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function getAsciiHeader(u8, n = 8) {
  try {
    return Array.from(u8.slice(0, n)).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
  } catch (_) { return ''; }
}

function looksLikeWhisperModel(u8) {
  if (!u8 || u8.length < 16) return false;
  const head4 = getAsciiHeader(u8, 4).toLowerCase();
  const head8 = getAsciiHeader(u8, 8).toLowerCase();
  if (head4 === 'ggml' || head4 === 'ggmf' || head4 === 'ggjt' || head4 === 'gguf') return true;
  if (head4.startsWith('<!do') || head4.startsWith('<htm') || head4.startsWith('pk..') || head8.startsWith('{')) return false;
  return true;
}

function joinFloat32(chunks, totalSamples) {
  const out = new Float32Array(totalSamples);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.length;
  }
  return out;
}

function resampleFloat32(input, fromRate, toRate = TARGET_SAMPLE_RATE) {
  fromRate = Number(fromRate || toRate);
  if (!input || !input.length || Math.abs(fromRate - toRate) < 1) return input;
  const ratio = fromRate / toRate;
  const newLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function cleanWhisperOutput(lines, ret) {
  const all = [];
  if (Array.isArray(lines)) all.push(...lines);
  if (typeof ret === 'string' && ret.trim()) all.push(ret);

  const cleaned = all
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .filter(line => !/^whisper_/i.test(line))
    .filter(line => !/^main:/i.test(line))
    .filter(line => !/^system_info/i.test(line))
    .filter(line => !/^storeFS:/i.test(line))
    .filter(line => !/^js:/i.test(line))
    .filter(line => !/^\[[A-Z]+\]/.test(line))
    .map(line => line.replace(/^\[[0-9:.\s\-\>]+\]\s*/g, '').trim())
    .filter(Boolean);

  // Remove duplicated adjacent lines and join readable transcript lines.
  const uniq = [];
  for (const line of cleaned) {
    if (uniq[uniq.length - 1] !== line) uniq.push(line);
  }
  return uniq.join('\n').trim();
}

async function ensureRuntime() {
  if (runtimeReadyPromise) return runtimeReadyPromise;

  runtimeReadyPromise = new Promise((resolve, reject) => {
    try {
      const runtimeJs = self.__gshtRuntimeJs || 'libmain.js';
      Module = {
        // Safe mode: keep runtime close to official whisper.wasm demo; do not set noInitialRun.
        print: (text) => post('log', { message: String(text || '') }),
        printErr: (text) => post('log', { message: String(text || '') }),
        setStatus: (text) => post('progress', { message: String(text || '') }),
        monitorRunDependencies: () => {},
        locateFile: (path) => {
          const p = String(path || '');
          if (p.endsWith('.wasm')) return self.__gshtWasmFile || 'libmain.wasm';
          return p;
        },
        onRuntimeInitialized: () => {
          try {
            if (!Module.init || !Module.full_default) {
              reject(new Error('Runtime đã tải nhưng thiếu Module.init hoặc Module.full_default. Hãy dùng đúng libmain.js/libmain.wasm từ ví dụ whisper.wasm.'));
              return;
            }
            post('progress', { message: 'Whisper WASM runtime đã sẵn sàng.' });
            resolve(Module);
          } catch (e) { reject(e); }
        }
      };
      self.Module = Module;
      importScripts(runtimeJs);
      // Some builds initialize synchronously.
      setTimeout(() => {
        if (Module && Module.calledRun && Module.init && Module.full_default) resolve(Module);
      }, 0);
    } catch (e) {
      reject(new Error('Không tải được libmain.js/libmain.wasm trong stt/whisper. Chi tiết: ' + toErrorMessage(e)));
    }
  });
  return runtimeReadyPromise;
}

async function fetchArrayBuffer(path) {
  const url = normalizePath(path);
  post('progress', { message: 'Đang tải model Whisper: ' + url });
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error('Không tải được model Whisper từ ' + url + ' - HTTP ' + res.status);
  return await res.arrayBuffer();
}

async function loadModel(modelPath, modelBuffer) {
  const M = await ensureRuntime();
  if (modelLoaded && whisperInstance) return;
  if (!modelPath && !modelBuffer) throw new Error('Chưa có đường dẫn hoặc dữ liệu model Whisper .bin');

  const ab = modelBuffer ? modelBuffer : await fetchArrayBuffer(modelPath);
  const buf = new Uint8Array(ab);
  if (!buf.length) throw new Error('File model Whisper rỗng hoặc tải lỗi.');
  const head = getAsciiHeader(buf, 12);
  if (!looksLikeWhisperModel(buf)) {
    throw new Error('File model Whisper không đúng định dạng .bin ggml/gguf. Phần đầu file: "' + head + '". Có thể anh đã chọn nhầm file, tải nhầm trang HTML, file ZIP, hoặc link HuggingFace/Drive chưa phải link tải trực tiếp.');
  }
  post('progress', { message: 'Kiểm tra model Whisper: header=' + head + ', size=' + (buf.length / 1024 / 1024).toFixed(1) + ' MB' });

  try { M.FS_unlink('/whisper.bin'); } catch (_) {}
  try { M.FS_unlink('whisper.bin'); } catch (_) {}
  M.FS_createDataFile('/', 'whisper.bin', buf, true, true);
  post('progress', { message: 'Đã đưa model vào FS WASM: ' + (buf.length / 1024 / 1024).toFixed(1) + ' MB' });

  try {
    whisperInstance = M.init('whisper.bin');
  } catch (e) {
    throw new Error('Module.init("whisper.bin") bị abort/lỗi native. Hãy thử model tiny-q5_1, build libmain single-thread, và dùng đoạn âm thanh 5-10 giây. Chi tiết: ' + toErrorMessage(e));
  }
  if (!whisperInstance) throw new Error('Module.init("whisper.bin") thất bại. Kiểm tra model .bin có đúng định dạng ggml/whisper.cpp không.');
  modelLoaded = true;
}

function runWhisper(audioFloat32, sampleRate, language, translate, sourceLabel = 'audio') {
  if (!modelLoaded || !whisperInstance) throw new Error('Whisper chưa khởi tạo model.');
  const M = Module;
  const src = audioFloat32 instanceof Float32Array ? audioFloat32 : new Float32Array(audioFloat32 || []);
  if (!src.length) throw new Error('Không có dữ liệu âm thanh để bóc băng.');
  const audio16 = resampleFloat32(src, sampleRate || TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE);

  const captured = [];
  const oldPrint = M.print;
  const oldErr = M.printErr;
  M.print = (text) => { const s = String(text || ''); captured.push(s); post('log', { message: s }); };
  M.printErr = (text) => { const s = String(text || ''); captured.push(s); post('log', { message: s }); };

  post('progress', { message: 'Whisper đang xử lý ' + sourceLabel + ' (' + (audio16.length / TARGET_SAMPLE_RATE).toFixed(1) + ' giây)...' });
  let ret = null;
  try {
    ret = M.full_default(whisperInstance, audio16, language || currentLanguage || 'vi', 1, !!translate);
  } catch (e) {
    throw new Error('Module.full_default() bị abort/lỗi native khi xử lý âm thanh. Hãy thử audio 5-10 giây, model tiny-q5_1, và bản libmain build single-thread. Chi tiết: ' + toErrorMessage(e));
  } finally {
    M.print = oldPrint;
    M.printErr = oldErr;
  }
  const text = cleanWhisperOutput(captured, ret);
  return text || (typeof ret === 'string' ? ret : '');
}

async function processMicBuffer(force = false) {
  if (isProcessing) return;
  const minSamples = TARGET_SAMPLE_RATE * MIC_SEGMENT_SECONDS;
  if (!force && micSamples < minSamples) return;
  if (!micSamples) return;

  isProcessing = true;
  const chunks = micChunks;
  const total = micSamples;
  micChunks = [];
  micSamples = 0;
  try {
    const audio = joinFloat32(chunks, total);
    const text = runWhisper(audio, TARGET_SAMPLE_RATE, currentLanguage, currentTranslate, 'đoạn micro');
    if (text && text.trim()) post('result', { text: text.trim() });
    else post('partial', { text: 'Whisper chưa nhận được nội dung rõ ràng trong đoạn vừa xử lý.' });
  } catch (e) {
    post('error', { message: toErrorMessage(e) });
  } finally {
    isProcessing = false;
    if (pendingStop) {
      pendingStop = false;
      await processMicBuffer(true);
      post('final', { text: '' });
    }
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'init') {
      currentLanguage = msg.language || 'vi';
      currentTask = msg.task || 'transcribe';
      currentTranslate = !!msg.translate;
      currentThreads = 1; // safe mode: force single-thread to avoid SharedArrayBuffer/COI aborts on PWA mobile
      self.__gshtRuntimeJs = msg.runtimeJs || 'libmain.js';
      self.__gshtWasmFile = msg.wasmFile || 'libmain.wasm';
      await loadModel(msg.modelPath || msg.originalModelPath, msg.modelBuffer || null);
      post('inited', { message: 'Whisper đã nạp xong model và sẵn sàng.' });
      return;
    }

    if (msg.type === 'start') {
      currentLanguage = msg.language || currentLanguage || 'vi';
      currentTask = msg.task || currentTask || 'transcribe';
      currentTranslate = msg.translate != null ? !!msg.translate : currentTranslate;
      isMicMode = true;
      micChunks = [];
      micSamples = 0;
      pendingStop = false;
      post('ready', { message: 'Whisper bắt đầu nhận âm thanh. Kết quả sẽ trả về theo từng đoạn ' + MIC_SEGMENT_SECONDS + ' giây.' });
      return;
    }

    if (msg.type === 'audio') {
      if (!isMicMode) return;
      const input = msg.audio instanceof Float32Array ? msg.audio : new Float32Array(msg.audio || []);
      const audio16 = resampleFloat32(input, msg.sampleRate || TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE);
      micChunks.push(audio16);
      micSamples += audio16.length;
      if (micSamples >= TARGET_SAMPLE_RATE * MIC_SEGMENT_SECONDS) processMicBuffer(false);
      else post('partial', { text: 'Đang gom âm thanh cho Whisper: ' + (micSamples / TARGET_SAMPLE_RATE).toFixed(1) + '/' + MIC_SEGMENT_SECONDS + ' giây' });
      return;
    }

    if (msg.type === 'stop') {
      if (isProcessing) pendingStop = true;
      else await processMicBuffer(true);
      isMicMode = false;
      post('final', { text: '' });
      return;
    }

    if (msg.type === 'transcribeFile') {
      const input = msg.audio instanceof Float32Array ? msg.audio : new Float32Array(msg.audio || []);
      const text = runWhisper(input, msg.sampleRate || TARGET_SAMPLE_RATE, msg.language || currentLanguage || 'vi', !!msg.translate, 'file âm thanh');
      post('result', { text: text || 'Không nhận được nội dung từ file âm thanh.' });
      return;
    }

    post('log', { message: 'Bỏ qua lệnh worker không xác định: ' + msg.type });
  } catch (e) {
    post('error', { message: toErrorMessage(e) });
  }
};

post('worker-ready', { message: 'whisper-worker.js SAFE MODE đã tải. Chờ lệnh init... Threads=1, đoạn micro=8 giây.' });
