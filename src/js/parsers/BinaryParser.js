class BinaryParser extends BaseParser {
  async parse(file, formatInfo) {
    const buffer = await this.readAsArrayBuffer(file);
    const hex = this._toHexDump(new Uint8Array(buffer), 2048);
    return this.createResult(formatInfo.name || 'Binary', formatInfo.category || '기타', hex, { size: file.size, type: file.type || 'unknown', hexPreview: true });
  }
  _toHexDump(bytes, maxBytes) {
    const limit = Math.min(bytes.length, maxBytes);
    const lines = [];
    for (let i = 0; i < limit; i += 16) {
      const addr = i.toString(16).padStart(8, '0');
      const hexParts = [];
      const asciiParts = [];
      for (let j = 0; j < 16; j++) {
        if (i + j < limit) {
          hexParts.push(bytes[i + j].toString(16).padStart(2, '0'));
          asciiParts.push(bytes[i + j] >= 32 && bytes[i + j] <= 126 ? String.fromCharCode(bytes[i + j]) : '.');
        } else {
          hexParts.push('  ');
          asciiParts.push(' ');
        }
      }
      lines.push(addr + '  ' + hexParts.slice(0, 8).join(' ') + '  ' + hexParts.slice(8).join(' ') + '  |' + asciiParts.join('') + '|');
    }
    if (bytes.length > maxBytes) lines.push('... (' + this.formatFileSize(bytes.length) + ' total)');
    return lines.join('\n');
  }
}
