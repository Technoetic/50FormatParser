class XlsxParser extends BaseParser {
  async parse(file, formatInfo) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const XLSX = await libLoader.loadSheetJS();
      return this._parseWithSheetJS(XLSX, buffer, file, formatInfo);
    } catch (e) {
      console.warn('SheetJS 로드 실패, 폴백:', e.message);
      return this._parseFallback(buffer, formatInfo);
    }
  }

  _parseWithSheetJS(XLSX, buffer, file, info) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true });
    const allText = [];
    const allTables = [];

    wb.SheetNames.forEach((name, idx) => {
      const ws = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(ws);
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      allText.push('=== 시트: ' + name + ' ===');
      allText.push(csv);

      if (json.length > 1) {
        const headers = json[0].map(String);
        const rows = json.slice(1).map(row => row.map(cell => String(cell != null ? cell : '')));
        allTables.push({ headers, rows, sheetName: name });
      }
    });

    const ref = wb.Sheets[wb.SheetNames[0]]?.['!ref'] || '';
    const range = ref ? XLSX.utils.decode_range(ref) : null;

    return this.createResult(info.name, info.category, allText.join('\n\n'), {
      format: 'Excel (SheetJS)',
      sheets: wb.SheetNames,
      sheetCount: wb.SheetNames.length,
      totalRows: range ? range.e.r + 1 : 0,
      totalColumns: range ? range.e.c + 1 : 0
    }, allTables.length > 0 ? { tables: allTables } : {});
  }

  _parseFallback(buffer, info) {
    const str = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
    const ssMatches = str.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
    const strings = ssMatches.map(m => { const r = m.match(/>([^<]*)</); return r ? r[1] : ''; }).filter(Boolean);
    if (strings.length > 0) return this.createResult(info.name, info.category, strings.join('\n'), { format: 'XLSX (폴백)', sharedStrings: strings.length });
    return this.createResult(info.name, info.category, '[XLSX 파싱 실패]', { format: 'XLSX' });
  }
}
