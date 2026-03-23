class SubtitleParser extends BaseParser {
  async parse(file, formatInfo) {
    const text = await this.readAsText(file);
    const ext = this.getFileExtension(file.name);

    // subtitle 라이브러리로 통합 파싱 시도 (SRT/VTT 지원)
    if (ext === '.srt' || ext === '.vtt') {
      try {
        const subtitleLib = await libLoader.loadSubtitle();
        return this._parseWithSubtitleLib(subtitleLib, text, formatInfo, ext);
      } catch (e) {
        console.warn('subtitle 라이브러리 로드 실패, 폴백:', e.message);
      }
    }

    // ASS/SSA는 subtitle 라이브러리가 지원하지 않으므로 자체 파서 사용
    // SRT/VTT 폴백도 자체 파서 사용
    let entries;
    if (ext === '.srt') entries = this._parseSrt(text);
    else if (ext === '.vtt') entries = this._parseVtt(text);
    else entries = this._parseAss(text);
    return this._buildResult(entries, formatInfo, ext);
  }

  _parseWithSubtitleLib(subtitleLib, text, info, ext) {
    const parsed = subtitleLib.parseSync(text);
    const entries = parsed.map(node => {
      if (node.type === 'cue' && node.data) {
        return {
          start: this._msToTimestamp(node.data.start),
          end: this._msToTimestamp(node.data.end),
          text: (node.data.text || '').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim()
        };
      }
      return null;
    }).filter(Boolean);

    const plainText = entries.map(e => e.text).filter(t => t).join('\n');
    const headers = ['#', 'Start', 'End', 'Text'];
    const rows = entries.map((e, i) => [String(i + 1), e.start, e.end, e.text]);
    return this.createResult(info.name, info.category, plainText, {
      entries: entries.length, format: ext + ' (subtitle)'
    }, { tables: [{ headers, rows }] });
  }

  _msToTimestamp(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mil = ms % 1000;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0') + ',' + String(mil).padStart(3, '0');
  }

  _buildResult(entries, info, ext) {
    const plainText = entries.map(e => e.text).join('\n');
    const headers = ['#', 'Start', 'End', 'Text'];
    const rows = entries.map((e, i) => [String(i + 1), e.start, e.end, e.text]);
    return this.createResult(info.name, info.category, plainText, { entries: entries.length, format: ext }, { tables: [{ headers, rows }] });
  }

  _parseSrt(text) {
    const blocks = text.split(/\n\s*\n/).filter(Boolean);
    return blocks.map(block => {
      const lines = block.trim().split('\n');
      if (lines.length < 3) return null;
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (!timeMatch) return null;
      return { start: timeMatch[1], end: timeMatch[2], text: lines.slice(2).join(' ').replace(/<[^>]+>/g, '') };
    }).filter(Boolean);
  }

  _parseVtt(text) {
    const blocks = text.split(/\n\s*\n/).filter(Boolean);
    return blocks.slice(1).map(block => {
      const lines = block.trim().split('\n');
      const timeLine = lines.find(l => l.includes('-->'));
      if (!timeLine) return null;
      const timeMatch = timeLine.match(/([\d:.]+)\s*-->\s*([\d:.]+)/);
      if (!timeMatch) return null;
      const textLines = lines.filter(l => l !== timeLine && !l.match(/^\d+$/));
      return { start: timeMatch[1], end: timeMatch[2], text: textLines.join(' ').replace(/<[^>]+>/g, '') };
    }).filter(Boolean);
  }

  _parseAss(text) {
    const entries = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.startsWith('Dialogue:')) continue;
      const parts = line.substring(9).split(',');
      if (parts.length < 10) continue;
      entries.push({ start: parts[1]?.trim(), end: parts[2]?.trim(), text: parts.slice(9).join(',').replace(/\{[^}]*\}/g, '').trim() });
    }
    return entries;
  }
}
