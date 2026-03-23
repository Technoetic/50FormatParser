class SaasParser extends BaseParser {
  async parse(file, formatInfo) {
    // SaaS 내보내기 파일은 실제로 JSON, CSV, HTML, ZIP 등의 형태
    // 자동 감지해서 적절한 파싱 수행
    const ext = this.getFileExtension(file.name);
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);

    // ZIP-based export (Notion, Confluence, Slack 등)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      return this._parseZipExport(file, buffer, formatInfo);
    }

    // Text-based: JSON, CSV, HTML, Markdown
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const trimmed = text.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this._parseJsonExport(text, file, formatInfo);
    }
    if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
      return this._parseHtmlExport(text, file, formatInfo);
    }
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      return this._parseXmlExport(text, file, formatInfo);
    }
    if (trimmed.startsWith('#') || trimmed.includes('\n## ')) {
      return this._parseMarkdownExport(text, file, formatInfo);
    }
    if (trimmed.includes(',') && trimmed.includes('\n')) {
      return this._parseCsvExport(text, file, formatInfo);
    }

    // Figma binary
    if (ext === '.fig') {
      return this._parseFigma(bytes, file, formatInfo);
    }

    return this.createResult(formatInfo.name, formatInfo.category,
      '[' + formatInfo.name + ' 내보내기 파일]\n' +
      '파일명: ' + file.name + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n\n' +
      '이 서비스의 내보내기 파일을 업로드해 주세요.\n' +
      '지원 형식: JSON, CSV, HTML, Markdown, XML, ZIP',
      { format: formatInfo.name, size: file.size });
  }

  async _parseZipExport(file, buffer, info) {
    const entries = this._listZipEntries(buffer);
    const fileTypes = {};
    entries.forEach(e => {
      const ext = e.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || 'other';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    });
    let text = '[' + info.name + ' 내보내기 (ZIP)]\n' +
      '파일 수: ' + entries.length + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n\n' +
      '포함된 파일 유형:\n';
    for (const [type, count] of Object.entries(fileTypes).sort((a, b) => b[1] - a[1])) {
      text += '  .' + type + ': ' + count + '개\n';
    }
    text += '\n파일 목록:\n' + entries.slice(0, 50).map(e => '  ' + e.name + ' (' + this.formatFileSize(e.size) + ')').join('\n');
    if (entries.length > 50) text += '\n  ... 외 ' + (entries.length - 50) + '개';
    return this.createResult(info.name, info.category, text,
      { format: info.name + ' (ZIP)', totalFiles: entries.length, fileTypes },
      { tables: [{ headers: ['파일명', '크기'], rows: entries.slice(0, 100).map(e => [e.name, this.formatFileSize(e.size)]) }] });
  }

  _listZipEntries(buffer) {
    const view = new DataView(buffer);
    const entries = [];
    let offset = 0;
    while (offset < buffer.byteLength - 4 && entries.length < 500) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;
      const compressedSize = view.getUint32(offset + 18, true);
      const uncompressedSize = view.getUint32(offset + 22, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameBytes = new Uint8Array(buffer, offset + 30, nameLen);
      const name = new TextDecoder().decode(nameBytes);
      entries.push({ name, size: uncompressedSize, compressedSize });
      offset += 30 + nameLen + extraLen + compressedSize;
    }
    return entries;
  }

  _parseJsonExport(text, file, info) {
    try {
      const data = JSON.parse(text);
      const preview = JSON.stringify(data, null, 2).substring(0, 5000);
      const meta = { format: info.name + ' (JSON)', size: file.size };
      if (Array.isArray(data)) {
        meta.recordCount = data.length;
        meta.type = 'array';
        if (data.length > 0 && typeof data[0] === 'object') {
          meta.fields = Object.keys(data[0]);
        }
      } else if (typeof data === 'object') {
        meta.topLevelKeys = Object.keys(data).slice(0, 20);
        meta.type = 'object';
      }
      let resultText = '[' + info.name + ' 내보내기 (JSON)]\n' +
        '파일 크기: ' + this.formatFileSize(file.size) + '\n';
      if (meta.recordCount) resultText += '레코드 수: ' + meta.recordCount + '\n';
      if (meta.fields) resultText += '필드: ' + meta.fields.join(', ') + '\n';
      if (meta.topLevelKeys) resultText += '키: ' + meta.topLevelKeys.join(', ') + '\n';
      resultText += '\n' + preview;
      // Build table if array of objects
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        const headers = Object.keys(data[0]).slice(0, 10);
        const rows = data.slice(0, 100).map(item => headers.map(h => String(item[h] !== undefined ? item[h] : '').substring(0, 100)));
        return this.createResult(info.name, info.category, resultText, meta, { tables: [{ headers, rows }] });
      }
      return this.createResult(info.name, info.category, resultText, meta);
    } catch (e) {
      return this.createResult(info.name, info.category, text.substring(0, 5000), { format: info.name, parseError: e.message });
    }
  }

  _parseHtmlExport(text, file, info) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const title = doc.title || '';
    const bodyText = doc.body ? doc.body.textContent.substring(0, 5000) : text.substring(0, 5000);
    return this.createResult(info.name, info.category,
      '[' + info.name + ' 내보내기 (HTML)]\n' +
      '제목: ' + title + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n\n' + bodyText,
      { format: info.name + ' (HTML)', title, size: file.size });
  }

  _parseXmlExport(text, file, info) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const root = doc.documentElement;
    const children = root ? Array.from(root.children).slice(0, 20) : [];
    let resultText = '[' + info.name + ' 내보내기 (XML)]\n' +
      '루트 요소: ' + (root ? root.tagName : 'N/A') + '\n' +
      '자식 요소 수: ' + (root ? root.children.length : 0) + '\n\n';
    resultText += text.substring(0, 5000);
    return this.createResult(info.name, info.category, resultText, { format: info.name + ' (XML)', rootTag: root?.tagName, size: file.size });
  }

  _parseMarkdownExport(text, file, info) {
    const headings = (text.match(/^#{1,6}\s+.+/gm) || []).slice(0, 20);
    return this.createResult(info.name, info.category,
      '[' + info.name + ' 내보내기 (Markdown)]\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n' +
      '제목 수: ' + headings.length + '\n\n' + text.substring(0, 5000),
      { format: info.name + ' (Markdown)', headings, size: file.size });
  }

  _parseCsvExport(text, file, info) {
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0] ? lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1')) : [];
    const rows = lines.slice(1, 101).map(line => {
      const cells = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQuote = !inQuote; continue; }
        if (line[i] === ',' && !inQuote) { cells.push(current.trim()); current = ''; continue; }
        current += line[i];
      }
      cells.push(current.trim());
      return cells.map(c => c.substring(0, 100));
    });
    return this.createResult(info.name, info.category,
      '[' + info.name + ' 내보내기 (CSV)]\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n' +
      '행 수: ' + lines.length + '\n' +
      '열 수: ' + headers.length + '\n\n' + text.substring(0, 3000),
      { format: info.name + ' (CSV)', rowCount: lines.length, columns: headers },
      { tables: [{ headers: headers.slice(0, 10), rows: rows.slice(0, 100) }] });
  }

  _parseFigma(bytes, file, info) {
    let text = '[Figma 디자인 파일]\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    // Figma .fig files are ZIP-based
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      text += '형식: ZIP 기반\n';
    }
    // Extract any readable strings
    const strings = [];
    const seen = new Set();
    let current = '';
    for (let i = 0; i < Math.min(bytes.length, 50000); i++) {
      if (bytes[i] >= 0x20 && bytes[i] <= 0x7E) {
        current += String.fromCharCode(bytes[i]);
      } else {
        if (current.length >= 4 && !seen.has(current) && /[a-zA-Z]/.test(current)) {
          seen.add(current);
          strings.push(current);
          if (strings.length >= 30) break;
        }
        current = '';
      }
    }
    if (strings.length > 0) {
      text += '\n감지된 문자열:\n' + strings.map((s, i) => (i + 1) + '. ' + s).join('\n');
    }
    return this.createResult(info.name, info.category, text, { format: 'Figma', size: file.size });
  }
}
