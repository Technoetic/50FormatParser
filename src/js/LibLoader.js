/**
 * CDN 라이브러리 동적 로더
 * 필요한 시점에만 CDN에서 라이브러리를 로드하여 초기 로딩 속도를 유지
 */
class LibLoader {
  constructor() {
    this._cache = {};
    this._loading = {};
  }

  /**
   * 스크립트를 CDN에서 동적 로드
   * @param {string} name - 라이브러리 식별자
   * @param {string} url - CDN URL
   * @param {string} globalVar - window에 등록되는 전역 변수명
   * @returns {Promise<any>} 로드된 라이브러리 객체
   */
  async load(name, url, globalVar) {
    if (this._cache[name]) return this._cache[name];
    if (this._loading[name]) return this._loading[name];

    this._loading[name] = new Promise((resolve, reject) => {
      // 이미 전역에 존재하면 바로 반환
      if (window[globalVar]) {
        this._cache[name] = window[globalVar];
        resolve(window[globalVar]);
        return;
      }

      var timer = setTimeout(function() {
        reject(new Error(name + ' CDN 로드 타임아웃 (10초): ' + url));
      }, 10000);

      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        clearTimeout(timer);
        if (window[globalVar]) {
          this._cache[name] = window[globalVar];
          resolve(window[globalVar]);
        } else {
          reject(new Error(name + ' 로드 실패: ' + globalVar + '이(가) window에 없습니다'));
        }
      };
      script.onerror = () => { clearTimeout(timer); reject(new Error(name + ' CDN 로드 실패: ' + url)); };
      document.head.appendChild(script);
    });

    try {
      const result = await this._loading[name];
      return result;
    } catch (e) {
      delete this._loading[name];
      throw e;
    }
  }

  // --- 개별 라이브러리 로더 ---

  async loadPdfJs() {
    return this.load('pdfjs', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjsLib');
  }

  async loadJSZip() {
    return this.load('jszip', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip');
  }

  async loadSheetJS() {
    return this.load('sheetjs', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
  }

  async loadJsYaml() {
    return this.load('jsyaml', 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js', 'jsyaml');
  }

  async loadMarked() {
    return this.load('marked', 'https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js', 'marked');
  }

  async loadTesseract() {
    return this.load('tesseract', 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
  }

  async loadSqlJs() {
    const SQL = await this.load('sqljs', 'https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js', 'initSqlJs');
    return SQL({
      locateFile: file => 'https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/' + file
    });
  }

  async loadMammoth() {
    return this.load('mammoth', 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth');
  }

  async loadPapaParse() {
    return this.load('papaparse', 'https://cdn.jsdelivr.net/npm/papaparse@5.5.2/papaparse.min.js', 'Papa');
  }

  async loadLibheif() {
    // libheif-js: HEIC/HEIF 디코더 (heic2any 대체)
    // libheif 전역은 팩토리 함수 → 호출하면 Emscripten 인스턴스 반환
    if (this._cache['libheif']) return this._cache['libheif'];
    await this.load('libheif', 'https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif/libheif.js', 'libheif');
    var instance = window.libheif();
    this._cache['libheif'] = instance;
    return instance;
  }

  async loadDcmjs() {
    // dcmjs: UMD, dicomParser 대체 (더 풍부한 DICOM 파싱/시퀀스 지원)
    return this.load('dcmjs', 'https://cdn.jsdelivr.net/npm/dcmjs@0.33.0/build/dcmjs.js', 'dcmjs');
  }

  async loadHyparquet() {
    // hyparquet는 ESM 전용이므로 dynamic import 사용
    if (this._cache['hyparquet']) return this._cache['hyparquet'];
    if (this._loading['hyparquet']) return this._loading['hyparquet'];
    this._loading['hyparquet'] = import('https://cdn.jsdelivr.net/npm/hyparquet@1.25.0/src/hyparquet.min.js')
      .then(mod => {
        this._cache['hyparquet'] = mod;
        return mod;
      });
    try {
      return await this._loading['hyparquet'];
    } catch (e) {
      delete this._loading['hyparquet'];
      throw e;
    }
  }

  async loadArrowUmd() {
    return this.load('arrow', 'https://cdn.jsdelivr.net/npm/@apache-arrow/es2015-umd@18.1.0/Arrow.dom.js', 'Arrow');
  }

  async loadJsfive() {
    return this.load('jsfive', 'https://cdn.jsdelivr.net/npm/jsfive@0.3.10/dist/browser/hdf5.js', 'hdf5');
  }

  async loadDjVuJs() {
    // DjVu.js는 ESM으로 dynamic import
    if (this._cache['djvujs']) return this._cache['djvujs'];
    if (this._loading['djvujs']) return this._loading['djvujs'];
    this._loading['djvujs'] = import('https://cdn.jsdelivr.net/gh/RussCoder/djvujs@L.0.5.4_V.0.10.1/library/dist/djvu.js')
      .then(mod => {
        this._cache['djvujs'] = mod.default || mod;
        return this._cache['djvujs'];
      });
    try {
      return await this._loading['djvujs'];
    } catch (e) {
      delete this._loading['djvujs'];
      throw e;
    }
  }

  async loadSmolToml() {
    // smol-toml: ESM only, TOML v1.0/v1.1 compliant, fast-toml 대체
    if (this._cache['smoltoml']) return this._cache['smoltoml'];
    if (this._loading['smoltoml']) return this._loading['smoltoml'];
    this._loading['smoltoml'] = import('https://cdn.jsdelivr.net/npm/smol-toml@1.3.1/+esm')
      .then(mod => {
        this._cache['smoltoml'] = mod;
        return mod;
      });
    try {
      return await this._loading['smoltoml'];
    } catch (e) {
      delete this._loading['smoltoml'];
      throw e;
    }
  }

  async loadPostalMime() {
    // postal-mime는 ESM 전용이므로 dynamic import 사용
    if (this._cache['postalmime']) return this._cache['postalmime'];
    if (this._loading['postalmime']) return this._loading['postalmime'];
    this._loading['postalmime'] = import('https://cdn.jsdelivr.net/npm/postal-mime@2.3.2/src/postal-mime.js')
      .then(mod => {
        this._cache['postalmime'] = mod.default || mod;
        return this._cache['postalmime'];
      });
    try {
      return await this._loading['postalmime'];
    } catch (e) {
      delete this._loading['postalmime'];
      throw e;
    }
  }

  async loadSubtitle() {
    // subtitle: ESM, srt-vtt-parser + ass-compiler 대체 (SRT/VTT/ASS 통합)
    if (this._cache['subtitle']) return this._cache['subtitle'];
    if (this._loading['subtitle']) return this._loading['subtitle'];
    this._loading['subtitle'] = import('https://cdn.jsdelivr.net/npm/subtitle@4.2.1/+esm')
      .then(mod => {
        this._cache['subtitle'] = mod;
        return mod;
      });
    try {
      return await this._loading['subtitle'];
    } catch (e) {
      delete this._loading['subtitle'];
      throw e;
    }
  }

  async loadPako() {
    return this.load('pako', 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'pako');
  }

  async loadUntar() {
    return this.load('untar', 'https://cdn.jsdelivr.net/npm/js-untar@2.0.0/build/dist/untar.js', 'untar');
  }

  async loadDxfParser() {
    return this.load('dxfparser', 'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.js', 'DxfParser');
  }

  async loadShpjs() {
    // shpjs ESM
    if (this._cache['shpjs']) return this._cache['shpjs'];
    if (this._loading['shpjs']) return this._loading['shpjs'];
    this._loading['shpjs'] = import('https://cdn.jsdelivr.net/npm/shpjs@5.0.1/+esm')
      .then(mod => {
        this._cache['shpjs'] = mod.default || mod;
        return this._cache['shpjs'];
      });
    try {
      return await this._loading['shpjs'];
    } catch (e) {
      delete this._loading['shpjs'];
      throw e;
    }
  }

  async loadProtobuf() {
    return this.load('protobuf', 'https://cdn.jsdelivr.net/npm/protobufjs@7.4.0/dist/protobuf.min.js', 'protobuf');
  }

  async loadToneMidi() {
    // @tonejs/midi: UMD, midi-parser-js 대체 (더 풍부한 MIDI 데이터 추출)
    return this.load('tonemidi', 'https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.js', 'Midi');
  }

  async loadMusicMetadataBrowser() {
    // music-metadata: ESM, music-metadata-browser(deprecated) 대체
    if (this._cache['musicmetabrowser']) return this._cache['musicmetabrowser'];
    if (this._loading['musicmetabrowser']) return this._loading['musicmetabrowser'];
    this._loading['musicmetabrowser'] = import('https://cdn.jsdelivr.net/npm/music-metadata@11.12.1/+esm')
      .then(mod => {
        this._cache['musicmetabrowser'] = mod;
        return mod;
      });
    try {
      return await this._loading['musicmetabrowser'];
    } catch (e) {
      delete this._loading['musicmetabrowser'];
      throw e;
    }
  }

  async loadMP4Box() {
    return this.load('mp4box', 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js', 'MP4Box');
  }

  async loadPickleParser() {
    return this.load('pickleparser', 'https://cdn.jsdelivr.net/npm/pickleparser@0.2.1/dist/index.js', 'pickleparser');
  }

  async loadLibreDwg() {
    // libredwg-web: ESM dynamic import + WASM from CDN
    if (this._cache['libredwg']) return this._cache['libredwg'];
    if (this._loading['libredwg']) return this._loading['libredwg'];
    var cdnBase = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.6.6/';
    var self = this;
    this._loading['libredwg'] = (async () => {
      var mod = await import(cdnBase + 'dist/libredwg-web.js');
      var createModule = mod.createModule;
      var LibreDwg = mod.LibreDwg;
      var wasmInstance = await createModule({
        locateFile: function(filename) { return cdnBase + 'wasm/' + filename; }
      });
      var instance = LibreDwg.createByWasmInstance(wasmInstance);
      self._cache['libredwg'] = instance;
      return instance;
    })();
    try {
      return await this._loading['libredwg'];
    } catch (e) {
      delete this._loading['libredwg'];
      throw e;
    }
  }

  async loadBrowserFS() {
    return this.load('browserfs', 'https://cdn.jsdelivr.net/npm/browserfs@1.4.3/dist/browserfs.min.js', 'BrowserFS');
  }

  async load7zWasm() {
    // 7z-wasm: UMD + WASM from CDN
    if (this._cache['7zwasm']) return this._cache['7zwasm'];
    if (this._loading['7zwasm']) return this._loading['7zwasm'];
    var cdnBase = 'https://cdn.jsdelivr.net/npm/7z-wasm@1.2.0/';
    var self = this;
    this._loading['7zwasm'] = (async () => {
      // UMD 스크립트 로드
      await new Promise(function(resolve, reject) {
        if (window.SevenZip) { resolve(); return; }
        var script = document.createElement('script');
        script.src = cdnBase + '7zz.umd.js';
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = function() { reject(new Error('7z-wasm CDN 로드 실패')); };
        document.head.appendChild(script);
      });
      // SevenZip 모듈 초기화 (WASM 로드)
      var sevenZip = await window.SevenZip({
        locateFile: function(filename) { return cdnBase + filename; }
      });
      self._cache['7zwasm'] = sevenZip;
      return sevenZip;
    })();
    try {
      return await this._loading['7zwasm'];
    } catch (e) {
      delete this._loading['7zwasm'];
      throw e;
    }
  }

  async loadMsgpack() {
    // @msgpack/msgpack ESM
    if (this._cache['msgpack']) return this._cache['msgpack'];
    if (this._loading['msgpack']) return this._loading['msgpack'];
    this._loading['msgpack'] = import('https://cdn.jsdelivr.net/npm/@msgpack/msgpack@3.1.3/+esm')
      .then(mod => {
        this._cache['msgpack'] = mod;
        return mod;
      });
    try {
      return await this._loading['msgpack'];
    } catch (e) {
      delete this._loading['msgpack'];
      throw e;
    }
  }

  async loadFzstd() {
    // fzstd ESM
    if (this._cache['fzstd']) return this._cache['fzstd'];
    if (this._loading['fzstd']) return this._loading['fzstd'];
    this._loading['fzstd'] = import('https://cdn.jsdelivr.net/npm/fzstd@0.1.1/+esm')
      .then(mod => {
        this._cache['fzstd'] = mod;
        return mod;
      });
    try {
      return await this._loading['fzstd'];
    } catch (e) {
      delete this._loading['fzstd'];
      throw e;
    }
  }
}

// 싱글톤
const libLoader = new LibLoader();
