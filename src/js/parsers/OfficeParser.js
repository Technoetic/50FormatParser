class OfficeParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.rtf') return this._parseRtf(file, formatInfo);
    if (['.odt', '.ods', '.odp'].includes(ext)) return this._parseOdf(file, formatInfo);
    if (ext === '.xps' || ext === '.oxps') return this._parseXps(file, formatInfo);
    if (['.pages', '.numbers', '.key'].includes(ext)) return this._parseIwork(file, formatInfo);
    if (['.wps', '.et', '.dps'].includes(ext)) return this._parseWps(file, formatInfo);
    if (['.one', '.onepkg'].includes(ext)) return this._parseOneNote(file, formatInfo);
    return this.createResult(formatInfo.name, formatInfo.category, '[' + formatInfo.name + ' 파일]\n파일 크기: ' + this.formatFileSize(file.size), { format: formatInfo.name, size: file.size });
  }

  async _parseRtf(file, info) {
    const text = await this.readAsText(file);

    // RtfParser 라이브러리 사용 (vendor/rtf-parser.browser.js - iarna/rtf-parser 번들)
    if (window.RtfParser) {
      try {
        const doc = await window.RtfParser.parseRtf(text);
        const extracted = window.RtfParser.getText(doc);
        const meta = { format: 'RTF (rtf-parser)', originalSize: text.length, characters: extracted.length };
        if (doc.fonts && doc.fonts.length > 0) {
          meta.fonts = doc.fonts.filter(f => f && f.name).map(f => f.name);
        }
        if (doc.colors && doc.colors.length > 0) {
          meta.colorCount = doc.colors.length;
        }
        if (extracted.trim()) {
          return this.createResult(info.name, info.category, extracted, meta);
        }
      } catch (e) {
        console.warn('RtfParser 파싱 실패, 폴백:', e.message);
      }
    }

    // 폴백: regex 기반
    let cleaned = text.replace(/\{\\[^{}]*\}/g, '').replace(/\\[a-z]+\d*\s?/gi, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\').replace(/\n+/g, '\n').trim();
    return this.createResult(info.name, info.category, cleaned, { format: 'RTF (폴백)', originalSize: text.length });
  }

  async _parseOdf(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const JSZip = await libLoader.loadJSZip();
      return await this._parseOdfWithJSZip(JSZip, buffer, info);
    } catch (e) {
      console.warn('JSZip ODF 파싱 실패, 폴백:', e.message);
      return this._parseOdfFallback(buffer, info);
    }
  }

  async _parseOdfWithJSZip(JSZip, buffer, info) {
    const zip = await JSZip.loadAsync(buffer);
    const meta = { format: 'OpenDocument (JSZip)' };
    const allText = [];

    // 메타데이터 추출
    try {
      const metaXml = await zip.file('meta.xml')?.async('string');
      if (metaXml) {
        meta.title = metaXml.match(/<dc:title>([^<]+)<\/dc:title>/)?.[1];
        meta.creator = metaXml.match(/<dc:creator>([^<]+)<\/dc:creator>/)?.[1];
        meta.description = metaXml.match(/<dc:description>([^<]+)<\/dc:description>/)?.[1];
      }
    } catch (e) { /* skip */ }

    // content.xml에서 텍스트 추출
    try {
      const contentXml = await zip.file('content.xml')?.async('string');
      if (contentXml) {
        // 텍스트 단락 추출
        const paragraphs = contentXml.match(/<text:p[^>]*>[\s\S]*?<\/text:p>/g) || [];
        for (const p of paragraphs) {
          const text = p.replace(/<[^>]+>/g, '').trim();
          if (text) allText.push(text);
        }

        // 테이블 셀 추출 (ODS)
        if (allText.length === 0) {
          const cells = contentXml.match(/<text:p>([^<]+)<\/text:p>/g) || [];
          for (const c of cells) {
            const text = c.replace(/<[^>]+>/g, '').trim();
            if (text) allText.push(text);
          }
        }
      }
    } catch (e) { /* skip */ }

    // styles.xml에서 추가 텍스트 (헤더/푸터)
    try {
      const stylesXml = await zip.file('styles.xml')?.async('string');
      if (stylesXml) {
        const headerFooter = stylesXml.match(/<text:p[^>]*>([^<]+)<\/text:p>/g) || [];
        for (const hf of headerFooter) {
          const text = hf.replace(/<[^>]+>/g, '').trim();
          if (text && text.length > 2) meta.headerFooter = (meta.headerFooter || []).concat(text);
        }
      }
    } catch (e) { /* skip */ }

    meta.paragraphs = allText.length;
    const fullText = allText.join('\n');
    meta.characters = fullText.length;

    let header = '';
    if (meta.title) header += meta.title + '\n';
    if (meta.creator) header += '작성자: ' + meta.creator + '\n';
    if (header) header += '\n---\n\n';

    return this.createResult(info.name, info.category, header + fullText, meta);
  }

  _parseOdfFallback(buffer, info) {
    const str = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
    const matches = str.match(/<text:p[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/text:p>/g) || [];
    const texts = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(Boolean);
    if (texts.length > 0) return this.createResult(info.name, info.category, texts.join('\n'), { format: 'OpenDocument (폴백)', paragraphs: texts.length });
    return this.createResult(info.name, info.category, '[OpenDocument 파일 - ZIP 해제 후 content.xml 파싱 필요]', { format: 'ODF' });
  }

  async _parseXps(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const JSZip = await libLoader.loadJSZip();
      return await this._parseXpsWithJSZip(JSZip, buffer, info);
    } catch (e) {
      console.warn('JSZip XPS 파싱 실패, 폴백:', e.message);
      return this._parseXpsFallback(buffer, info);
    }
  }

  async _parseXpsWithJSZip(JSZip, buffer, info) {
    const zip = await JSZip.loadAsync(buffer);
    const meta = { format: 'XPS (JSZip)' };
    const allText = [];

    // Documents/1/Pages/N.fpage 패턴으로 페이지 찾기
    const pageFiles = Object.keys(zip.files)
      .filter(name => /\.fpage$/i.test(name))
      .sort();

    for (const pagePath of pageFiles) {
      try {
        const xml = await zip.file(pagePath).async('string');
        const matches = xml.match(/UnicodeString="([^"]+)"/g) || [];
        const texts = matches.map(m => m.match(/"([^"]+)"/)?.[1]).filter(Boolean);
        if (texts.length > 0) allText.push(texts.join(' '));
      } catch (e) { /* skip */ }
    }

    meta.pages = pageFiles.length;
    meta.characters = allText.join('').length;

    return this.createResult(info.name, info.category,
      allText.length > 0 ? allText.join('\n\n') : '[XPS 파일 - 텍스트 추출 불가]',
      meta);
  }

  _parseXpsFallback(buffer, info) {
    const str = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
    const matches = str.match(/UnicodeString="([^"]+)"/g) || [];
    const texts = matches.map(m => m.match(/"([^"]+)"/)?.[1]).filter(Boolean);
    if (texts.length > 0) return this.createResult(info.name, info.category, texts.join(' '), { format: 'XPS (폴백)' });
    return this.createResult(info.name, info.category, '[XPS 파일 감지됨]', { format: 'XPS' });
  }

  async _parseIwork(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const ext = this.getFileExtension(file.name);
    const meta = { format: 'Apple iWork', size: file.size, fileType: ext };

    // ZIP 기반인 경우 JSZip 시도
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      try {
        const JSZip = await libLoader.loadJSZip();
        return await this._parseIworkWithJSZip(JSZip, buffer, info, ext);
      } catch (e) {
        console.warn('JSZip iWork 파싱 실패, 폴백:', e.message);
      }
    }

    // 폴백
    let text = '[Apple iWork 파일 (' + ext + ')]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    const extracted = this._extractReadableStrings(bytes);
    if (extracted.length > 0) {
      text += '\n추출된 문자열:\n' + extracted.join('\n');
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseIworkWithJSZip(JSZip, buffer, info, ext) {
    const zip = await JSZip.loadAsync(buffer);
    const meta = { format: 'Apple iWork (JSZip)', fileType: ext };
    const allText = [];

    // iWork 파일 구조 탐색
    const files = Object.keys(zip.files);

    // Index/Document.iwa 또는 XML 파일 찾기
    for (const path of files) {
      if (path.endsWith('.xml') || path.endsWith('.html')) {
        try {
          const content = await zip.file(path).async('string');
          // XML/HTML에서 텍스트 추출
          const texts = content
            .replace(/<[^>]+>/g, '\n')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 1);
          allText.push(...texts);
        } catch (e) { /* skip */ }
      }
    }

    // IWA (protobuf) 파일에서 문자열 추출
    if (allText.length === 0) {
      for (const path of files) {
        if (path.endsWith('.iwa')) {
          try {
            const data = await zip.file(path).async('uint8array');
            const strings = this._extractReadableStrings(data);
            allText.push(...strings);
          } catch (e) { /* skip */ }
        }
      }
    }

    meta.fileCount = files.length;
    meta.textBlocks = allText.length;

    let text = '[Apple iWork 파일 (' + ext + ')]\n파일 크기: ' + this.formatFileSize(buffer.byteLength) + '\n';
    text += '포함 파일 수: ' + files.length + '\n';
    if (allText.length > 0) {
      text += '\n추출된 텍스트:\n' + allText.join('\n');
    }

    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseWps(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const ext = this.getFileExtension(file.name);
    const meta = { format: 'WPS Office', size: file.size, fileType: ext };

    // ZIP 기반 WPS
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      try {
        const JSZip = await libLoader.loadJSZip();
        return await this._parseWpsWithJSZip(JSZip, buffer, info, ext);
      } catch (e) {
        console.warn('JSZip WPS 파싱 실패, 폴백:', e.message);
      }
    }

    let text = '[WPS Office 파일 (' + ext + ')]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      meta.isOle2 = true;
      text += '형식: OLE2 (레거시)\n';
    }
    const extracted = this._extractReadableStrings(bytes);
    if (extracted.length > 0) text += '\n추출된 문자열:\n' + extracted.join('\n');
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseWpsWithJSZip(JSZip, buffer, info, ext) {
    const zip = await JSZip.loadAsync(buffer);
    const meta = { format: 'WPS Office (JSZip)', fileType: ext };
    const allText = [];

    // WPS는 MS Office와 유사한 XML 구조
    const xmlFiles = Object.keys(zip.files).filter(name =>
      name.endsWith('.xml') && (name.includes('document') || name.includes('sheet') || name.includes('slide'))
    );

    for (const path of xmlFiles) {
      try {
        const xml = await zip.file(path).async('string');
        // w:t 태그 (문서)
        const wt = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
        for (const m of wt) {
          const text = m.replace(/<[^>]+>/g, '');
          if (text) allText.push(text);
        }
        // a:t 태그 (프레젠테이션)
        const at = xml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
        for (const m of at) {
          const text = m.replace(/<[^>]+>/g, '');
          if (text) allText.push(text);
        }
      } catch (e) { /* skip */ }
    }

    // 스프레드시트: sharedStrings에서 추출
    try {
      const ss = await zip.file('xl/sharedStrings.xml')?.async('string');
      if (ss) {
        const tMatches = ss.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
        for (const m of tMatches) {
          const text = m.replace(/<[^>]+>/g, '');
          if (text) allText.push(text);
        }
      }
    } catch (e) { /* skip */ }

    meta.textBlocks = allText.length;
    let text = '[WPS Office 파일 (' + ext + ')]\n파일 크기: ' + this.formatFileSize(buffer.byteLength) + '\n';
    text += '형식: ZIP 기반 (현대 WPS)\n';
    if (allText.length > 0) {
      text += '\n추출된 텍스트:\n' + allText.join('');
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseOneNote(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const ext = this.getFileExtension(file.name);
    const meta = { format: 'Microsoft OneNote', size: file.size };

    // .onepkg (ZIP 기반 패키지) — WASM으로 각 .one 섹션 파싱
    if (ext === '.onepkg' && bytes[0] === 0x50 && bytes[1] === 0x4B) {
      return this._parseOneNotePkg(buffer, file, info, meta);
    }

    // .one 섹션 파일 — WASM 라이브러리 시도
    try {
      await OneNoteWasm.init();
      return this._parseOneNoteWithWasm(bytes, file, info, meta);
    } catch (e) {
      console.warn('OneNote WASM 실패, 폴백:', e.message);
      return this._parseOneNoteFallback(bytes, buffer, file, info, meta, ext);
    }
  }

  _parseOneNoteWithWasm(bytes, file, info, meta) {
    const jsonStr = OneNoteWasm.parse(bytes, file.name);
    const parsed = JSON.parse(jsonStr);
    const allText = ['[Microsoft OneNote 파일 (onenote_parser)]'];
    const allTables = [];
    allText.push('파일 크기: ' + this.formatFileSize(file.size));

    if (!parsed.success) {
      throw new Error(parsed.error || 'WASM parse failed');
    }

    meta.sectionName = parsed.name;
    meta.pageCount = parsed.pageCount;
    allText.push('섹션명: ' + parsed.name);
    if (parsed.color) allText.push('색상: ' + parsed.color);
    allText.push('페이지 수: ' + parsed.pageCount);

    if (parsed.pages && parsed.pages.length > 0) {
      for (const page of parsed.pages) {
        allText.push('\n--- 페이지: ' + (page.title || '(제목 없음)') + ' ---');
        if (page.author) allText.push('작성자: ' + page.author);
        if (page.level > 0) allText.push('레벨: ' + page.level);
        if (page.images) allText.push('이미지: ' + page.images + '개');
        if (page.embeddedFiles) allText.push('첨부 파일: ' + page.embeddedFiles + '개');
        if (page.tables) allText.push('테이블: ' + page.tables + '개');
        if (page.text) {
          allText.push('');
          allText.push(page.text);
        }
      }
    }

    meta.library = 'onenote_parser (WASM)';
    const r = this.createResult(info.name, info.category, allText.join('\n'), meta);
    if (allTables.length > 0) r.tables = allTables;
    return r;
  }

  async _parseOneNotePkg(buffer, file, info, meta) {
    meta.isPackage = true;
    const allText = ['[Microsoft OneNote 패키지 (.onepkg)]'];
    allText.push('파일 크기: ' + this.formatFileSize(file.size));
    allText.push('형식: OneNote 패키지 (ZIP 기반)');

    try {
      const JSZip = await libLoader.loadJSZip();
      const zip = await JSZip.loadAsync(buffer);
      const files = Object.keys(zip.files);
      meta.fileCount = files.length;
      allText.push('포함 파일 수: ' + files.length);

      const oneFiles = files.filter(f => f.endsWith('.one'));
      let wasmReady = false;
      try { await OneNoteWasm.init(); wasmReady = true; } catch (e) { /* no wasm */ }

      for (const oneFile of oneFiles) {
        try {
          const data = await zip.file(oneFile).async('uint8array');
          if (wasmReady) {
            const jsonStr = OneNoteWasm.parse(data, oneFile);
            const parsed = JSON.parse(jsonStr);
            if (parsed.success && parsed.pages) {
              allText.push('\n== 섹션: ' + parsed.name + ' (' + parsed.pageCount + '페이지) ==');
              for (const page of parsed.pages) {
                allText.push('\n--- ' + (page.title || '(제목 없음)') + ' ---');
                if (page.text) allText.push(page.text);
              }
            }
          } else {
            const texts = this._extractOneNoteText(data);
            if (texts.length > 0) allText.push('\n[' + oneFile + ']\n' + texts.join('\n'));
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) {
      allText.push('[패키지 열기 실패: ' + e.message + ']');
    }
    return this.createResult(info.name, info.category, allText.join('\n'), meta);
  }

  _parseOneNoteFallback(bytes, buffer, file, info, meta, ext) {
    const allText = ['[Microsoft OneNote 파일 (' + ext + ')]'];
    allText.push('파일 크기: ' + this.formatFileSize(file.size));

    if (bytes.length >= 16 && bytes[0] === 0xE4 && bytes[1] === 0x52 && bytes[2] === 0x5C && bytes[3] === 0x7B) {
      meta.validMagic = true;
      allText.push('매직: OneNote (유효)');
      try {
        const guidBytes = bytes.slice(0, 16);
        meta.formatGuid = this._formatGuid(guidBytes);
        if (bytes.length >= 32) {
          const view = new DataView(buffer);
          meta.fileFormatVersion = '0x' + view.getUint32(16, true).toString(16).toUpperCase();
        }
      } catch (e) { /* skip */ }

      const texts = this._extractOneNoteText(bytes);
      if (texts.length > 0) {
        allText.push('\n추출된 텍스트:');
        allText.push(texts.join('\n'));
        meta.textBlocks = texts.length;
      } else {
        const extracted = this._extractReadableStrings(bytes);
        if (extracted.length > 0) {
          allText.push('\n추출된 문자열 (범용):');
          allText.push(extracted.join('\n'));
          meta.textBlocks = extracted.length;
        }
      }
    } else {
      allText.push('매직: 확인 불가');
      const extracted = this._extractReadableStrings(bytes);
      if (extracted.length > 0) {
        allText.push('\n추출된 문자열:');
        allText.push(extracted.join('\n'));
        meta.textBlocks = extracted.length;
      }
    }
    return this.createResult(info.name, info.category, allText.join('\n'), meta);
  }

  // MS-ONE 바이너리에서 텍스트 추출
  // OneNote는 텍스트를 UTF-16LE로 Object Space 내에 저장
  // 텍스트 블록은 보통 연속적인 UTF-16LE 문자열로 존재
  _extractOneNoteText(bytes) {
    const texts = [];
    const seen = new Set();
    const len = bytes.length;

    // 1단계: UTF-16LE 텍스트 블록 탐색
    // OneNote 텍스트는 보통 길이 프리픽스 + UTF-16LE 데이터 형태
    // 또는 연속 UTF-16LE 영역으로 존재
    let i = 0;
    while (i < len - 1) {
      // UTF-16LE 문자열 시작 탐지: printable 문자가 연속으로 나오는 구간
      const lo = bytes[i];
      const hi = bytes[i + 1];
      const code = lo | (hi << 8);

      if (this._isOneNotePrintable(code)) {
        // UTF-16LE 문자열 수집 시작
        let str = '';
        let j = i;
        while (j < len - 1) {
          const c = bytes[j] | (bytes[j + 1] << 8);
          if (this._isOneNotePrintable(c)) {
            str += String.fromCharCode(c);
            j += 2;
          } else if (c === 0x0A || c === 0x0D || c === 0x09) {
            // 줄바꿈, 탭
            str += c === 0x0A ? '\n' : c === 0x09 ? '\t' : '';
            j += 2;
          } else {
            break;
          }
        }

        // 최소 길이 필터: 유의미한 텍스트만
        const trimmed = str.trim();
        if (trimmed.length >= 4 && !seen.has(trimmed)) {
          // 순수 숫자/기호만인 문자열 제외
          if (/[a-zA-Z\uAC00-\uD7AF\u3040-\u9FFF\u0400-\u04FF]/.test(trimmed)) {
            seen.add(trimmed);
            texts.push(trimmed);
            if (texts.length >= 200) break;
          }
        }
        i = j;
      } else {
        i++;
      }
    }

    // 2단계: 텍스트 병합 (인접 블록 합치기)
    return this._mergeAdjacentTexts(texts);
  }

  _isOneNotePrintable(code) {
    return (code >= 0x20 && code <= 0x7E) ||   // ASCII printable
      (code >= 0xAC00 && code <= 0xD7AF) ||     // 한글 완성형
      (code >= 0x3000 && code <= 0x9FFF) ||     // CJK
      (code >= 0x0400 && code <= 0x04FF) ||     // 키릴 문자
      (code >= 0x00C0 && code <= 0x024F) ||     // 라틴 확장
      (code >= 0xFF00 && code <= 0xFFEF);       // 전각 문자
  }

  _mergeAdjacentTexts(texts) {
    if (texts.length <= 1) return texts;
    const merged = [];
    let current = texts[0];
    for (let i = 1; i < texts.length; i++) {
      // 짧은 조각들을 합침
      if (current.length < 20 && texts[i].length < 20) {
        current += ' ' + texts[i];
      } else {
        merged.push(current);
        current = texts[i];
      }
    }
    merged.push(current);
    return merged;
  }

  _formatGuid(bytes) {
    const hex = (b) => b.toString(16).padStart(2, '0');
    // GUID는 little-endian으로 인코딩된 first 3 components
    const p1 = [bytes[3], bytes[2], bytes[1], bytes[0]].map(hex).join('');
    const p2 = [bytes[5], bytes[4]].map(hex).join('');
    const p3 = [bytes[7], bytes[6]].map(hex).join('');
    const p4 = [bytes[8], bytes[9]].map(hex).join('');
    const p5 = Array.from(bytes.slice(10, 16)).map(hex).join('');
    return '{' + p1 + '-' + p2 + '-' + p3 + '-' + p4 + '-' + p5 + '}';
  }

  _extractReadableStrings(bytes) {
    const strings = [];
    const seen = new Set();
    let current = '';
    const limit = Math.min(bytes.length, 100000);
    for (let i = 0; i < limit; i++) {
      const b = bytes[i];
      if (b >= 0x20 && b <= 0x7E) {
        current += String.fromCharCode(b);
      } else if (b === 0 && current.length === 0 && i + 1 < limit && bytes[i + 1] >= 0x20 && bytes[i + 1] <= 0x7E) {
        continue;
      } else {
        if (current.length >= 5 && !seen.has(current) && /[a-zA-Z\uAC00-\uD7AF]/.test(current) && !/^[0-9.]+$/.test(current)) {
          seen.add(current);
          strings.push(current);
          if (strings.length >= 50) break;
        }
        current = '';
      }
    }
    const utf16Strings = this._extractUtf16Strings(bytes);
    for (const s of utf16Strings) {
      if (!seen.has(s)) {
        seen.add(s);
        strings.push(s);
        if (strings.length >= 50) break;
      }
    }
    return strings;
  }

  _extractUtf16Strings(bytes) {
    const strings = [];
    const limit = Math.min(bytes.length - 1, 100000);
    let current = '';
    for (let i = 0; i < limit; i += 2) {
      const lo = bytes[i];
      const hi = bytes[i + 1];
      const code = lo | (hi << 8);
      if ((code >= 0x20 && code <= 0x7E) || (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x3000 && code <= 0x9FFF)) {
        current += String.fromCharCode(code);
      } else {
        if (current.length >= 3 && /[a-zA-Z\uAC00-\uD7AF]/.test(current)) {
          strings.push(current);
          if (strings.length >= 20) break;
        }
        current = '';
      }
    }
    return strings;
  }
}
