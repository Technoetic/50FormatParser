class FormatRegistry {
  constructor() {
    this.formats = new Map();
    this.extMap = new Map();
    this.mimeMap = new Map();
    this._registerAll();
  }

  register(info) {
    this.formats.set(info.id, info);
    info.extensions.forEach(ext => this.extMap.set(ext.toLowerCase(), info.id));
    if (info.mimes) info.mimes.forEach(m => this.mimeMap.set(m, info.id));
  }

  getById(id) { return this.formats.get(id) || null; }
  getByExtension(ext) {
    const id = this.extMap.get(ext.toLowerCase());
    return id !== undefined ? this.formats.get(id) : null;
  }
  getByMime(mime) {
    const id = this.mimeMap.get(mime);
    return id !== undefined ? this.formats.get(id) : null;
  }
  getByCategory(category) {
    return Array.from(this.formats.values()).filter(f => f.category === category);
  }
  getAllCategories() {
    const cats = new Set();
    this.formats.forEach(f => cats.add(f.category));
    return Array.from(cats);
  }
  getAll() { return Array.from(this.formats.values()); }

  _registerAll() {
    // CATEGORY: 문서 (13종)
    this.register({ id: 1, name: 'PDF', extensions: ['.pdf'], mimes: ['application/pdf'], category: '문서', parserName: 'PdfParser', difficulty: '중', description: 'PDF 문서 (디지털/스캔/테이블/수식/아카이브/포트폴리오)', supported: true });
    this.register({ id: 7, name: 'PDF 폼 데이터', extensions: ['.fdf', '.xfdf'], mimes: [], category: '문서', parserName: 'PdfParser', difficulty: '중', description: '양식 입력값 파일', supported: true });
    this.register({ id: 8, name: 'Word', extensions: ['.docx', '.doc'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'], category: '문서', parserName: 'DocxParser', difficulty: '하', description: 'Microsoft Word 문서', supported: true });
    this.register({ id: 9, name: 'PowerPoint', extensions: ['.pptx', '.ppt'], mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'], category: '문서', parserName: 'PptxParser', difficulty: '중', description: '슬라이드 프레젠테이션', supported: true });
    this.register({ id: 10, name: 'Excel', extensions: ['.xlsx', '.xls'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], category: '문서', parserName: 'XlsxParser', difficulty: '중', description: '스프레드시트', supported: true });
    this.register({ id: 11, name: '한글 (HWP)', extensions: ['.hwp'], mimes: ['application/x-hwp'], category: '문서', parserName: 'HwpParser', difficulty: '상', description: '한글 바이너리 문서', supported: true });
    this.register({ id: 12, name: '한글 (HWPX)', extensions: ['.hwpx'], mimes: ['application/hwp+zip'], category: '문서', parserName: 'HwpParser', difficulty: '중', description: '한글 ZIP+XML 문서', supported: true });
    this.register({ id: 13, name: 'OpenDocument', extensions: ['.odt', '.ods', '.odp'], mimes: ['application/vnd.oasis.opendocument.text'], category: '문서', parserName: 'OfficeParser', difficulty: '하', description: 'LibreOffice 기본 포맷', supported: true });
    this.register({ id: 14, name: 'Apple iWork', extensions: ['.pages', '.numbers', '.key'], mimes: [], category: '문서', parserName: 'OfficeParser', difficulty: '중', description: 'macOS/iOS 문서', supported: true });
    this.register({ id: 15, name: 'WPS Office', extensions: ['.wps', '.et', '.dps'], mimes: [], category: '문서', parserName: 'OfficeParser', difficulty: '중', description: 'WPS Office 문서', supported: true });
    this.register({ id: 16, name: 'RTF', extensions: ['.rtf'], mimes: ['application/rtf'], category: '문서', parserName: 'OfficeParser', difficulty: '하', description: '리치 텍스트 포맷', supported: true });
    this.register({ id: 17, name: 'XPS', extensions: ['.xps', '.oxps'], mimes: ['application/oxps'], category: '문서', parserName: 'OfficeParser', difficulty: '중', description: 'Microsoft XPS 문서', supported: true });
    this.register({ id: 18, name: 'OneNote', extensions: ['.one', '.onepkg'], mimes: [], category: '문서', parserName: 'OfficeParser', difficulty: '상', description: 'Microsoft OneNote', supported: true });

    // CATEGORY: 웹/마크업 (4종)
    this.register({ id: 23, name: 'YAML', extensions: ['.yaml', '.yml'], mimes: ['text/yaml'], category: '웹/마크업', parserName: 'YamlParser', difficulty: '하', description: 'YAML 설정', supported: true });
    this.register({ id: 24, name: 'TOML', extensions: ['.toml'], mimes: ['text/toml'], category: '웹/마크업', parserName: 'YamlParser', difficulty: '하', description: 'TOML 설정', supported: true });
    this.register({ id: 26, name: '이메일 (EML)', extensions: ['.eml'], mimes: ['message/rfc822'], category: '웹/마크업', parserName: 'EmailParser', difficulty: '중', description: 'MIME 이메일', supported: true });
    this.register({ id: 27, name: 'Outlook (MSG)', extensions: ['.msg'], mimes: ['application/vnd.ms-outlook'], category: '웹/마크업', parserName: 'EmailParser', difficulty: '중', description: 'Outlook 이메일', supported: true });

    // CATEGORY: 이미지/스캔 (4종)
    this.register({ id: 35, name: 'HEIC/HEIF', extensions: ['.heic', '.heif'], mimes: ['image/heic'], category: '이미지/스캔', parserName: 'ImageParser', difficulty: '상', description: 'iPhone 사진 포맷', supported: true });
    this.register({ id: 38, name: 'DJVU', extensions: ['.djvu'], mimes: ['image/vnd.djvu'], category: '이미지/스캔', parserName: 'ImageParser', difficulty: '상', description: '스캔 문서 압축', supported: true });
    this.register({ id: 39, name: 'DICOM', extensions: ['.dcm'], mimes: ['application/dicom'], category: '이미지/스캔', parserName: 'ImageParser', difficulty: '상', description: '의료 영상', supported: true });
    this.register({ id: 40, name: 'CAD/도면', extensions: ['.dwg', '.dxf'], mimes: [], category: '이미지/스캔', parserName: 'DomainParser', difficulty: '최상', description: '건축/엔지니어링 도면', supported: true });

    // CATEGORY: 전자책/출판 (2종)
    this.register({ id: 41, name: 'EPUB', extensions: ['.epub'], mimes: ['application/epub+zip'], category: '전자책/출판', parserName: 'EbookParser', difficulty: '중', description: '개방형 전자책', supported: true });
    this.register({ id: 42, name: 'MOBI/AZW', extensions: ['.mobi', '.azw3', '.azw'], mimes: [], category: '전자책/출판', parserName: 'EbookParser', difficulty: '중', description: 'Kindle 전자책', supported: true });

    // CATEGORY: 오디오/비디오 (9종)
    this.register({ id: 44, name: 'MP3', extensions: ['.mp3'], mimes: ['audio/mpeg'], category: '오디오/비디오', parserName: 'AudioParser', difficulty: '중', description: 'MP3 오디오', supported: true });
    this.register({ id: 45, name: 'WAV', extensions: ['.wav'], mimes: ['audio/wav'], category: '오디오/비디오', parserName: 'AudioParser', difficulty: '중', description: 'WAV 오디오', supported: true });
    this.register({ id: 46, name: 'M4A/AAC', extensions: ['.m4a', '.aac'], mimes: ['audio/mp4', 'audio/aac'], category: '오디오/비디오', parserName: 'AudioParser', difficulty: '중', description: 'Apple/모바일 오디오', supported: true });
    this.register({ id: 47, name: 'OGG', extensions: ['.ogg'], mimes: ['audio/ogg'], category: '오디오/비디오', parserName: 'AudioParser', difficulty: '중', description: '오픈소스 오디오', supported: true });
    this.register({ id: 110, name: 'FLAC', extensions: ['.flac'], mimes: ['audio/flac'], category: '오디오/비디오', parserName: 'AudioParser', difficulty: '중', description: '무손실 오디오', supported: true });
    this.register({ id: 48, name: 'MP4', extensions: ['.mp4'], mimes: ['video/mp4'], category: '오디오/비디오', parserName: 'VideoParser', difficulty: '중', description: 'MP4 비디오', supported: true });
    this.register({ id: 49, name: 'WebM/MKV', extensions: ['.webm', '.mkv'], mimes: ['video/webm', 'video/x-matroska'], category: '오디오/비디오', parserName: 'VideoParser', difficulty: '중', description: '웹/컨테이너 비디오', supported: true });
    this.register({ id: 50, name: 'SRT 자막', extensions: ['.srt'], mimes: ['text/srt'], category: '오디오/비디오', parserName: 'SubtitleParser', difficulty: '하', description: '타임스탬프 자막', supported: true });
    this.register({ id: 51, name: 'VTT 자막', extensions: ['.vtt'], mimes: ['text/vtt'], category: '오디오/비디오', parserName: 'SubtitleParser', difficulty: '하', description: 'WebVTT 자막', supported: true });
    this.register({ id: 52, name: 'ASS/SSA 자막', extensions: ['.ass', '.ssa'], mimes: [], category: '오디오/비디오', parserName: 'SubtitleParser', difficulty: '하', description: '스타일 자막', supported: true });

    // CATEGORY: 코드/기술문서 (2종)
    this.register({ id: 59, name: 'Markdown', extensions: ['.md', '.markdown'], mimes: ['text/markdown'], category: '코드/기술문서', parserName: 'MarkdownParser', difficulty: '하', description: '기술 문서', supported: true });
    this.register({ id: 64, name: 'Protocol Buffers', extensions: ['.proto'], mimes: [], category: '코드/기술문서', parserName: 'DomainParser', difficulty: '중', description: 'Protobuf 스키마 정의', supported: true });

    // CATEGORY: 구조화 데이터 (8종)
    this.register({ id: 71, name: 'CSV', extensions: ['.csv'], mimes: ['text/csv'], category: '구조화 데이터', parserName: 'TextParser', difficulty: '하', description: 'CSV 테이블 데이터', supported: true });
    this.register({ id: 72, name: 'TSV', extensions: ['.tsv'], mimes: ['text/tab-separated-values'], category: '구조화 데이터', parserName: 'TextParser', difficulty: '하', description: '탭 구분 데이터', supported: true });
    this.register({ id: 73, name: 'Parquet', extensions: ['.parquet'], mimes: [], category: '구조화 데이터', parserName: 'DatabaseParser', difficulty: '하', description: '컬럼형 저장', supported: true });
    this.register({ id: 74, name: 'Arrow/Feather', extensions: ['.arrow', '.feather'], mimes: [], category: '구조화 데이터', parserName: 'DatabaseParser', difficulty: '하', description: '인메모리 컬럼형', supported: true });
    this.register({ id: 75, name: 'Avro', extensions: ['.avro'], mimes: [], category: '구조화 데이터', parserName: 'DatabaseParser', difficulty: '중', description: 'Hadoop 직렬화', supported: true });
    this.register({ id: 77, name: 'HDF5', extensions: ['.h5', '.hdf5'], mimes: [], category: '구조화 데이터', parserName: 'DatabaseParser', difficulty: '중', description: '과학 데이터', supported: true });
    this.register({ id: 78, name: 'SQLite', extensions: ['.db', '.sqlite', '.sqlite3'], mimes: [], category: '구조화 데이터', parserName: 'DatabaseParser', difficulty: '중', description: '임베디드 DB', supported: true });
    this.register({ id: 80, name: 'Pickle', extensions: ['.pkl', '.pickle'], mimes: [], category: '구조화 데이터', parserName: 'DatabaseParser', difficulty: '중', description: 'Python 직렬화', supported: true });

    // CATEGORY: 복합/압축 (5종)
    this.register({ id: 95, name: 'ZIP', extensions: ['.zip'], mimes: ['application/zip'], category: '복합/압축', parserName: 'ArchiveParser', difficulty: '중', description: 'ZIP 압축 (암호화 포함)', supported: true });
    this.register({ id: 96, name: '7z', extensions: ['.7z'], mimes: ['application/x-7z-compressed'], category: '복합/압축', parserName: 'ArchiveParser', difficulty: '중', description: '7z 고압축', supported: true });
    this.register({ id: 97, name: 'RAR', extensions: ['.rar'], mimes: ['application/vnd.rar'], category: '복합/압축', parserName: 'ArchiveParser', difficulty: '중', description: 'RAR 압축', supported: true });
    this.register({ id: 98, name: 'tar.gz', extensions: ['.tar.gz', '.tgz', '.tar.bz2', '.tar'], mimes: ['application/gzip', 'application/x-tar'], category: '복합/압축', parserName: 'ArchiveParser', difficulty: '중', description: 'Unix 아카이브', supported: true });
    this.register({ id: 99, name: 'ISO', extensions: ['.iso'], mimes: [], category: '복합/압축', parserName: 'ArchiveParser', difficulty: '중', description: '디스크 이미지', supported: true });

    // CATEGORY: 도메인 특수 (2종)
    this.register({ id: 106, name: 'Shapefile', extensions: ['.shp', '.dbf'], mimes: [], category: '도메인 특수', parserName: 'DomainParser', difficulty: '중', description: '지리 벡터 데이터', supported: true });
    this.register({ id: 109, name: 'MessagePack', extensions: ['.msgpack', '.msgpck'], mimes: [], category: '도메인 특수', parserName: 'DomainParser', difficulty: '중', description: '바이너리 직렬화', supported: true });
  }
}
