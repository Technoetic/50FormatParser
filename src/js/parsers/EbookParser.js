class EbookParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.epub') return this._parseEpub(file, formatInfo);
if (ext === '.mobi' || ext === '.azw3' || ext === '.azw') return this._parseMobi(file, formatInfo);
    return this._parseDrmEbook(file, formatInfo);
  }

  async _parseEpub(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const JSZip = await libLoader.loadJSZip();
      return await this._parseEpubWithJSZip(JSZip, buffer, info);
    } catch (e) {
      console.warn('JSZip EPUB 파싱 실패, 폴백:', e.message);
      return this._parseEpubFallback(buffer, info);
    }
  }

  async _parseEpubWithJSZip(JSZip, buffer, info) {
    const zip = await JSZip.loadAsync(buffer);
    const meta = { format: 'EPUB (JSZip)' };
    const allText = [];

    // container.xml에서 OPF 경로 찾기
    let opfPath = 'OEBPS/content.opf';
    try {
      const container = await zip.file('META-INF/container.xml')?.async('string');
      if (container) {
        const rootFile = container.match(/full-path="([^"]+)"/);
        if (rootFile) opfPath = rootFile[1];
      }
    } catch (e) { /* skip */ }

    // OPF에서 메타데이터 추출
    try {
      const opf = await zip.file(opfPath)?.async('string');
      if (opf) {
        meta.title = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1];
        meta.creator = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/)?.[1];
        meta.language = opf.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/)?.[1];
        meta.publisher = opf.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/)?.[1];

        // spine 순서대로 파일 읽기
        const spineItems = opf.match(/idref="([^"]+)"/g) || [];
        const manifestItems = {};
        const manifests = opf.match(/<item[^>]+>/g) || [];
        for (const m of manifests) {
          const id = m.match(/id="([^"]+)"/)?.[1];
          const href = m.match(/href="([^"]+)"/)?.[1];
          const mediaType = m.match(/media-type="([^"]+)"/)?.[1];
          if (id && href) manifestItems[id] = { href, mediaType };
        }

        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
        for (const spine of spineItems) {
          const idref = spine.match(/idref="([^"]+)"/)?.[1];
          if (idref && manifestItems[idref]) {
            const item = manifestItems[idref];
            if (item.mediaType && item.mediaType.includes('html')) {
              try {
                const filePath = opfDir + item.href;
                const html = await zip.file(filePath)?.async('string');
                if (html) {
                  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                  const content = (bodyMatch ? bodyMatch[1] : html)
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                  if (content) allText.push(content);
                }
              } catch (e) { /* skip individual file */ }
            }
          }
        }
      }
    } catch (e) { /* skip */ }

    // spine에서 못 읽었으면 모든 html/xhtml 파일 시도
    if (allText.length === 0) {
      const htmlFiles = Object.keys(zip.files)
        .filter(name => /\.(x?html?|htm)$/i.test(name))
        .sort();
      for (const path of htmlFiles) {
        try {
          const html = await zip.file(path).async('string');
          const content = html.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          if (content) allText.push(content);
        } catch (e) { /* skip */ }
      }
    }

    meta.chapters = allText.length;
    const fullText = allText.join('\n\n');
    meta.characters = fullText.length;
    meta.words = fullText.split(/\s+/).filter(w => w).length;

    let header = '';
    if (meta.title) header += meta.title + '\n';
    if (meta.creator) header += '저자: ' + meta.creator + '\n';
    if (meta.publisher) header += '출판사: ' + meta.publisher + '\n';
    if (header) header += '\n---\n\n';

    return this.createResult(info.name, info.category, header + fullText, meta);
  }

  _parseEpubFallback(buffer, info) {
    const str = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
    const matches = str.match(/<p[^>]*>([^<]+)<\/p>/g) || [];
    const texts = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(Boolean);
    if (texts.length > 0) return this.createResult(info.name, info.category, texts.join('\n\n'), { format: 'EPUB (폴백)', paragraphs: texts.length });
    return this.createResult(info.name, info.category, '[EPUB 파일 감지됨 - ZIP 해제 후 XHTML 파싱 필요]', { format: 'EPUB' });
  }

  async _parseMobi(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);

    // @lingo-reader/mobi-parser 라이브러리 사용
    if (window.MobiParser && window.MobiParser.initMobiFile) {
      try {
        return await this._parseMobiWithLib(bytes, file, info);
      } catch (e) {
        console.warn('mobi-parser 실패, 폴백:', e.message);
      }
    }

    return this._parseMobiFallback(bytes, buffer, file, info);
  }

  async _parseMobiWithLib(bytes, file, info) {
    var mobi = await window.MobiParser.initMobiFile(bytes);
    var metadata = mobi.getMetadata();
    var toc = mobi.getToc();
    var chapters = mobi.chapters || [];
    var meta = { format: 'MOBI/Kindle (mobi-parser)', size: file.size };

    var text = '[MOBI/Kindle 전자책 (mobi-parser)]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';

    if (metadata.title) { meta.title = metadata.title; text += '제목: ' + metadata.title + '\n'; }
    if (metadata.author && metadata.author.length > 0) { meta.author = metadata.author.join(', '); text += '저자: ' + meta.author + '\n'; }
    if (metadata.publisher) { meta.publisher = metadata.publisher; text += '출판사: ' + metadata.publisher + '\n'; }
    if (metadata.language) { meta.language = metadata.language; text += '언어: ' + metadata.language + '\n'; }
    if (metadata.published) { text += '출간일: ' + metadata.published + '\n'; }

    meta.chapterCount = chapters.length;
    text += '챕터 수: ' + chapters.length + '\n';

    if (toc && toc.length > 0) {
      meta.tocCount = toc.length;
      text += '\n목차 (' + toc.length + '개):\n';
      toc.slice(0, 50).forEach(function(item, i) {
        text += (i + 1) + '. ' + (item.title || item.label || '(제목 없음)') + '\n';
      });
      if (toc.length > 50) text += '... 외 ' + (toc.length - 50) + '개\n';
    }

    // 텍스트 미리보기 (챕터에서 HTML 추출)
    var allText = [];
    for (var i = 0; i < Math.min(chapters.length, 10); i++) {
      var ch = chapters[i];
      if (ch.text) {
        var cleaned = ch.text.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
        if (cleaned) allText.push(cleaned);
      }
    }
    if (allText.length > 0) {
      var preview = allText.join('\n\n').substring(0, 5000);
      text += '\n--- 텍스트 미리보기 ---\n' + preview;
      meta.characters = allText.join('').length;
    }

    meta.library = 'mobi-parser';
    return this.createResult(info.name, info.category, text, meta);
  }

  _parseMobiFallback(bytes, buffer, file, info) {
    var meta = { format: 'MOBI/Kindle (폴백)', size: file.size };
    var text = '[MOBI/Kindle 전자책]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes.length > 78) {
      var name = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 32)).replace(/\0/g, '').trim();
      meta.pdbName = name;
      text += '이름: ' + name + '\n';
      var type = String.fromCharCode.apply(null, bytes.slice(60, 64));
      var creator = String.fromCharCode.apply(null, bytes.slice(64, 68));
      meta.type = type;
      meta.creator = creator;
      text += '타입: ' + type + ' / ' + creator + '\n';
    }
    var str = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 50000)));
    var htmlStart = str.indexOf('<html');
    if (htmlStart >= 0) {
      var content = str.substring(htmlStart).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      text += '\n--- 텍스트 미리보기 ---\n' + content.substring(0, 3000);
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseDrmEbook(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    let text = '[DRM 보호 전자책]\n파일 크기: ' + this.formatFileSize(file.size) + '\n\n';
    text += '이 파일은 DRM(디지털 저작권 관리)으로 보호되어 있습니다.\n';
    text += 'DRM 해제 없이는 콘텐츠를 추출할 수 없습니다.\n\n';
    text += '파일 정보:\n';
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      text += '- ZIP 기반 (EPUB + DRM 가능성)\n';
    }
    const header = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 100));
    if (header.includes('encryption.xml')) {
      text += '- Adobe DRM 또는 유사 DRM 감지\n';
    }
    text += '\n합법적인 DRM 해제 후 다시 시도해 주세요.';
    return this.createResult(info.name, info.category, text, { format: 'DRM eBook', size: file.size, hasDrm: true });
  }
}
