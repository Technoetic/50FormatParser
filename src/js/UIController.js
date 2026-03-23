class UIController {
  constructor() {
    this.registry = null;
    this.detector = null;
    this.parserManager = null;
    this.resultRenderer = null;
    this.currentResult = null;
  }

  init() {
    this.registry = new FormatRegistry();
    this.detector = new FileDetector(this.registry);
    this.parserManager = new ParserManager(this.registry);
    this.parserManager.registerAll();
    this.resultRenderer = new ResultRenderer();

    this._setupDragDrop();
    this._setupFileInput();
    this._setupSidebar();
    this._setupTabs();
    this._setupActions();
    this._updateFormatCount();
  }

  _setupDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) this.handleFile(files[0]);
    });

    dropZone.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
  }

  _setupFileInput() {
    const input = document.getElementById('file-input');
    if (!input) return;
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
    });
  }

  _setupSidebar() {
    const sidebar = document.getElementById('sidebar-categories');
    if (!sidebar) return;

    const categories = this.registry.getAllCategories();
    const categoryColors = {
      '문서': '#4A9EFF', '웹/마크업': '#4CAF50', '이미지/스캔': '#9C27B0',
      '전자책/출판': '#FF9800', '오디오/비디오': '#F44336', '코드/기술문서': '#78909C',
      '설정파일': '#FFC107', '구조화 데이터': '#00BCD4', 'SaaS/협업': '#3F51B5',
      '복합/압축': '#795548', '도메인 특수': '#E91E63', '기타': '#607D8B'
    };

    categories.forEach(cat => {
      const formats = this.registry.getByCategory(cat);
      const supported = formats.filter(f => f.supported).length;
      const div = document.createElement('div');
      div.className = 'category-item';
      div.innerHTML = '<div class="category-header" style="border-left: 3px solid ' + (categoryColors[cat] || '#666') + '">' +
        '<span class="category-name">' + cat + '</span>' +
        '<span class="category-count">' + supported + '/' + formats.length + '</span>' +
        '</div>' +
        '<div class="category-formats hidden">' +
        formats.map(f => '<div class="format-item ' + (f.supported ? 'supported' : 'unsupported') + '">' +
          '<div class="format-info">' +
            '<span class="format-name">' + f.name + '</span>' +
            (f.extensions.length > 0 ? '<span class="format-exts">' + f.extensions.join('  ') + '</span>' : '') +
          '</div>' +
          '</div>').join('') +
        '</div>';

      div.querySelector('.category-header').addEventListener('click', () => {
        div.querySelector('.category-formats').classList.toggle('hidden');
        div.querySelector('.category-header').classList.toggle('expanded');
      });

      sidebar.appendChild(div);
    });
  }

  _setupTabs() {
    const tabs = document.querySelectorAll('.result-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const targetEl = document.getElementById('tab-' + target);
        if (targetEl) targetEl.classList.add('active');
      });
    });
  }

  _setupActions() {
    const copyBtn = document.getElementById('btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (this.currentResult && this.currentResult.text) {
          navigator.clipboard.writeText(this.currentResult.text).then(() => {
            copyBtn.textContent = '복사됨!';
            setTimeout(() => { copyBtn.textContent = '텍스트 복사'; }, 2000);
          }).catch(() => {
            // Fallback for file:// protocol
            const textarea = document.createElement('textarea');
            textarea.value = this.currentResult.text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            copyBtn.textContent = '복사됨!';
            setTimeout(() => { copyBtn.textContent = '텍스트 복사'; }, 2000);
          });
        }
      });
    }

    const downloadBtn = document.getElementById('btn-download');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (this.currentResult && this.currentResult.text) {
          const blob = new Blob([this.currentResult.text], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'parsed-result.txt';
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }

    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        themeBtn.textContent = document.body.classList.contains('light-theme') ? '다크 모드' : '라이트 모드';
      });
    }
  }

  _updateFormatCount() {
    const el = document.getElementById('format-count');
    if (el) {
      const all = this.registry.getAll();
      const supported = all.filter(f => f.supported).length;
      el.textContent = supported + '/' + all.length + ' 포맷 지원';
    }
  }

  async handleFile(file) {
    this._showSection('result');
    this._showProgress(true);
    this._setFileInfo(file);

    try {
      // Detect format
      const formatInfo = await this.detector.detect(file);
      this._setFormatBadge(formatInfo);

      // Parse
      const result = await this.parserManager.parse(file, formatInfo);
      this.currentResult = result;

      // Render
      this._showProgress(false);
      this.resultRenderer.render(result);

      if (result.error) {
        this._showError(result.error);
      }
    } catch (err) {
      this._showProgress(false);
      this._showError('파일 처리 중 오류: ' + err.message);
    }
  }

  _showSection(name) {
    const upload = document.getElementById('upload-section');
    const result = document.getElementById('result-section');
    if (name === 'result') {
      if (upload) upload.classList.add('hidden');
      if (result) result.classList.remove('hidden');
    } else {
      if (upload) upload.classList.remove('hidden');
      if (result) result.classList.add('hidden');
    }
  }

  _showProgress(show) {
    const el = document.getElementById('progress-bar');
    if (el) el.classList.toggle('hidden', !show);
  }

  _setFileInfo(file) {
    const el = document.getElementById('file-info');
    if (el) {
      const bp = new BaseParser();
      el.innerHTML = '<strong>' + file.name + '</strong> (' + bp.formatFileSize(file.size) + ')';
    }
  }

  _setFormatBadge(formatInfo) {
    const el = document.getElementById('format-badge');
    if (el) {
      el.textContent = formatInfo.name;
      el.className = 'format-badge ' + (formatInfo.supported ? 'supported' : 'unsupported');
    }
  }

  _showError(msg) {
    const el = document.getElementById('error-message');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }
}
