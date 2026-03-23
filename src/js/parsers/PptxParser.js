class PptxParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.ppt') return this.createResult(formatInfo.name, formatInfo.category, '[.ppt 레거시 바이너리 포맷 - .pptx로 변환 후 시도해 주세요]', { format: 'PPT (레거시)' });
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const JSZip = await libLoader.loadJSZip();
      return await this._parseWithJSZip(JSZip, buffer, formatInfo);
    } catch (e) {
      console.warn('JSZip PPTX 파싱 실패, 폴백:', e.message);
      return this._parseFallback(buffer, formatInfo);
    }
  }

  async _parseWithJSZip(JSZip, buffer, info) {
    const zip = await JSZip.loadAsync(buffer);
    const slides = [];
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)[1]);
        const numB = parseInt(b.match(/slide(\d+)/)[1]);
        return numA - numB;
      });

    for (const slidePath of slideFiles) {
      const xml = await zip.file(slidePath).async('string');
      const slideNum = slidePath.match(/slide(\d+)/)[1];
      const texts = this._extractTextsFromXml(xml);
      if (texts.length > 0) {
        slides.push({ slideNum: parseInt(slideNum), texts });
      }
    }

    // 슬라이드 노트 추출
    const notes = [];
    const noteFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
    for (const notePath of noteFiles) {
      const xml = await zip.file(notePath).async('string');
      const noteTexts = this._extractTextsFromXml(xml);
      if (noteTexts.length > 0) notes.push(noteTexts.join(' '));
    }

    // 프레젠테이션 메타데이터
    let meta = { format: 'PPTX (JSZip)', slideCount: slideFiles.length };
    try {
      const coreXml = await zip.file('docProps/core.xml')?.async('string');
      if (coreXml) {
        const title = coreXml.match(/<dc:title>([^<]+)<\/dc:title>/)?.[1];
        const creator = coreXml.match(/<dc:creator>([^<]+)<\/dc:creator>/)?.[1];
        const subject = coreXml.match(/<dc:subject>([^<]+)<\/dc:subject>/)?.[1];
        if (title) meta.title = title;
        if (creator) meta.creator = creator;
        if (subject) meta.subject = subject;
      }
    } catch (e) { /* skip */ }

    // 텍스트 조합
    const allText = [];
    for (const slide of slides) {
      allText.push('=== 슬라이드 ' + slide.slideNum + ' ===');
      allText.push(slide.texts.join('\n'));
    }
    if (notes.length > 0) {
      allText.push('\n=== 발표자 노트 ===');
      allText.push(notes.join('\n'));
      meta.notesCount = notes.length;
    }

    return this.createResult(info.name, info.category, allText.join('\n\n'), meta);
  }

  _extractTextsFromXml(xml) {
    const texts = [];
    // <a:t> 태그에서 텍스트 추출
    const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    let currentParagraph = '';
    // <a:p> 단위로 분리하여 단락 구성
    const paragraphs = xml.split(/<\/a:p>/);
    for (const para of paragraphs) {
      const tMatches = para.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const paraText = tMatches.map(m => {
        const r = m.match(/>([^<]*)</);
        return r ? r[1] : '';
      }).join('');
      if (paraText.trim()) texts.push(paraText);
    }
    return texts;
  }

  _parseFallback(buffer, info) {
    const bytes = new Uint8Array(buffer);
    const str = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const matches = str.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = matches.map(m => { const r = m.match(/>([^<]*)</); return r ? r[1] : ''; }).filter(Boolean);
    if (texts.length > 0) return this.createResult(info.name, info.category, texts.join('\n'), { format: 'PPTX (폴백)' });
    return this.createResult(info.name, info.category, '[PPTX 파일 감지됨 - ZIP 해제 후 슬라이드 XML 파싱 필요]', { format: 'PPTX' });
  }
}
