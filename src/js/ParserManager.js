class ParserManager {
  constructor(registry) {
    this.registry = registry;
    this.parsers = {};
  }

  registerParser(name, parser) {
    this.parsers[name] = parser;
  }

  registerAll() {
    this.registerParser('TextParser', new TextParser());
    this.registerParser('YamlParser', new YamlParser());
    this.registerParser('MarkdownParser', new MarkdownParser());
    this.registerParser('PdfParser', new PdfParser());
    this.registerParser('DocxParser', new DocxParser());
    this.registerParser('XlsxParser', new XlsxParser());
    this.registerParser('PptxParser', new PptxParser());
    this.registerParser('ImageParser', new ImageParser());
    this.registerParser('AudioParser', new AudioParser());
    this.registerParser('VideoParser', new VideoParser());
    this.registerParser('SubtitleParser', new SubtitleParser());
    this.registerParser('ArchiveParser', new ArchiveParser());
    this.registerParser('EbookParser', new EbookParser());
    this.registerParser('EmailParser', new EmailParser());
    this.registerParser('DatabaseParser', new DatabaseParser());
    this.registerParser('HwpParser', new HwpParser());
    this.registerParser('OfficeParser', new OfficeParser());
    this.registerParser('DomainParser', new DomainParser());
  }

  async parse(file, formatInfo) {
    if (!formatInfo.supported) {
      return {
        format: formatInfo.name,
        category: formatInfo.category,
        text: '',
        metadata: { fileName: file.name, fileSize: file.size, fileType: file.type },
        tables: [],
        supported: false,
        error: formatInfo.name + ' 포맷은 현재 브라우저에서 직접 파싱할 수 없습니다. (API 접근 또는 서버 사이드 처리 필요)'
      };
    }

    const parser = this.parsers[formatInfo.parserName];
    if (!parser) {
      return {
        format: formatInfo.name,
        category: formatInfo.category,
        text: '',
        metadata: {},
        tables: [],
        supported: false,
        error: '파서를 찾을 수 없습니다: ' + formatInfo.parserName
      };
    }

    try {
      const result = await parser.parse(file, formatInfo);
      result.metadata = result.metadata || {};
      result.metadata.fileName = file.name;
      result.metadata.fileSize = file.size;
      result.metadata.fileType = file.type || 'unknown';
      result.metadata.lastModified = new Date(file.lastModified).toISOString();
      return result;
    } catch (err) {
      return {
        format: formatInfo.name,
        category: formatInfo.category,
        text: '',
        metadata: { fileName: file.name, fileSize: file.size },
        tables: [],
        supported: true,
        error: '파싱 중 오류 발생: ' + err.message
      };
    }
  }
}
