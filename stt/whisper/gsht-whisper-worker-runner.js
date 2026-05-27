
// GSHT Whisper Worker Runner V80 - chạy Whisper WASM ngoài UI thread.
(function(){
  'use strict';
  const VERSION = 'gsht-whisper-worker-runner-v80-20260527';
  let runtimePromise = null;
  let instance = null;
  let modelKey = '';
  let logBuffer = [];

  function post(type, payload){
    try { self.postMessage(Object.assign({ source:'gsht-whisper-worker-runner', type }, payload || {})); } catch(e) {}
  }
  function log(){
    const s = Array.prototype.slice.call(arguments).join(' ');
    logBuffer.push(s);
    post('log', { message:s });
  }
  function cleanTranscript(lines){
    const out = [];
    (lines || []).forEach(line => {
      const s = String(line || '').trim();
      if (!s) return;
      if (/^(whisper_|system_info|operator\(\)|main:|js:|storeFS:|ggml_|\[GSHT Whisper\])/i.test(s)) return;
      if (/^(load time|fallbacks|mel time|sample time|encode time|decode time|batchd time|prompt time|total time)/i.test(s)) return;
      const m = s.match(/^\[[^\]]+\]\s*(.*)$/);
      if (m && m[1]) out.push(m[1].trim());
      else if (!/returned|processing|samples|threads|processors/i.test(s)) out.push(s);
    });
    return out.join('\n').trim();
  }
  function normalizeAudio(buffer, sampleRate){
    let src = buffer instanceof Float32Array ? buffer : new Float32Array(buffer || []);
    const fromRate = Number(sampleRate || 16000);
    if (fromRate && Math.abs(fromRate - 16000) > 1 && src.length) {
      const ratio = fromRate / 16000;
      const out = new Float32Array(Math.max(1, Math.round(src.length / ratio)));
      for (let i = 0; i < out.length; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const i1 = Math.min(i0 + 1, src.length - 1);
        const f = pos - i0;
        out[i] = src[i0] * (1 - f) + src[i1] * f;
      }
      src = out;
    }
    const maxSamples = 16000 * 15;
    if (src.length > maxSamples) src = src.slice(0, maxSamples);
    const clean = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      let v = src[i];
      if (!Number.isFinite(v)) v = 0;
      // nhẹ nhàng giảm clipping, không normalize quá mạnh để tránh méo tiếng
      clean[i] = Math.max(-1, Math.min(1, v));
    }
    return clean;
  }
  function loadRuntime(){
    if (self.Module && self.Module.init && self.Module.full_default) return Promise.resolve(self.Module);
    if (runtimePromise) return runtimePromise;
    runtimePromise = new Promise((resolve, reject) => {
      self.Module = {
        print: log,
        printErr: log,
        setStatus: function(text){ post('status', { message:String(text || '') }); },
        monitorRunDependencies: function(left){ post('deps', { left:left || 0 }); },
        locateFile: function(path){
          if (String(path || '').endsWith('.wasm')) return 'libmain.wasm?v=' + encodeURIComponent(VERSION);
          return path;
        },
        onAbort: function(what){ post('abort', { message:String(what || '') }); },
        onRuntimeInitialized: function(){
          if (!self.Module.init || !self.Module.full_default || !self.Module.FS_createDataFile) {
            reject(new Error('Runtime thiếu Module.init/full_default/FS_createDataFile'));
            return;
          }
          post('runtime-ready', { version:VERSION });
          resolve(self.Module);
        }
      };
      try { importScripts('libmain.js?v=' + encodeURIComponent(VERSION)); }
      catch(e) { reject(new Error('Không import được libmain.js: ' + (e && e.message ? e.message : e))); return; }
      setTimeout(function(){
        if (self.Module && self.Module.init && self.Module.full_default) resolve(self.Module);
      }, 250);
    });
    return runtimePromise;
  }
  async function initModel(msg){
    const M = await loadRuntime();
    const key = msg.modelKey || 'whisper-model';
    if (instance && modelKey === key) { post('ready', { requestId:msg.requestId, message:'Model đã nạp sẵn', instance, modelKey }); return; }
    const u8 = msg.modelBuffer instanceof ArrayBuffer ? new Uint8Array(msg.modelBuffer) : new Uint8Array(msg.modelBuffer || []);
    if (!u8.length) throw new Error('Model rỗng');
    const head = Array.from(u8.slice(0, 8)).map(x => String.fromCharCode(x)).join('');
    if (head.includes('<!DOCTYP') || head.includes('<html')) throw new Error('Model có vẻ là HTML, không phải .bin');
    try { M.FS_unlink('/whisper.bin'); } catch(e) {}
    try { M.FS_unlink('whisper.bin'); } catch(e) {}
    log('storeFS: storing model: whisper.bin size: ' + u8.length);
    M.FS_createDataFile('/', 'whisper.bin', u8, true, true);
    instance = M.init('whisper.bin');
    if (!instance) throw new Error('Module.init("whisper.bin") trả về rỗng');
    modelKey = key;
    post('ready', { requestId:msg.requestId, message:'Whisper worker V80 đã nạp model', instance, modelKey });
  }
  async function transcribe(msg){
    if (!instance) throw new Error('Chưa nạp model Whisper');
    const M = await loadRuntime();
    logBuffer = [];
    M.print = log;
    M.printErr = log;
    const audio = normalizeAudio(msg.audioBuffer, msg.sampleRate || 16000);
    post('progress', { requestId:msg.requestId, message:'Whisper worker V80 xử lý ' + (audio.length/16000).toFixed(1) + ' giây' });
    const ret = M.full_default(instance, audio, msg.language || 'vi', 1, false);
    const text = cleanTranscript(logBuffer);
    post('result', { requestId:msg.requestId, text, ret, logs:logBuffer.slice(-80) });
  }
  self.onmessage = function(ev){
    const msg = ev.data || {};
    if (msg.target !== 'gsht-whisper-worker-runner') return;
    (async function(){
      if (msg.command === 'ping') { post('pong', { requestId:msg.requestId, version:VERSION }); return; }
      if (msg.command === 'init') { await initModel(msg); return; }
      if (msg.command === 'transcribe') { await transcribe(msg); return; }
      throw new Error('Lệnh Whisper worker không hợp lệ: ' + msg.command);
    })().catch(function(err){
      post('error', { requestId:msg.requestId, message: err && err.message ? err.message : String(err || 'Lỗi không xác định') });
    });
  };
  post('loaded', { version:VERSION });
})();
