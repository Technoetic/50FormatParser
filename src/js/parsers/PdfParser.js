class PdfParser extends BaseParser {
  async parse(file, formatInfo) {
    const buffer = await this.readAsArrayBuffer(file);
    const header = new Uint8Array(buffer.slice(0, 5));
    const headerStr = String.fromCharCode(...header);

    const ext = this.getFileExtension(file.name);
    if (ext === '.fdf' || ext === '.xfdf') {
      return this._parseFdf(file, buffer, formatInfo);
    }

    if (!headerStr.startsWith('%PDF')) {
      return this.createResult(formatInfo.name, formatInfo.category, '', { error: 'PDF 시그니처를 찾을 수 없습니다' });
    }

    try {
      const pdfjsLib = await libLoader.loadPdfJs();
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      return await this._parseWithPdfJs(pdfjsLib, buffer, formatInfo);
    } catch (e) {
      console.warn('pdf.js 로드 실패, 기본 파서로 폴백:', e.message);
      return this._parseFallback(buffer, file, formatInfo);
    }
  }

  async _parseWithPdfJs(pdfjsLib, buffer, info) {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const metadata = { format: 'PDF', pages: pdf.numPages };

    try {
      const meta = await pdf.getMetadata();
      if (meta.info) {
        if (meta.info.Title) metadata.title = meta.info.Title;
        if (meta.info.Author) metadata.author = meta.info.Author;
        if (meta.info.Subject) metadata.subject = meta.info.Subject;
        if (meta.info.Creator) metadata.creator = meta.info.Creator;
        if (meta.info.Producer) metadata.producer = meta.info.Producer;
        if (meta.info.PDFFormatVersion) metadata.pdfVersion = meta.info.PDFFormatVersion;
      }
    } catch (e) { /* 메타데이터 없을 수 있음 */ }

    const pages = [];
    const allTables = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items.filter(item => item.str && item.str.trim());

      if (items.length === 0) {
        pages.push('[페이지 ' + i + ': 텍스트 없음 (스캔/이미지 PDF)]');
        continue;
      }

      const lines = this._groupIntoLines(items);
      pages.push(lines.join('\n'));

      const tableData = this._detectTable(items, lines);
      if (tableData) { tableData.page = i; allTables.push(tableData); }
    }

    const fullText = pages.join('\n\n--- 페이지 ' + '구분 ---\n\n');
    metadata.characters = fullText.length;

    return this.createResult(info.name, info.category, fullText, metadata,
      allTables.length > 0 ? { tables: allTables } : {});
  }

  _groupIntoLines(items) {
    if (items.length === 0) return [];
    const sorted = items.slice().sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.transform[4] - b.transform[4];
    });
    const lines = [];
    let currentLine = [sorted[0]];
    let currentY = sorted[0].transform[5];
    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      if (Math.abs(item.transform[5] - currentY) < 3) {
        currentLine.push(item);
      } else {
        currentLine.sort((a, b) => a.transform[4] - b.transform[4]);
        lines.push(currentLine.map(it => it.str).join(' '));
        currentLine = [item];
        currentY = item.transform[5];
      }
    }
    currentLine.sort((a, b) => a.transform[4] - b.transform[4]);
    lines.push(currentLine.map(it => it.str).join(' '));
    return lines;
  }

  _detectTable(items, lines) {
    if (!lines || lines.length < 2) return null;
    const headers = lines[0].split(/\s{2,}/).filter(Boolean);
    if (headers.length < 2) return null;
    const rows = lines.slice(1).map(l => l.split(/\s{2,}/).filter(Boolean)).filter(r => r.length >= 2);
    if (rows.length === 0) return null;
    return { headers, rows };
  }

  _parseFallback(buffer, file, info) {
    const bytes = new Uint8Array(buffer);
    const text = [];
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    const matches = str.match(/BT[\s\S]*?ET/g) || [];
    for (const match of matches) {
      const tjMatches = match.match(/\(([^)]*)\)\s*Tj/g) || [];
      for (const tj of tjMatches) {
        const m = tj.match(/\(([^)]*)\)/);
        if (m) text.push(m[1]);
      }
    }
    const result = text.join(' ').substring(0, 10000);
    return this.createResult(info.name, info.category,
      result || '[PDF 파일 - pdf.js 로드 실패]\n파일 크기: ' + this.formatFileSize(file.size),
      { format: 'PDF (폴백)', size: file.size });
  }

  async _parseFdf(file, buffer, info) {
    const text = await this.readAsText(file);
    const fields = [];
    const fieldMatches = text.matchAll(/\/T\s*\(([^)]+)\)[\s\S]*?\/V\s*\(([^)]*)\)/g);
    for (const m of fieldMatches) fields.push({ name: m[1], value: m[2] });
    if (fields.length > 0) {
      return this.createResult(info.name, info.category,
        fields.map(f => f.name + ': ' + f.value).join('\n'),
        { format: 'FDF', fields: fields.length });
    }
    return this.createResult(info.name, info.category, text.substring(0, 5000), { format: 'FDF' });
  }
}
