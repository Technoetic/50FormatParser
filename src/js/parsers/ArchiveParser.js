class ArchiveParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.zip') return this._parseZip(file, formatInfo);
    if (ext === '.7z') return this._parse7z(file, formatInfo);
    if (ext === '.rar') return this._parseRar(file, formatInfo);
    if (ext === '.tar') return this._parseTar(file, formatInfo);
    if (ext === '.tar.gz' || ext === '.tgz') return this._parseTarGz(file, formatInfo);
    if (ext === '.tar.bz2') return this._parseTarBz2(file, formatInfo);
    if (ext === '.tar.zst' || ext === '.tar.xz' || ext === '.tar.lzma') return this._parseTarCompressed(file, formatInfo);
    if (ext === '.gz' || ext === '.gzip') return this._parseGzip(file, formatInfo);
    if (ext === '.zst') return this._parseZstd(file, formatInfo);
    if (ext === '.iso') return this._parseIso(file, formatInfo);
    return this._parseGenericArchive(file, formatInfo);
  }

  // --- ZIP: JSZip 라이브러리 사용 ---
  async _parseZip(file, info) {
    try {
      const JSZip = await libLoader.loadJSZip();
      const buffer = await this.readAsArrayBuffer(file);
      const zip = await JSZip.loadAsync(buffer);
      const entries = [];
      zip.forEach((path, entry) => {
        entries.push({
          name: path,
          size: entry._data ? (entry._data.uncompressedSize || 0) : 0,
          compressedSize: entry._data ? (entry._data.compressedSize || 0) : 0,
          dir: entry.dir,
          date: entry.date
        });
      });
      const text = entries.map(e => e.name + (e.dir ? ' [디렉토리]' : ' (' + this.formatFileSize(e.size) + ')')).join('\n');
      const headers = ['파일명', '크기', '타입'];
      const rows = entries.map(e => [e.name, e.dir ? '-' : this.formatFileSize(e.size), e.dir ? '디렉토리' : '파일']);
      return this.createResult(info.name, info.category, text, {
        format: 'ZIP (JSZip)',
        totalFiles: entries.filter(e => !e.dir).length,
        totalDirs: entries.filter(e => e.dir).length,
        totalSize: entries.reduce((s, e) => s + (e.size || 0), 0)
      }, { tables: [{ headers, rows }] });
    } catch (e) {
      console.warn('JSZip 파싱 실패, 폴백:', e.message);
      return this._parseZipFallback(file, info);
    }
  }

  _parseZipFallback(file, info) {
    return this.readAsArrayBuffer(file).then(buffer => {
      const entries = this._listZipEntries(buffer);
      const text = entries.map(e => e.name + ' (' + this.formatFileSize(e.size) + ')').join('\n');
      const headers = ['파일명', '크기', '압축 크기'];
      const rows = entries.map(e => [e.name, this.formatFileSize(e.size), this.formatFileSize(e.compressedSize)]);
      return this.createResult(info.name, info.category, text, { format: 'ZIP (폴백)', totalFiles: entries.length }, { tables: [{ headers, rows }] });
    });
  }

  _listZipEntries(buffer) {
    const view = new DataView(buffer);
    const entries = [];
    let offset = 0;
    while (offset < buffer.byteLength - 4) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;
      const flags = view.getUint16(offset + 6, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const uncompressedSize = view.getUint32(offset + 22, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameBytes = new Uint8Array(buffer, offset + 30, nameLen);
      const name = new TextDecoder().decode(nameBytes);
      const encrypted = !!(flags & 0x01);
      entries.push({ name, size: uncompressedSize, compressedSize, encrypted });
      offset += 30 + nameLen + extraLen + compressedSize;
    }
    return entries;
  }

  // --- TAR: js-untar 라이브러리 사용 ---
  async _parseTar(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const untar = await libLoader.loadUntar();
      const entries = await untar(buffer);
      const text = entries.map(e => e.name + ' (' + this.formatFileSize(e.size) + ')').join('\n');
      const headers = ['파일명', '크기', '타입'];
      const rows = entries.map(e => [e.name, this.formatFileSize(e.size), e.type || 'file']);
      return this.createResult(info.name, info.category, text, {
        format: 'TAR (js-untar)',
        fileCount: entries.length,
        totalSize: entries.reduce((s, e) => s + (e.size || 0), 0)
      }, { tables: [{ headers, rows }] });
    } catch (e) {
      console.warn('js-untar 실패, 폴백:', e.message);
      return this._parseTarFallback(buffer, info);
    }
  }

  // --- TAR.GZ: pako + js-untar ---
  async _parseTarGz(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    try {
      const pako = await libLoader.loadPako();
      const decompressed = pako.ungzip(bytes);
      try {
        const untar = await libLoader.loadUntar();
        const entries = await untar(decompressed.buffer);
        const text = entries.map(e => e.name + ' (' + this.formatFileSize(e.size) + ')').join('\n');
        const headers = ['파일명', '크기', '타입'];
        const rows = entries.map(e => [e.name, this.formatFileSize(e.size), e.type || 'file']);
        return this.createResult(info.name, info.category, text, {
          format: 'TAR.GZ (pako+js-untar)',
          fileCount: entries.length,
          compressedSize: file.size,
          decompressedSize: decompressed.length
        }, { tables: [{ headers, rows }] });
      } catch (untarErr) {
        console.warn('js-untar 실패, TAR 폴백:', untarErr.message);
        return this._parseTarFallback(decompressed.buffer, info);
      }
    } catch (e) {
      console.warn('pako 해제 실패, 기본 분석:', e.message);
      return this._parseGzipInfoOnly(bytes, buffer, file, info);
    }
  }

  // --- GZIP 단독: pako ---
  async _parseGzip(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    try {
      const pako = await libLoader.loadPako();
      const decompressed = pako.ungzip(bytes);
      const preview = new TextDecoder('utf-8', { fatal: false }).decode(decompressed.slice(0, 5000));
      return this.createResult(info.name, info.category, preview, {
        format: 'GZIP (pako)',
        compressedSize: file.size,
        decompressedSize: decompressed.length,
        compressionRatio: (decompressed.length / file.size).toFixed(2)
      });
    } catch (e) {
      console.warn('pako 해제 실패:', e.message);
      return this._parseGzipInfoOnly(bytes, buffer, file, info);
    }
  }

  // --- Zstandard: fzstd ---
  async _parseZstd(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    try {
      const fzstd = await libLoader.loadFzstd();
      const decompressed = fzstd.decompress(bytes);
      const preview = new TextDecoder('utf-8', { fatal: false }).decode(decompressed.slice(0, 5000));
      return this.createResult(info.name, info.category, preview, {
        format: 'Zstandard (fzstd)',
        compressedSize: file.size,
        decompressedSize: decompressed.length,
        compressionRatio: (decompressed.length / file.size).toFixed(2)
      });
    } catch (e) {
      return this.createResult(info.name, info.category, '[Zstandard 압축 파일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n해제 실패: ' + e.message, { format: 'Zstandard', size: file.size });
    }
  }

  // --- TAR.BZ2 / TAR 기타 압축 ---
  async _parseTarBz2(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: info.name, size: file.size };
    const isBz2 = bytes[0] === 0x42 && bytes[1] === 0x5A && bytes[2] === 0x68;
    let text = '[' + info.name + ' 아카이브]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (isBz2) text += '압축: BZ2 (유효)\n';
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseTarCompressed(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const ext = this.getFileExtension(file.name);
    let text = '[' + info.name + ' 아카이브]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';

    // .tar.zst: fzstd로 해제 후 tar 파싱
    if (ext === '.tar.zst') {
      try {
        const fzstd = await libLoader.loadFzstd();
        const decompressed = fzstd.decompress(new Uint8Array(buffer));
        try {
          const untar = await libLoader.loadUntar();
          const entries = await untar(decompressed.buffer);
          const entryText = entries.map(e => e.name + ' (' + this.formatFileSize(e.size) + ')').join('\n');
          return this.createResult(info.name, info.category, entryText, {
            format: 'TAR.ZST (fzstd+js-untar)',
            fileCount: entries.length,
            compressedSize: file.size,
            decompressedSize: decompressed.length
          });
        } catch (e2) {
          return this._parseTarFallback(decompressed.buffer, info);
        }
      } catch (e) {
        text += '압축 해제 실패: ' + e.message + '\n';
      }
    }
    return this.createResult(info.name, info.category, text, { format: info.name, size: file.size });
  }

  // --- 7z: 7z-wasm (WASM) ---
  async _parse7z(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: '7z', size: file.size };

    try {
      var sevenZip = await libLoader.load7zWasm();
      return this._parse7zWithLib(sevenZip, bytes, file, info, meta);
    } catch (e) {
      console.warn('7z-wasm 로드 실패, 폴백:', e.message);
      return this._parse7zFallback(bytes, file, info, meta);
    }
  }

  _parse7zWithLib(sevenZip, bytes, file, info, meta) {
    var self = this;
    // Emscripten FS에 파일 쓰기
    var tmpName = '/tmp/archive.7z';
    try { sevenZip.FS.mkdir('/tmp'); } catch(e) { /* already exists */ }
    sevenZip.FS.writeFile(tmpName, bytes);

    // stdout 캡처
    var output = '';
    var origPrint = sevenZip.print;
    sevenZip.print = function(text) { output += text + '\n'; };

    try {
      sevenZip.callMain(['l', tmpName]);
    } catch (e) {
      // callMain may throw on exit
    }
    sevenZip.print = origPrint;

    // 파일 정리
    try { sevenZip.FS.unlink(tmpName); } catch(e) { /* ignore */ }

    // 출력 파싱
    var entries = [];
    var lines = output.split('\n');
    var inFileList = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.startsWith('-------------------')) {
        if (!inFileList) { inFileList = true; }
        else { inFileList = false; }
        continue;
      }
      if (inFileList && line.trim()) {
        // 7z list format: Date Time Attr Size Compressed Name
        var parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          var dateStr = parts[0] + ' ' + parts[1];
          var attr = parts[2];
          var size = parseInt(parts[3]) || 0;
          var compressed = parseInt(parts[4]) || 0;
          var name = parts.slice(5).join(' ');
          var isDir = attr.indexOf('D') >= 0;
          entries.push({ name: name, size: size, compressed: compressed, isDir: isDir, attr: attr, date: dateStr });
        }
      }
    }

    meta.validMagic = true;
    meta.fileCount = entries.filter(function(e) { return !e.isDir; }).length;
    meta.dirCount = entries.filter(function(e) { return e.isDir; }).length;
    meta.totalSize = entries.reduce(function(s, e) { return s + (e.size || 0); }, 0);

    var text = '[7z 압축 파일 (7z-wasm)]\n파일 크기: ' + self.formatFileSize(file.size) + '\n';
    text += '파일 수: ' + meta.fileCount + '\n';
    text += '디렉토리 수: ' + meta.dirCount + '\n';
    text += '총 원본 크기: ' + self.formatFileSize(meta.totalSize) + '\n';

    var headers = ['파일명', '크기', '압축 크기', '타입'];
    var rows = entries.slice(0, 200).map(function(e) {
      return [e.name, e.isDir ? '-' : self.formatFileSize(e.size), e.isDir ? '-' : self.formatFileSize(e.compressed), e.isDir ? '디렉토리' : '파일'];
    });

    meta.library = '7z-wasm';
    var r = self.createResult(info.name, info.category, text, meta);
    r.tables = [{ headers: headers, rows: rows }];
    return r;
  }

  _parse7zFallback(bytes, file, info, meta) {
    var magic = bytes[0] === 0x37 && bytes[1] === 0x7A && bytes[2] === 0xBC && bytes[3] === 0xAF && bytes[4] === 0x27 && bytes[5] === 0x1C;
    meta.validMagic = magic;
    if (magic) {
      meta.majorVersion = bytes[6];
      meta.minorVersion = bytes[7];
    }
    var strings = this._extractArchiveStrings(bytes);
    var text = '[7z 압축 파일]\n' +
      '매직: ' + (magic ? '7z (유효)' : '확인 불가') + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (meta.majorVersion !== undefined) text += '버전: ' + meta.majorVersion + '.' + meta.minorVersion + '\n';
    if (strings.length > 0) {
      text += '\n감지된 파일명:\n' + strings.map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n');
      meta.detectedFiles = strings;
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  // --- RAR: node-unrar-js (WASM) ---
  async _parseRar(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'RAR', size: file.size };

    // node-unrar-js 라이브러리 사용
    if (window.UnrarJs && window.UnrarJs.createExtractorFromData) {
      try {
        return await this._parseRarWithLib(buffer, file, info, meta);
      } catch (e) {
        console.warn('UnrarJs 파싱 실패, 폴백:', e.message);
      }
    }

    return this._parseRarFallback(bytes, file, info, meta);
  }

  async _parseRarWithLib(buffer, file, info, meta) {
    var self = this;
    var extractor = await window.UnrarJs.createExtractorFromData(buffer);
    var list = extractor.getFileList();
    var arcHeader = list.arcHeader;
    var entries = [];

    for (var fileHeader of list.fileHeaders) {
      entries.push({
        name: fileHeader.name,
        size: fileHeader.unpSize,
        packSize: fileHeader.packSize,
        isDir: fileHeader.flags.directory,
        encrypted: fileHeader.flags.encrypted,
        method: fileHeader.method,
        time: fileHeader.time
      });
    }

    meta.validMagic = true;
    meta.fileCount = entries.filter(function(e) { return !e.isDir; }).length;
    meta.dirCount = entries.filter(function(e) { return e.isDir; }).length;
    meta.totalSize = entries.reduce(function(s, e) { return s + (e.size || 0); }, 0);
    if (arcHeader.flags.solid) meta.solid = true;
    if (arcHeader.flags.headerEncrypted) meta.headerEncrypted = true;

    var text = '[RAR 압축 파일 (node-unrar-js)]\n파일 크기: ' + self.formatFileSize(file.size) + '\n';
    text += '파일 수: ' + meta.fileCount + '\n';
    text += '디렉토리 수: ' + meta.dirCount + '\n';
    text += '총 원본 크기: ' + self.formatFileSize(meta.totalSize) + '\n';
    if (meta.solid) text += '솔리드 아카이브: 예\n';

    var headers = ['파일명', '크기', '압축 크기', '타입'];
    var rows = entries.slice(0, 200).map(function(e) {
      return [
        e.name,
        e.isDir ? '-' : self.formatFileSize(e.size),
        e.isDir ? '-' : self.formatFileSize(e.packSize),
        e.isDir ? '디렉토리' : '파일'
      ];
    });

    meta.library = 'node-unrar-js (WASM)';
    var r = self.createResult(info.name, info.category, text, meta);
    r.tables = [{ headers: headers, rows: rows }];
    return r;
  }

  _parseRarFallback(bytes, file, info, meta) {
    var isRar5 = bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1A && bytes[5] === 0x07 && bytes[6] === 0x01;
    var isRar4 = bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1A && bytes[5] === 0x07 && bytes[6] === 0x00;
    meta.validMagic = isRar5 || isRar4;
    meta.version = isRar5 ? '5.x' : isRar4 ? '4.x' : 'unknown';
    var strings = this._extractArchiveStrings(bytes);
    var text = '[RAR 압축 파일]\n' +
      '매직: ' + (meta.validMagic ? 'RAR (유효)' : '확인 불가') + '\n' +
      '버전: ' + meta.version + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (strings.length > 0) {
      text += '\n감지된 파일명:\n' + strings.map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n');
      meta.detectedFiles = strings;
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  // --- TAR 폴백 (자체구현) ---
  _parseTarFallback(buffer, info) {
    const entries = this._parseTarEntries(buffer);
    if (entries.length > 0) {
      const text = entries.map((e, i) => (i + 1) + '. ' + e.name + ' (' + this.formatFileSize(e.size) + ')').join('\n');
      return this.createResult(info.name, info.category, text, { format: 'TAR (폴백)', fileCount: entries.length });
    }
    return this.createResult(info.name, info.category, '[TAR 파일 분석]\n파일 크기: ' + this.formatFileSize(buffer.byteLength), { format: 'TAR (폴백)' });
  }

  _parseTarEntries(buffer) {
    const entries = [];
    let offset = 0;
    while (offset + 512 <= buffer.byteLength && entries.length < 100) {
      const headerBytes = new Uint8Array(buffer, offset, 512);
      if (headerBytes.every(b => b === 0)) break;
      const name = new TextDecoder().decode(headerBytes.slice(0, 100)).replace(/\0/g, '').trim();
      if (!name) break;
      const sizeStr = new TextDecoder().decode(headerBytes.slice(124, 136)).replace(/\0/g, '').trim();
      const size = parseInt(sizeStr, 8) || 0;
      entries.push({ name, size });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
  }

  // --- GZIP 메타정보만 ---
  _parseGzipInfoOnly(bytes, buffer, file, info) {
    const isGzip = bytes[0] === 0x1F && bytes[1] === 0x8B;
    const meta = { format: info.name, size: file.size, isGzip };
    let text = '[' + info.name + ' 아카이브]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (isGzip) {
      meta.compressionMethod = bytes[2] === 8 ? 'Deflate' : 'Unknown(' + bytes[2] + ')';
      meta.os = this._gzipOS(bytes[9]);
      text += '압축: GZIP (Deflate)\n원본 OS: ' + meta.os + '\n';
      if (bytes.length >= 4) {
        const view = new DataView(buffer);
        meta.originalSize = view.getUint32(bytes.length - 4, true);
        text += '원본 크기: ' + this.formatFileSize(meta.originalSize) + '\n';
      }
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  _gzipOS(byte) {
    const os = { 0: 'FAT', 3: 'Unix', 7: 'Macintosh', 10: 'NTFS', 11: 'OS/2', 255: 'Unknown' };
    return os[byte] || 'Unknown(' + byte + ')';
  }

  // --- ISO 9660 (BrowserFS IsoFS) ---
  async _parseIso(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'ISO 9660', size: file.size };

    // ISO 9660 유효성 검증: 32769 오프셋에 'CD001' 매직 + 최소 크기(64KB) 필요
    var isValidIso = false;
    if (bytes.length >= 65536) {
      var magic = String.fromCharCode(bytes[32769], bytes[32770], bytes[32771], bytes[32772], bytes[32773]);
      isValidIso = (magic === 'CD001');
    }

    if (!isValidIso) {
      return this._parseIsoFallback(bytes, file, info, meta);
    }

    try {
      const BFS = await libLoader.loadBrowserFS();
      return await this._parseIsoWithLib(BFS, buffer, file, info, meta);
    } catch (e) {
      console.warn('BrowserFS 로드/파싱 실패, 폴백:', e.message);
      return this._parseIsoFallback(bytes, file, info, meta);
    }
  }

  async _parseIsoWithLib(BFS, buffer, file, info, meta) {
    var self = this;
    var Buffer = BFS.BFSRequire('buffer').Buffer;
    var isoData = Buffer.from(buffer);

    return new Promise(function(resolve, reject) {
      var settled = false;
      var timer = setTimeout(function() {
        if (!settled) {
          settled = true;
          reject(new Error('IsoFS.Create 타임아웃 (10초)'));
        }
      }, 10000);

      BFS.FileSystem.IsoFS.Create({ data: isoData }, function(err, isoFs) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { reject(err); return; }
        var allText = ['[ISO 디스크 이미지 (BrowserFS)]'];
        var allTables = [];
        allText.push('파일 크기: ' + self.formatFileSize(file.size));

        var entries = [];
        var totalSize = 0;
        var dirCount = 0;
        var fileCount = 0;

        function walk(dirPath) {
          try {
            var items = isoFs.readdirSync(dirPath);
            items.forEach(function(name) {
              var fullPath = dirPath === '/' ? '/' + name : dirPath + '/' + name;
              try {
                var stat = isoFs.statSync(fullPath);
                if (stat.isDirectory()) {
                  dirCount++;
                  entries.push({ path: fullPath + '/', size: 0, dir: true });
                  if (entries.length < 2000) walk(fullPath);
                } else {
                  fileCount++;
                  totalSize += stat.size;
                  entries.push({ path: fullPath, size: stat.size, dir: false });
                }
              } catch (e) { /* skip */ }
            });
          } catch (e) { /* skip */ }
        }
        walk('/');

        meta.fileCount = fileCount;
        meta.dirCount = dirCount;
        meta.totalContentSize = totalSize;
        meta.validMagic = true;
        allText.push('파일 수: ' + fileCount);
        allText.push('디렉토리 수: ' + dirCount);
        allText.push('총 컨텐츠 크기: ' + (totalSize / 1024 / 1024).toFixed(2) + ' MB');

        if (entries.length > 0) {
          var tableRows = entries.slice(0, 200).map(function(e) {
            return [e.path, e.dir ? '[디렉토리]' : self.formatFileSize(e.size)];
          });
          allTables.push({ headers: ['경로', '크기'], rows: tableRows });
          if (entries.length > 200) allText.push('\n(처음 200개 항목만 표시, 총 ' + entries.length + '개)');
        }

        meta.library = 'BrowserFS IsoFS';
        var r = self.createResult(info.name, info.category, allText.join('\n'), meta);
        if (allTables.length > 0) r.tables = allTables;
        resolve(r);
      });
    });
  }

  _parseIsoFallback(bytes, file, info, meta) {
    var text = '[ISO 디스크 이미지]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes.length > 32774) {
      var magic = String.fromCharCode.apply(null, bytes.slice(32769, 32774));
      meta.validMagic = magic === 'CD001';
      if (meta.validMagic) {
        var volumeLabel = new TextDecoder().decode(bytes.slice(32808, 32840)).replace(/\0/g, '').trim();
        meta.volumeLabel = volumeLabel;
        text += '매직: CD001 (유효)\n';
        if (volumeLabel) text += '볼륨 라벨: ' + volumeLabel + '\n';
      }
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  // --- 일반 아카이브 ---
  async _parseGenericArchive(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      try {
        const JSZip = await libLoader.loadJSZip();
        const zip = await JSZip.loadAsync(buffer);
        const entries = [];
        zip.forEach((path, entry) => {
          entries.push({ name: path, dir: entry.dir });
        });
        let text = '[ZIP 아카이브]\n파일 크기: ' + this.formatFileSize(file.size) + '\n총 항목: ' + entries.length + '\n\n';
        text += entries.map(e => e.name + (e.dir ? ' [디렉토리]' : '')).join('\n');
        return this.createResult(info.name, info.category, text, { format: 'ZIP (JSZip)', totalFiles: entries.length });
      } catch (e) {
        // 암호화 ZIP 등 JSZip 실패 시
        const entries = this._listZipEntries(buffer);
        const encrypted = entries.filter(e => e.encrypted);
        let text = '[암호화된 ZIP 파일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n총 파일 수: ' + entries.length + '\n암호화된 파일: ' + encrypted.length + '\n\n파일 목록:\n' + entries.map(e => e.name + (e.encrypted ? ' [암호화]' : '') + ' (' + this.formatFileSize(e.size) + ')').join('\n');
        return this.createResult(info.name, info.category, text, { format: '암호화 ZIP', totalFiles: entries.length, encryptedFiles: encrypted.length });
      }
    }
    const strings = this._extractArchiveStrings(bytes);
    let text = '[' + info.name + ' 아카이브]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (strings.length > 0) text += '\n감지된 파일명:\n' + strings.map((s, i) => (i + 1) + '. ' + s).join('\n');
    return this.createResult(info.name, info.category, text, { format: info.name, size: file.size });
  }

  _extractArchiveStrings(bytes) {
    const strings = [];
    const seen = new Set();
    let current = '';
    const limit = Math.min(bytes.length, 50000);
    for (let i = 0; i < limit; i++) {
      const b = bytes[i];
      if (b >= 0x20 && b <= 0x7E) {
        current += String.fromCharCode(b);
      } else {
        if (current.length >= 4 && current.length < 200 && !seen.has(current)) {
          if (/\.[a-zA-Z0-9]{1,10}$/.test(current) || current.includes('/') || current.includes('\\')) {
            seen.add(current);
            strings.push(current);
            if (strings.length >= 30) break;
          }
        }
        current = '';
      }
    }
    return strings;
  }
}
