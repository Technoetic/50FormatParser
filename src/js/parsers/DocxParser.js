class DocxParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.doc') return this._parseDoc(file, formatInfo);

    const buffer = await this.readAsArrayBuffer(file);
    try {
      const mammoth = await libLoader.loadMammoth();
      const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
      const text = rawResult.value || '';
      const html = htmlResult.value || '';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({ level: parseInt(h.tagName[1]), text: h.textContent }));
      const tables = this._extractTablesFromHtml(doc);
      return this.createResult(formatInfo.name, formatInfo.category, text, {
        format: 'DOCX (Mammoth.js)', characters: text.length,
        paragraphs: text.split('\n\n').filter(Boolean).length, headings,
        images: doc.querySelectorAll('img').length, html
      }, tables.length > 0 ? { tables } : {});
    } catch (e1) {
      try {
        const JSZip = await libLoader.loadJSZip();
        const zip = await JSZip.loadAsync(buffer);
        const xml = await zip.file('word/document.xml')?.async('string');
        if (!xml) return this.createResult(formatInfo.name, formatInfo.category, '[word/document.xml 없음]', {});
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const paras = [];
        doc.querySelectorAll('p').forEach(p => {
          const t = []; p.querySelectorAll('t').forEach(el => t.push(el.textContent));
          if (t.length) paras.push(t.join(''));
        });
        return this.createResult(formatInfo.name, formatInfo.category, paras.join('\n\n'), { format: 'DOCX (JSZip)', paragraphs: paras.length });
      } catch (e2) {
        const str = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
        const matches = str.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const texts = matches.map(m => { const r = m.match(/>([^<]*)</); return r ? r[1] : ''; });
        return this.createResult(formatInfo.name, formatInfo.category, texts.join(' ') || '[DOCX 파싱 실패]', { format: 'DOCX (폴백)' });
      }
    }
  }

  async _parseDoc(file, formatInfo) {
    const buffer = await this.readAsArrayBuffer(file);
    const data = new Uint8Array(buffer);

    // 방법 1: SheetJS CFB로 OLE2 WordDocument 스트림에서 텍스트 추출
    try {
      const XLSX = await libLoader.loadSheetJS();
      const cfb = XLSX.CFB.read(buffer, { type: 'array' });
      const text = this._extractTextFromCfb(cfb);
      if (text && text.length > 0) {
        return this.createResult(formatInfo.name, formatInfo.category, text, {
          format: 'DOC (CFB/OLE2)',
          characters: text.length,
          paragraphs: text.split('\n').filter(Boolean).length
        });
      }
    } catch (e) {
      // CFB 실패 시 폴백
    }

    // 방법 2: 바이너리에서 유니코드/ASCII 텍스트 직접 추출
    try {
      const text = this._extractTextFromBinary(data);
      if (text && text.length > 10) {
        return this.createResult(formatInfo.name, formatInfo.category, text, {
          format: 'DOC (바이너리 추출)',
          characters: text.length,
          paragraphs: text.split('\n').filter(Boolean).length
        });
      }
    } catch (e) {
      // 무시
    }

    return this.createResult(formatInfo.name, formatInfo.category,
      '[.doc 텍스트 추출 실패]\n파일이 암호화되었거나 손상되었을 수 있습니다.', { format: 'DOC (실패)' });
  }

  _extractTextFromCfb(cfb) {
    const parts = [];

    // WordDocument 스트림에서 본문 텍스트 추출
    for (const entry of cfb.FileIndex) {
      if (!entry.name) continue;
      if (entry.name.toLowerCase() === 'worddocument') {
        const content = entry.content;
        if (content && content.length > 0) {
          const extracted = this._decodeDocStream(content);
          if (extracted) parts.push(extracted);
        }
      }
    }

    if (parts.length > 0) return parts.join('\n');

    // 폴백: 모든 스트림에서 텍스트 추출
    for (const entry of cfb.FileIndex) {
      if (!entry.content || entry.content.length === 0) continue;
      const text = this._decodeDocStream(entry.content);
      if (text && text.length > 20) parts.push(text);
    }

    return parts.join('\n');
  }

  _decodeDocStream(content) {
    const u16 = this._extractUtf16Text(content);
    const ascii = this._extractAsciiText(content);
    if (u16 && ascii) return u16.length >= ascii.length ? u16 : ascii;
    return u16 || ascii || '';
  }

  _extractUtf16Text(content) {
    const chunks = [];
    let chunk = [];
    let i = 0;

    while (i + 1 < content.length) {
      const code = content[i] | (content[i + 1] << 8);

      if ((code >= 0x20 && code <= 0x7E) ||
          (code >= 0xAC00 && code <= 0xD7AF) ||
          (code >= 0x3131 && code <= 0x318E) ||
          (code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3000 && code <= 0x303F) ||
          (code >= 0xFF01 && code <= 0xFF5E) ||
          code === 0x0A || code === 0x0D || code === 0x09) {
        if (code === 0x0D || code === 0x0A) chunk.push('\n');
        else if (code === 0x09) chunk.push('\t');
        else chunk.push(String.fromCharCode(code));
      } else {
        if (chunk.length >= 4) chunks.push(chunk.join(''));
        chunk = [];
      }
      i += 2;
    }
    if (chunk.length >= 4) chunks.push(chunk.join(''));

    const text = chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return text.length > 10 ? text : '';
  }

  _extractAsciiText(content) {
    const chunks = [];
    let chunk = [];

    for (let i = 0; i < content.length; i++) {
      const b = content[i];
      if ((b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09) {
        if (b === 0x0D || b === 0x0A) chunk.push('\n');
        else if (b === 0x09) chunk.push('\t');
        else chunk.push(String.fromCharCode(b));
      } else {
        if (chunk.length >= 6) chunks.push(chunk.join(''));
        chunk = [];
      }
    }
    if (chunk.length >= 6) chunks.push(chunk.join(''));

    const text = chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return text.length > 20 ? text : '';
  }

  _extractTextFromBinary(data) {
    const u16 = this._extractUtf16Text(data);
    if (u16 && u16.length > 50) return u16;
    return this._extractAsciiText(data) || '';
  }

  _extractTablesFromHtml(doc) {
    const tables = [];
    doc.querySelectorAll('table').forEach(table => {
      const headers = []; const rows = [];
      const hr = table.querySelector('thead tr') || table.querySelector('tr');
      if (hr) hr.querySelectorAll('th,td').forEach(c => headers.push(c.textContent.trim()));
      table.querySelectorAll('tbody tr, tr').forEach((row, i) => {
        if (i === 0 && headers.length) return;
        const cells = []; row.querySelectorAll('td,th').forEach(c => cells.push(c.textContent.trim()));
        if (cells.length) rows.push(cells);
      });
      if (headers.length || rows.length) tables.push({ headers, rows });
    });
    return tables;
  }
}
