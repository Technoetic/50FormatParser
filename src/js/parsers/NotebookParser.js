class NotebookParser extends BaseParser {
  async parse(file, formatInfo) {
    const text = await this.readAsText(file);
    try {
      const nb = JSON.parse(text);
      const cells = nb.cells || [];
      const combined = cells.map((c, i) => {
        const type = c.cell_type || 'unknown';
        const source = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
        let output = '';
        if (c.outputs && c.outputs.length > 0) {
          output = c.outputs.map(o => {
            if (o.text) return (Array.isArray(o.text) ? o.text.join('') : o.text);
            if (o.data && o.data['text/plain']) return (Array.isArray(o.data['text/plain']) ? o.data['text/plain'].join('') : o.data['text/plain']);
            return '';
          }).filter(Boolean).join('\n');
        }
        return '--- Cell ' + (i + 1) + ' [' + type + '] ---\n' + source + (output ? '\n\n[Output]\n' + output : '');
      }).join('\n\n');
      const kernel = nb.metadata?.kernelspec?.display_name || nb.metadata?.kernelspec?.name || 'unknown';
      return this.createResult(formatInfo.name, formatInfo.category, combined, { cells: cells.length, codeCells: cells.filter(c => c.cell_type === 'code').length, markdownCells: cells.filter(c => c.cell_type === 'markdown').length, kernel, nbformat: nb.nbformat });
    } catch (e) {
      return this.createResult(formatInfo.name, formatInfo.category, text, { error: 'Jupyter Notebook 파싱 실패: ' + e.message });
    }
  }
}
