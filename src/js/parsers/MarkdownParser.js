class MarkdownParser extends BaseParser {
  async parse(file, formatInfo) {
    const text = await this.readAsText(file);
    const ext = this.getFileExtension(file.name);
    const headings = this._extractHeadings(text);
    let html;
    try {
      const marked = await libLoader.loadMarked();
      html = marked.parse(text);
    } catch (e) {
      console.warn('marked.js 로드 실패, 폴백:', e.message);
      html = this._toHtmlFallback(text);
    }
    return this.createResult(formatInfo.name, formatInfo.category, text, {
      headings,
      html,
      lines: text.split('\n').length,
      format: 'Markdown'
    });
  }

  _extractHeadings(text) {
    return text.split('\n').filter(l => l.match(/^#{1,6}\s/)).map(l => {
      const m = l.match(/^(#+)\s+(.+)/);
      return m ? { level: m[1].length, text: m[2] } : null;
    }).filter(Boolean);
  }

  _toHtmlFallback(md) {
    let html = md;
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/\n\n/g, '</p><p>');
    return '<p>' + html + '</p>';
  }
}
