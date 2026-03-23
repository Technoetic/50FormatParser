class TextParser extends BaseParser {
  async parse(file, formatInfo) {
    const text = await this.readAsText(file);
    const ext = this.getFileExtension(file.name);
    const delimiter = ext === '.tsv' ? '\t' : ',';
    return this._parseCsv(text, formatInfo, delimiter);
  }

  async _parseCsv(text, info, delimiter) {
    try {
      const Papa = await libLoader.loadPapaParse();
      return this._parseCsvWithPapa(Papa, text, info, delimiter);
    } catch (e) {
      console.warn('PapaParse 로드 실패, 폴백:', e.message);
      return this._parseCsvFallback(text, info, delimiter);
    }
  }

  _parseCsvWithPapa(Papa, text, info, delimiter) {
    const result = Papa.parse(text, {
      delimiter: delimiter,
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    const rows = result.data;
    if (rows.length === 0) return this.createResult(info.name, info.category, text, { rows: 0, columns: 0 });

    const headers = rows[0].map(String);
    const data = rows.slice(1).map(row => row.map(cell => String(cell != null ? cell : '')));

    const meta = {
      format: 'CSV (PapaParse)',
      rows: data.length,
      columns: headers.length,
      headers: headers,
      delimiter: delimiter === '\t' ? 'TAB' : delimiter
    };
    if (result.errors && result.errors.length > 0) {
      meta.parseErrors = result.errors.length;
    }

    return this.createResult(info.name, info.category, text, meta, { tables: [{ headers, rows: data }] });
  }

  _parseCsvFallback(text, info, delimiter) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return this.createResult(info.name, info.category, text, { rows: 0, columns: 0 });

    const rows = lines.map(line => this._parseCsvLine(line, delimiter));
    const headers = rows[0] || [];
    const data = rows.slice(1);

    return this.createResult(info.name, info.category, text, {
      format: 'CSV (폴백)',
      rows: data.length,
      columns: headers.length,
      headers: headers,
      delimiter: delimiter === '\t' ? 'TAB' : delimiter
    }, { tables: [{ headers, rows: data }] });
  }

  _parseCsvLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delimiter) { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  }

}
