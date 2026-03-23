class BaseParser {
  async parse(file, formatInfo) {
    throw new Error('parse() must be implemented by subclass');
  }

  async readAsText(file, encoding = 'utf-8') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as text'));
      reader.readAsText(file, encoding);
    });
  }

  async readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as ArrayBuffer'));
      reader.readAsArrayBuffer(file);
    });
  }

  async readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as DataURL'));
      reader.readAsDataURL(file);
    });
  }

  createResult(format, category, text, metadata = {}, options = {}) {
    return {
      format,
      category,
      text: text || '',
      metadata: metadata || {},
      tables: options.tables || [],
      supported: true,
      error: null
    };
  }

  createUnsupported(format, category, reason) {
    return {
      format,
      category,
      text: '',
      metadata: {},
      tables: [],
      supported: false,
      error: reason || '이 포맷은 브라우저에서 직접 파싱할 수 없습니다.'
    };
  }

  getFileExtension(filename) {
    const match = filename.match(/\.([^.]+)$/);
    return match ? '.' + match[1].toLowerCase() : '';
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }
}
