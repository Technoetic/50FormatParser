class HwpParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.hwpx') return this._parseHwpx(file, formatInfo);
    return this._parseHwp(file, formatInfo);
  }

  async _parseHwp(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const header = new Uint8Array(buffer.slice(0, 8));

    if (header[0] === 0xD0 && header[1] === 0xCF && header[2] === 0x11 && header[3] === 0xE0) {
      // hwp.js 라이브러리 사용
      if (window.HwpJs && window.HwpJs.parse) {
        try {
          return this._parseHwpWithLib(buffer, file, info);
        } catch (e) {
          console.warn('hwp.js 파싱 실패, 폴백:', e.message);
        }
      }

      return this._parseHwpFallback(buffer, file, info);
    }
    return this.createResult(info.name, info.category, '[HWP 파일 - 시그니처를 확인할 수 없습니다]', { error: 'Unknown HWP format' });
  }

  _parseHwpWithLib(buffer, file, info) {
    var doc = window.HwpJs.parse(buffer);
    var meta = { format: 'HWP (hwp.js)', size: file.size, ole2: true };
    var allText = ['[HWP 파일 (hwp.js)]'];
    allText.push('용량: ' + this.formatFileSize(file.size));

    // 문서 정보
    if (doc.info) {
      meta.sectionSize = doc.info.sectionSize;
      if (doc.info.sectionSize) allText.push('섹션 수: ' + doc.info.sectionSize);
      if (doc.info.fontFaces && doc.info.fontFaces.length > 0) {
        meta.fontCount = doc.info.fontFaces.length;
      }
      if (doc.info.charShapes && doc.info.charShapes.length > 0) {
        meta.charShapeCount = doc.info.charShapes.length;
      }
    }

    // 헤더 정보
    if (doc.header) {
      if (doc.header.version) meta.version = doc.header.version;
      if (doc.header.signature) meta.signature = doc.header.signature;
    }

    // 섹션별 텍스트 추출
    var textParagraphs = [];
    if (doc.sections && doc.sections.length > 0) {
      meta.sections = doc.sections.length;
      for (var s = 0; s < doc.sections.length; s++) {
        var section = doc.sections[s];
        if (section.content && section.content.length > 0) {
          for (var p = 0; p < section.content.length; p++) {
            var paragraph = section.content[p];
            if (paragraph.content && paragraph.content.length > 0) {
              var paraText = '';
              for (var c = 0; c < paragraph.content.length; c++) {
                var ch = paragraph.content[c];
                if (ch.type === 0) { // CharType.Char
                  paraText += typeof ch.value === 'string' ? ch.value : String.fromCharCode(ch.value);
                }
              }
              var trimmed = paraText.trim();
              if (trimmed.length > 0) textParagraphs.push(trimmed);
            }
          }
        }
      }
    }

    meta.paragraphs = textParagraphs.length;
    if (textParagraphs.length > 0) {
      var fullText = textParagraphs.join('\n');
      meta.characters = fullText.length;
      allText.push('문단 수: ' + textParagraphs.length);
      allText.push('글자 수: ' + fullText.length);
      allText.push('\n--- 텍스트 ---');
      allText.push(fullText);
    }

    meta.library = 'hwp.js';
    return this.createResult(info.name, info.category, allText.join('\n'), meta);
  }

  _parseHwpFallback(buffer, file, info) {
    var bytes = new Uint8Array(buffer);
    var texts = this._extractHwpText(bytes);
    var text = '[HWP 파일 (OLE2 바이너리)]\n용량: ' + this.formatFileSize(file.size);
    if (texts.length > 0) {
      text += '\n\n--- 추출된 텍스트 ---\n' + texts.join('\n');
    }
    return this.createResult(info.name, info.category, text, { format: 'HWP (폴백)', ole2: true, textBlocks: texts.length });
  }

  _extractHwpText(bytes) {
    var texts = [];
    var limit = Math.min(bytes.length - 1, 200000);
    var current = '';
    for (var i = 0; i < limit; i += 2) {
      var lo = bytes[i];
      var hi = bytes[i + 1];
      var code = lo | (hi << 8);
      if ((code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x20 && code <= 0x7E) || (code >= 0x3000 && code <= 0x9FFF) || code === 0x0A || code === 0x0D) {
        if (code === 0x0A || code === 0x0D) {
          if (current.trim().length >= 2) texts.push(current.trim());
          current = '';
        } else {
          current += String.fromCharCode(code);
        }
      } else {
        if (current.trim().length >= 2 && /[\uAC00-\uD7AF]/.test(current)) texts.push(current.trim());
        current = '';
      }
      if (texts.length >= 200) break;
    }
    if (current.trim().length >= 2 && /[\uAC00-\uD7AF]/.test(current)) texts.push(current.trim());
    return texts;
  }

  async _parseHwpx(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const JSZip = await libLoader.loadJSZip();
      return await this._parseHwpxWithJSZip(JSZip, buffer, info);
    } catch (e) {
      console.warn('JSZip HWPX 파싱 실패, 폴백:', e.message);
      return this._parseHwpxFallback(buffer, info);
    }
  }

  async _parseHwpxWithJSZip(JSZip, buffer, info) {
    const zip = await JSZip.loadAsync(buffer);
    const meta = { format: 'HWPX (JSZip)' };
    const allText = [];

    // Contents/section*.xml 파일에서 텍스트 추출
    const sectionFiles = Object.keys(zip.files)
      .filter(name => /Contents\/section\d+\.xml$/i.test(name))
      .sort();

    for (const sectionPath of sectionFiles) {
      try {
        const xml = await zip.file(sectionPath).async('string');
        // <hp:t> 또는 <t> 태그에서 텍스트 추출
        const matches = xml.match(/<hp:t>([^<]+)<\/hp:t>/g) || xml.match(/<t>([^<]+)<\/t>/g) || [];
        const texts = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(Boolean);
        if (texts.length > 0) allText.push(texts.join('\n'));
      } catch (e) { /* skip */ }
    }

    // section 파일을 못 찾은 경우 모든 XML 파일 시도
    if (allText.length === 0) {
      const xmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.xml'));
      for (const path of xmlFiles) {
        try {
          const xml = await zip.file(path).async('string');
          const matches = xml.match(/<hp:t>([^<]+)<\/hp:t>/g) || xml.match(/<t>([^<]+)<\/t>/g) || [];
          const texts = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(Boolean);
          if (texts.length > 0) allText.push(texts.join('\n'));
        } catch (e) { /* skip */ }
      }
    }

    // 메타데이터 추출
    try {
      const metaXml = await zip.file('META-INF/container.xml')?.async('string') ||
                      await zip.file('docInfo.xml')?.async('string');
      if (metaXml) {
        meta.title = metaXml.match(/<dc:title>([^<]+)<\/dc:title>/)?.[1];
        meta.creator = metaXml.match(/<dc:creator>([^<]+)<\/dc:creator>/)?.[1];
      }
    } catch (e) { /* skip */ }

    meta.sections = sectionFiles.length || 0;
    meta.paragraphs = allText.length;
    const fullText = allText.join('\n\n');
    meta.characters = fullText.length;

    if (fullText.length > 0) {
      return this.createResult(info.name, info.category, fullText, meta);
    }
    return this.createResult(info.name, info.category, '[HWPX 파일 감지됨 - 텍스트 추출 불가]', meta);
  }

  _parseHwpxFallback(buffer, info) {
    const str = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
    const matches = str.match(/<hp:t>([^<]+)<\/hp:t>/g) || str.match(/<t>([^<]+)<\/t>/g) || [];
    const texts = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(Boolean);
    if (texts.length > 0) return this.createResult(info.name, info.category, texts.join('\n'), { format: 'HWPX (폴백)', paragraphs: texts.length });
    return this.createResult(info.name, info.category, '[HWPX 파일 감지됨 - ZIP 해제 후 XML 파싱 필요]', { format: 'HWPX' });
  }
}
