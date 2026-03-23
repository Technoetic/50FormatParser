class FileDetector {
  constructor(registry) {
    this.registry = registry;
    this.magicBytes = this._initMagicBytes();
  }

  _initMagicBytes() {
    return [
      { bytes: [0x25, 0x50, 0x44, 0x46], format: 'pdf' },       // %PDF
      { bytes: [0x50, 0x4B, 0x03, 0x04], format: 'zip' },       // PK (ZIP/DOCX/XLSX/PPTX/EPUB/ODT)
      { bytes: [0x50, 0x4B, 0x05, 0x06], format: 'zip' },       // PK empty
      { bytes: [0x52, 0x49, 0x46, 0x46], format: 'riff' },       // RIFF (WAV/WebP)
      { bytes: [0x4F, 0x67, 0x67, 0x53], format: 'ogg' },        // OggS
      { bytes: [0x66, 0x4C, 0x61, 0x43], format: 'flac' },       // fLaC
      { bytes: [0xFF, 0xFB], format: 'mp3' },                    // MP3
      { bytes: [0x49, 0x44, 0x33], format: 'mp3' },              // ID3 (MP3)
      { bytes: [0xD0, 0xCF, 0x11, 0xE0], format: 'ole2' },      // OLE2 (DOC/XLS/PPT/HWP/MSG)
      { bytes: [0x52, 0x61, 0x72, 0x21], format: 'rar' },        // Rar!
      { bytes: [0x37, 0x7A, 0xBC, 0xAF], format: '7z' },         // 7z
      { bytes: [0x1F, 0x8B], format: 'gzip' },                   // GZIP
      { bytes: [0x4F, 0x62, 0x6A, 0x01], format: 'avro' },      // Avro: Obj\x01
      { bytes: [0x89, 0x48, 0x44, 0x46], format: 'hdf5' },      // HDF5
      { bytes: [0x50, 0x41, 0x52, 0x31], format: 'parquet' },   // PAR1
    ];
    // SQLite: text-based check "SQLite format 3"
  }

  async detect(file) {
    // 1. Extension-based detection
    const ext = this._getExtension(file.name);
    let format = this.registry.getByExtension(ext);
    if (format) return format;

    // 2. Magic bytes detection
    const header = await this._readHeader(file, 16);
    const magicFormat = this._detectByMagicBytes(header);
    if (magicFormat) {
      format = this._resolveFromMagic(magicFormat, file, header);
      if (format) return format;
    }

    // 3. MIME type detection
    if (file.type) {
      format = this.registry.getByMime(file.type);
      if (format) return format;
    }

    // 4. Text content detection
    if (this._isLikelyText(header)) {
      const textFormat = await this._detectTextFormat(file);
      if (textFormat) return textFormat;
    }

    return { id: 0, name: 'Unknown', extensions: [], mimes: [], category: '기타', parserName: null, difficulty: '-', description: '인식할 수 없는 포맷', supported: false };
  }

  _getExtension(filename) {
    if (!filename) return '';
    // Handle double extensions like .tar.gz
    const lower = filename.toLowerCase();
    if (lower.endsWith('.tar.gz')) return '.tar.gz';
    if (lower.endsWith('.tar.bz2')) return '.tar.bz2';
    const match = lower.match(/\.([^.]+)$/);
    return match ? '.' + match[1] : '';
  }

  async _readHeader(file, bytes) {
    const slice = file.slice(0, bytes);
    const buffer = await new Response(slice).arrayBuffer();
    return new Uint8Array(buffer);
  }

  _detectByMagicBytes(header) {
    for (const sig of this.magicBytes) {
      if (this._matchBytes(header, sig.bytes)) return sig.format;
    }
    // Check for SQLite text signature
    const text = String.fromCharCode(...header.slice(0, 16));
    if (text.startsWith('SQLite format 3')) return 'sqlite';
    return null;
  }

  _matchBytes(header, bytes) {
    if (header.length < bytes.length) return false;
    return bytes.every((b, i) => header[i] === b);
  }

  _resolveFromMagic(magic, file, header) {
    const ext = this._getExtension(file.name);
    switch (magic) {
      case 'pdf': return this.registry.getByExtension('.pdf');
      case 'zip':
        // ZIP-based formats: check extension first
        if (['.docx'].includes(ext)) return this.registry.getByExtension('.docx');
        if (['.xlsx'].includes(ext)) return this.registry.getByExtension('.xlsx');
        if (['.pptx'].includes(ext)) return this.registry.getByExtension('.pptx');
        if (['.epub'].includes(ext)) return this.registry.getByExtension('.epub');
        if (['.odt', '.ods', '.odp'].includes(ext)) return this.registry.getByExtension(ext);
        if (['.hwpx'].includes(ext)) return this.registry.getByExtension('.hwpx');
        if (['.pages', '.numbers', '.key'].includes(ext)) return this.registry.getByExtension(ext);
        if (['.wps', '.et', '.dps'].includes(ext)) return this.registry.getByExtension(ext);
        if (['.onepkg'].includes(ext)) return this.registry.getByExtension('.onepkg');
        return this.registry.getByExtension('.zip');
      case 'riff':
        if (ext === '.wav') return this.registry.getByExtension('.wav');
        return this.registry.getByExtension('.wav');
      case 'ogg': return this.registry.getByExtension('.ogg');
      case 'flac': return this.registry.getByExtension('.flac');
      case 'mp3': return this.registry.getByExtension('.mp3');
      case 'ole2':
        if (['.doc'].includes(ext)) return this.registry.getByExtension('.doc');
        if (['.xls'].includes(ext)) return this.registry.getByExtension('.xls');
        if (['.ppt'].includes(ext)) return this.registry.getByExtension('.ppt');
        if (['.hwp'].includes(ext)) return this.registry.getByExtension('.hwp');
        if (['.msg'].includes(ext)) return this.registry.getByExtension('.msg');
        return this.registry.getByExtension('.doc');
      case 'rar': return this.registry.getByExtension('.rar');
      case '7z': return this.registry.getByExtension('.7z');
      case 'gzip': return this.registry.getByExtension('.tar.gz');
      case 'sqlite': return this.registry.getByExtension('.sqlite');
      case 'avro': return this.registry.getByExtension('.avro');
      case 'hdf5': return this.registry.getByExtension('.h5');
      case 'parquet': return this.registry.getByExtension('.parquet');
      default: return null;
    }
  }

  _isLikelyText(header) {
    return header.every(b => (b >= 0x09 && b <= 0x0D) || (b >= 0x20 && b <= 0x7E) || b >= 0x80);
  }

  async _detectTextFormat(file) {
    try {
      const slice = file.slice(0, 1024);
      const text = await new Response(slice).text();
      const trimmed = text.trim();
      if (trimmed.startsWith('---')) return this.registry.getByExtension('.yaml');
      if (trimmed.startsWith('#') || trimmed.includes('\n## ')) return this.registry.getByExtension('.md');
      return null;
    } catch { return null; }
  }
}
