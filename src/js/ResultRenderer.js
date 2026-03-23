class ResultRenderer {
  render(result) {
    this._renderText(result);
    this._renderMetadata(result);
    this._renderTable(result);
    this._renderRaw(result);
    this._renderImage(result);
  }

  _renderText(result) {
    const el = document.getElementById('tab-text');
    if (!el) return;

    if (!result.supported) {
      el.innerHTML = '<div class="unsupported-msg"><h3>미지원 포맷</h3><p>' + (result.error || '이 포맷은 현재 지원되지 않습니다.') + '</p></div>';
      return;
    }

    if (result.metadata && result.metadata.html) {
      // Markdown rendered HTML
      el.innerHTML = '<div class="rendered-html">' + result.metadata.html + '</div>' +
        '<hr><h4>원본 텍스트</h4><pre class="text-output">' + this._escapeHtml(result.text) + '</pre>';
      return;
    }

    if (result.metadata && result.metadata.imageDataUrl) {
      el.innerHTML = '<div class="image-preview"><img src="' + result.metadata.imageDataUrl + '" alt="Preview" style="max-width:100%;max-height:400px;"></div>' +
        '<pre class="text-output">' + this._escapeHtml(result.text) + '</pre>';
      return;
    }

    el.innerHTML = '<pre class="text-output">' + this._escapeHtml(result.text || '(텍스트 없음)') + '</pre>';
  }

  _renderMetadata(result) {
    const el = document.getElementById('tab-metadata');
    if (!el) return;

    const meta = result.metadata || {};
    const filtered = Object.entries(meta).filter(([k]) => !['html', 'parsed', 'imageDataUrl'].includes(k));

    if (filtered.length === 0) {
      el.innerHTML = '<p class="no-data">메타데이터 없음</p>';
      return;
    }

    let html = '<table class="metadata-table"><thead><tr><th>키</th><th>값</th></tr></thead><tbody>';
    filtered.forEach(([key, value]) => {
      let displayValue;
      if (Array.isArray(value)) displayValue = value.join(', ');
      else if (typeof value === 'object' && value !== null) displayValue = JSON.stringify(value, null, 2);
      else displayValue = String(value);
      html += '<tr><td class="meta-key">' + this._escapeHtml(key) + '</td><td class="meta-value">' + this._escapeHtml(displayValue) + '</td></tr>';
    });
    html += '</tbody></table>';

    // Show parsed data if available
    if (meta.parsed) {
      html += '<h4>파싱된 데이터</h4><pre class="json-output">' + this._escapeHtml(JSON.stringify(meta.parsed, null, 2)) + '</pre>';
    }

    el.innerHTML = html;
  }

  _renderTable(result) {
    const el = document.getElementById('tab-table');
    if (!el) return;

    if (!result.tables || result.tables.length === 0) {
      el.innerHTML = '<p class="no-data">테이블 데이터 없음</p>';
      return;
    }

    let html = '';
    result.tables.forEach((table, idx) => {
      html += '<div class="table-wrapper">';
      if (result.tables.length > 1) html += '<h4>테이블 ' + (idx + 1) + '</h4>';
      html += '<table class="data-table"><thead><tr>';
      (table.headers || []).forEach(h => { html += '<th>' + this._escapeHtml(h) + '</th>'; });
      html += '</tr></thead><tbody>';
      (table.rows || []).slice(0, 100).forEach(row => {
        html += '<tr>';
        (Array.isArray(row) ? row : Object.values(row)).forEach(cell => {
          html += '<td>' + this._escapeHtml(String(cell)) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      if ((table.rows || []).length > 100) html += '<p class="truncated">... ' + ((table.rows.length) - 100) + '개 행 더 있음</p>';
      html += '</div>';
    });

    el.innerHTML = html;
  }

  _renderRaw(result) {
    const el = document.getElementById('tab-raw');
    if (!el) return;

    if (result.metadata && result.metadata.hexPreview) {
      el.innerHTML = '<pre class="hex-output">' + this._escapeHtml(result.text) + '</pre>';
      return;
    }

    el.innerHTML = '<pre class="raw-output">' + this._escapeHtml(result.text || '(데이터 없음)') + '</pre>';
  }

  _renderImage(result) {
    // Image preview is handled in _renderText
  }

  _escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
