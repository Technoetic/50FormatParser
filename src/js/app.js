// 50 Format Parser - App Entry Point
(function() {
  'use strict';

  function initApp() {
    const ui = new UIController();
    ui.init();

    // Back to upload button
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        document.getElementById('upload-section').classList.remove('hidden');
        document.getElementById('result-section').classList.add('hidden');
        document.getElementById('error-message').classList.add('hidden');
        document.getElementById('file-input').value = '';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
