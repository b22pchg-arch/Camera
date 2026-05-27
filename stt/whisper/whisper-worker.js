/*
 * GSHT Whisper Worker - DEMO COMPATIBLE MODE
 *
 * Place this file as: stt/whisper/whisper-worker.js
 * Required beside it:
 *   - libmain.js      (from whisper.cpp examples/whisper.wasm build)
 *   - libmain.wasm    (matching libmain.js)
 *
 * This worker follows the same runtime flow that worked in the official demo:
 *   FS_createDataFile('/', 'whisper.bin', model, true, true)
 *   Module.init('whisper.bin')
 *   Module.full_default(instance, Float32Array, 'vi', 1, false)
 *
 * It also cache-busts libmain.js/libmain.wasm to avoid Service Worker/browser using old runtime.
 */

var Module;
let runtimePromise = null;
let whisperInstance = null;
let modelReady = false;
let currentLanguage = 'vi';
let currentTranslate = false;
let micChunks = [];
let micSamples = 0;
let micMode = false;
let processing = false;
let stopAfterProcessing = false;

const TARGET_SAMPLE_RATE = 16000;
const MIC_SEGMENT_SECONDS = 6; // closer to the successful 5-second demo test
const RUNTIME_VERSION = 'gsht-demo-compatible-20260527-v1';

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function msgOf(err) {
  return err && err.message ? err.message : String(err || 'Unknown error');
}

function safeText(s) {
  return String(s == null ? '' : s);
}

function asciiHead(u8, n = 8) {
  try {
    return Array.from(u8.slice(0, n)).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
  } catch (_) { return ''; }
}

function isLikelyModel(u8) {
  if (!u8 || u8.length < 16) return false;
  const h4 = asciiHead(u8, 4).toLowerCase();
  const h8 = asciiHead(u8, 8).toLowerCase();
  if (h4 === 'ggml' || h4 === 'ggmf' || h4 === 'ggjt' || h4 === 'gguf') return true;
  if (h4.startsWith('<!do') || h4.startsWith('<htm') || h4.startsWith('pk..') || h8.startsWith('{')) return false;
  // Older/quantized whisper.cpp model headers can still be accepted by whisper.cpp even when not ASCII ggml.
  return true;
}

function sanitizeAudio(input) {
  const src = input instanceof Float32Array ? input : new Float32Array(input || []);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let v = src[i];
    if (!Number.isFinite(v)) v = 0;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    out[i] = v;
  }
  return out;
}

function resampleLinear(input, fromRate, toRate = TARGET_SAMPLE_RATE) {
  const src = sanitizeAudio(input);
  fromRate = Number(fromRate || toRate);
  if (!src.length || Math.abs(fromRate - toRate) < 1) return src;
  const ratio = fromRate / toRate;
  const newLen = Math.max(1, Math.round(src.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, src.length - 1);
    const f = pos - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
  }
  return out;
}

function joinChunks(chunks, total) {
  const out = new Float32Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.length;
  }
  return out;
}

function cleanTranscript(lines, ret) {
  const src = [];
  if (Array.isArray(lines)) src.push(...lines);
  if (typeof ret === 'string') src.push(ret);
  const out = [];
  for (const raw of src) {
    let s = safeText(raw).trim();
    if (!s) continue;
    if (/^(whisper_|system_info|operator\(\)|main:|js:|storeFS:)/i.test(s)) continue;
    if (/^(whisper_print_timings|whisper_model_load|whisper_init_|whisper_backend_)/i.test(s)) continue;
    // keep transcript timestamp lines, but remove timestamp prefix
    s = s.replace(/^\[[0-9:.\s\-\>]+\]\s*/g, '').trim();
    if (!s) continue;
    if (out[out.length - 1] !== s) out.push(s);
  }
  return out.join('\n').trim();
}

function runtimeBaseUrl() {
  // Relative to this worker file: stt/whisper/whisper-worker.js
  return './';
}

async function ensureRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const logs = [];
    try {
      Module = {
        print: (text) => { const s = safeText(text); logs.push(s); post('log', { message: s }); },
        printErr: (text) => { const s = safeText(text); logs.push(s); post('log', { message: s }); },
        setStatus: (text) => post('progress', { message: safeText(text) }),
        monitorRunDependencies: () => {},
        locateFile: (path) => {
          const p = safeText(path);
          if (p.endsWith('.wasm')) return runtimeBaseUrl() + 'libmain.wasm?v=' + encodeURIComponent(RUNTIME_VERSION);
          return runtimeBaseUrl() + p;
        },
        onRuntimeInitialized: () => {
          if (!Module.init || !Module.full_default || !Module.FS_createDataFile) {
            reject(new Error('Runtime libmain đã tải nhưng thiếu Module.init/full_default/FS_createDataFile. Hãy dùng đúng libmain.js/libmain.wasm từ demo whisper.wasm đã test thành công.'));
            return;
          }
          post('progress', { message: 'Whisper runtime demo-compatible đã sẵn sàng: ' + RUNTIME_VERSION });
          resolve(Module);
        }
      };
      self.Module = Module;
      importScripts(runtimeBaseUrl() + 'libmain.js?v=' + encodeURIComponent(RUNTIME_VERSION));
      // fallback for sync init
      setTimeout(() => {
        if (Module && Module.init && Module.full_default && Module.FS_createDataFile) resolve(Module);
      }, 0);
    } catch (e) {
      reject(new Error('Không tải được libmain.js/libmain.wasm: ' + msgOf(e)));
    }
  });
  return runtimePromise;
}

async function fetchModel(path) {
  if (!path) throw new Error('Chưa có đường dẫn model Whisper .bin');
  post('progress', { message: 'Đang tải model Whisper: ' + path });
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('Không tải được model Whisper: HTTP ' + res.status);
  return await res.arrayBuffer();
}

async function loadModel(modelPath, modelBuffer) {
  const M = await ensureRuntime();
  if (modelReady && whisperInstance) return;
  const ab = modelBuffer ? modelBuffer : await fetchModel(modelPath);
  const u8 = new Uint8Array(ab);
  if (!u8.byteLength) throw new Error('Model Whisper rỗng. Hãy chọn lại file .bin.');
  if (!isLikelyModel(u8)) {
    throw new Error('File model không giống .bin Whisper hợp lệ. Header=' + asciiHead(u8, 16));
  }
  post('progress', { message: 'Đưa model vào WASM FS: ' + (u8.byteLength / 1024 / 1024).toFixed(1) + ' MB; header=' + asciiHead(u8, 8) });

  try { M.FS_unlink('/whisper.bin'); } catch (_) {}
  try { M.FS_unlink('whisper.bin'); } catch (_) {}

  // This is the same method used by the official demo that has already worked for the user.
  M.FS_createDataFile('/', 'whisper.bin', u8, true, true);

  try {
    whisperInstance = M.init('whisper.bin');
  } catch (e) {
    throw new Error('Module.init("whisper.bin") lỗi: ' + msgOf(e));
  }
  if (!whisperInstance) throw new Error('Module.init("whisper.bin") trả về rỗng/0.');
  modelReady = true;
  post('progress', { message: 'Whisper model đã nạp xong. Instance=' + whisperInstance });
}

function runFullDefault(audio, sampleRate, language = currentLanguage, translate = currentTranslate, label = 'audio') {
  if (!modelReady || !whisperInstance) throw new Error('Whisper chưa sẵn sàng model.');
  const audio16 = resampleLinear(audio, sampleRate || TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE);
  if (!audio16.length) throw new Error('Không có dữ liệu audio.');
  // Limit very long chunks for mobile safety.
  const maxSamples = TARGET_SAMPLE_RATE * 12;
  const finalAudio = audio16.length > maxSamples ? audio16.slice(0, maxSamples) : audio16;

  const M = Module;
  const captured = [];
  const oldPrint = M.print;
  const oldErr = M.printErr;
  M.print = (text) => { const s = safeText(text); captured.push(s); post('log', { message: s }); };
  M.printErr = (text) => { const s = safeText(text); captured.push(s); post('log', { message: s }); };

  let ret;
  try {
    post('progress', { message: 'Whisper xử lý ' + label + ': ' + (finalAudio.length / TARGET_SAMPLE_RATE).toFixed(1) + ' giây, lang=' + (language || 'vi') + ', threads=1' });
    // Same signature as the working demo.
    ret = M.full_default(whisperInstance, finalAudio, language || 'vi', 1, !!translate);
  } catch (e) {
    throw new Error('Module.full_default() lỗi native: ' + msgOf(e));
  } finally {
    M.print = oldPrint;
    M.printErr = oldErr;
  }
  const text = cleanTranscript(captured, ret);
  return text || (typeof ret === 'string' ? ret.trim() : '');
}

async function flushMic(force = false) {
  if (processing) return;
  const need = TARGET_SAMPLE_RATE * MIC_SEGMENT_SECONDS;
  if (!force && micSamples < need) return;
  if (!micSamples) return;
  processing = true;
  const chunks = micChunks;
  const total = micSamples;
  micChunks = [];
  micSamples = 0;
  try {
    const audio = joinChunks(chunks, total);
    const text = runFullDefault(audio, TARGET_SAMPLE_RATE, currentLanguage, currentTranslate, 'đoạn micro');
    if (text) post('result', { text });
    else post('partial', { text: 'Whisper chưa nhận rõ nội dung trong đoạn vừa xử lý.' });
  } catch (e) {
    post('error', { message: msgOf(e) });
  } finally {
    processing = false;
    if (stopAfterProcessing) {
      stopAfterProcessing = false;
      await flushMic(true);
      post('final', { text: '' });
    }
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'init') {
      currentLanguage = msg.language || 'vi';
      currentTranslate = !!msg.translate;
      await loadModel(msg.modelPath || msg.originalModelPath, msg.modelBuffer || null);
      post('inited', { message: 'Whisper demo-compatible worker đã nạp xong model.' });
      return;
    }
    if (msg.type === 'start') {
      currentLanguage = msg.language || currentLanguage || 'vi';
      currentTranslate = msg.translate != null ? !!msg.translate : currentTranslate;
      micChunks = [];
      micSamples = 0;
      micMode = true;
      stopAfterProcessing = false;
      post('ready', { message: 'Whisper bắt đầu gom âm thanh, mỗi đoạn ' + MIC_SEGMENT_SECONDS + ' giây.' });
      return;
    }
    if (msg.type === 'audio') {
      if (!micMode) return;
      const input = msg.audio instanceof Float32Array ? msg.audio : new Float32Array(msg.audio || []);
      const audio16 = resampleLinear(input, msg.sampleRate || TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE);
      micChunks.push(audio16);
      micSamples += audio16.length;
      if (micSamples >= TARGET_SAMPLE_RATE * MIC_SEGMENT_SECONDS) flushMic(false);
      else post('partial', { text: 'Đang gom âm thanh cho Whisper: ' + (micSamples / TARGET_SAMPLE_RATE).toFixed(1) + '/' + MIC_SEGMENT_SECONDS + ' giây' });
      return;
    }
    if (msg.type === 'stop') {
      if (processing) stopAfterProcessing = true;
      else await flushMic(true);
      micMode = false;
      post('final', { text: '' });
      return;
    }
    if (msg.type === 'transcribeFile') {
      const input = msg.audio instanceof Float32Array ? msg.audio : new Float32Array(msg.audio || []);
      const text = runFullDefault(input, msg.sampleRate || TARGET_SAMPLE_RATE, msg.language || currentLanguage || 'vi', !!msg.translate, 'file âm thanh');
      post('result', { text: text || 'Không nhận được nội dung từ file âm thanh.' });
      return;
    }
    post('log', { message: 'Lệnh worker không xác định: ' + msg.type });
  } catch (e) {
    post('error', { message: msgOf(e) });
  }
};

post('worker-ready', { message: 'whisper-worker.js DEMO-COMPATIBLE đã tải. Version=' + RUNTIME_VERSION });
