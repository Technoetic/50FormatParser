/**
 * OneNote WASM Parser Loader
 * onenote_parser (Rust) -> WASM -> JS bridge
 *
 * WASM 바이너리는 __ONENOTE_WASM_BASE64__ 플레이스홀더로 빌드 시 주입됨
 * 또는 initFromUrl()로 외부 .wasm 파일에서 로드 가능
 */
(function() {
  var cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
  cachedTextDecoder.decode();
  var cachedTextEncoder = new TextEncoder();
  var cachedUint8ArrayMemory0 = null;
  var WASM_VECTOR_LEN = 0;
  var wasm = null;

  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }

  function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }

  function passArray8ToWasm0(arg, malloc) {
    var ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }

  function passStringToWasm0(arg, malloc, realloc) {
    var len = arg.length;
    var ptr = malloc(len, 1) >>> 0;
    var mem = getUint8ArrayMemory0();
    var offset = 0;
    for (; offset < len; offset++) {
      var code = arg.charCodeAt(offset);
      if (code > 0x7F) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) arg = arg.slice(offset);
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      var view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      var ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }

  function getImports() {
    return {
      './onenote_wasm_bg.js': {
        __wbindgen_init_externref_table: function() {
          var table = wasm.__wbindgen_externrefs;
          var off = table.grow(4);
          table.set(0, undefined);
          table.set(off + 0, undefined);
          table.set(off + 1, null);
          table.set(off + 2, true);
          table.set(off + 3, false);
        }
      }
    };
  }

  function finalize(instance) {
    wasm = instance.exports;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
  }

  window.OneNoteWasm = {
    _ready: false,
    _loading: null,

    init: function() {
      if (this._ready) return Promise.resolve();
      if (this._loading) return this._loading;
      var self = this;
      this._loading = (async function() {
        var imports = getImports();
        var wasmBytes;
        // 인라인 base64가 있으면 사용, 없으면 외부 파일
        if (typeof __ONENOTE_WASM_BASE64__ === 'string' && __ONENOTE_WASM_BASE64__.length > 0) {
          var binary = atob(__ONENOTE_WASM_BASE64__);
          wasmBytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) wasmBytes[i] = binary.charCodeAt(i);
        } else {
          throw new Error('OneNote WASM binary not available');
        }
        var result = await WebAssembly.instantiate(wasmBytes, imports);
        finalize(result.instance);
        self._ready = true;
      })();
      return this._loading;
    },

    parse: function(data, filename) {
      if (!this._ready) throw new Error('OneNoteWasm not initialized');
      var deferred3_0, deferred3_1;
      try {
        var ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        var ptr1 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.parse_onenote(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
      } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
      }
    }
  };
})();
