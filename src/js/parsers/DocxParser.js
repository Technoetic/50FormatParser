class DocxParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.doc') return this.createResult(formatInfo.name, formatInfo.category, '[.doc 레거시 바이너리 포맷]\n.docx로 변환 후 업로드하면 완벽 파싱됩니다.', { format: 'DOC (레거시)' });

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
