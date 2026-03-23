# 50 Format Parser — 서비스 아키텍처

## 개요

브라우저 전용(서버리스) 파일 파서. 사용자가 업로드한 파일을 **클라이언트 사이드에서만** 파싱하여 텍스트, 메타데이터, 테이블 데이터를 추출한다. 49개 포맷(~80개 확장자)을 지원하며, 외부 서버로 파일을 전송하지 않는다.

---

## 디렉토리 구조

```
src/
├── index.html                  # SPA 엔트리포인트
├── css/
│   ├── themes.css              # 다크/라이트 테마 변수 (33줄)
│   ├── main.css                # 레이아웃, 공통 스타일 (335줄)
│   └── components.css          # 드롭존, 탭, 테이블 등 컴포넌트 (209줄)
└── js/
    ├── app.js                  # 앱 엔트리포인트 (IIFE)
    ├── UIController.js         # UI 이벤트 바인딩 & 전체 흐름 제어
    ├── FormatRegistry.js       # 49개 포맷 정의 (확장자/MIME/파서 매핑)
    ├── FileDetector.js         # 파일 포맷 감지 (확장자 → 매직바이트 → MIME → 텍스트)
    ├── ParserManager.js        # 파서 인스턴스 관리 & parse() 위임
    ├── ResultRenderer.js       # 파싱 결과를 탭별(텍스트/메타데이터/테이블/원본)로 렌더링
    ├── LibLoader.js            # CDN 라이브러리 지연 로딩 (캐시 + 타임아웃)
    ├── parsers/                # 포맷별 파서 (18개 클래스, 총 4,670줄)
    │   ├── BaseParser.js       # 추상 기반 클래스 (FileReader 유틸리티)
    │   ├── TextParser.js       # CSV, TSV
    │   ├── YamlParser.js       # YAML, TOML
    │   ├── MarkdownParser.js   # Markdown
    │   ├── PdfParser.js        # PDF (PDF.js)
    │   ├── DocxParser.js       # DOCX (Mammoth)
    │   ├── XlsxParser.js       # XLSX (SheetJS)
    │   ├── PptxParser.js       # PPTX (JSZip)
    │   ├── HwpParser.js        # HWP/HWPX (HWP.js)
    │   ├── OfficeParser.js     # RTF, ODT, XPS, OneNote, iWork, WPS
    │   ├── ImageParser.js      # HEIC, DJVU, DICOM (+ Tesseract OCR)
    │   ├── AudioParser.js      # MP3, WAV, M4A, OGG, FLAC
    │   ├── VideoParser.js      # MP4, WebM, MKV
    │   ├── SubtitleParser.js   # SRT, VTT, ASS/SSA
    │   ├── ArchiveParser.js    # ZIP, 7z, RAR, tar.gz, ISO
    │   ├── EbookParser.js      # EPUB, MOBI/AZW
    │   ├── EmailParser.js      # EML, MSG
    │   ├── DatabaseParser.js   # Parquet, Arrow, Avro, HDF5, SQLite, Pickle
    │   └── DomainParser.js     # DWG, DXF, Shapefile, Protobuf, MessagePack
    └── vendor/                 # 로컬 번들 라이브러리 (8개)
        ├── rtf-parser.browser.js
        ├── avsc.browser.js
        ├── dbf-reader.browser.js
        ├── hwpjs.browser.js
        ├── mobi-parser.browser.js
        ├── msgreader.browser.js
        ├── unrar.browser.js
        ├── onenote-wasm-loader.js
        └── onenote_wasm_bg.wasm
```

---

## 핵심 아키텍처

### 처리 파이프라인

```
파일 입력 (드래그&드롭 / 클릭)
    │
    ▼
┌─────────────┐
│ FileDetector │  파일 포맷 감지
│             │  1. 확장자 매칭
│             │  2. 매직바이트 (바이너리 시그니처)
│             │  3. MIME 타입
│             │  4. 텍스트 콘텐츠 분석
└──────┬──────┘
       │ FormatInfo
       ▼
┌──────────────┐
│ ParserManager │  적절한 파서에 위임
│              │  formatInfo.parserName → 파서 인스턴스 조회
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│ [Parser] extends │  포맷별 파싱 실행
│  BaseParser      │  필요 시 LibLoader로 CDN 라이브러리 지연 로드
└──────┬──────────┘
       │ ParseResult { text, metadata, tables }
       ▼
┌────────────────┐
│ ResultRenderer │  4개 탭으로 결과 표시
│                │  텍스트 | 메타데이터 | 테이블 | 원본
└────────────────┘
```

### 클래스 관계도

```
UIController (최상위 컨트롤러)
├── FormatRegistry       49개 포맷 정의 (id, name, extensions, mimes, parserName)
├── FileDetector         포맷 감지 (매직바이트 15종 + 확장자 + MIME)
├── ParserManager        파서 라우팅
│   ├── TextParser       ← Papa Parse
│   ├── YamlParser       ← js-yaml, smol-toml
│   ├── MarkdownParser   ← Marked
│   ├── PdfParser        ← PDF.js
│   ├── DocxParser       ← Mammoth
│   ├── XlsxParser       ← SheetJS
│   ├── PptxParser       ← JSZip
│   ├── HwpParser        ← HWP.js (vendor)
│   ├── OfficeParser     ← rtf-parser, JSZip, onenote-wasm (vendor)
│   ├── ImageParser      ← libheif-js, dcmjs, DjVu.js, Tesseract.js
│   ├── AudioParser      ← music-metadata, @tonejs/midi
│   ├── VideoParser      ← mp4box
│   ├── SubtitleParser   ← Subtitle
│   ├── ArchiveParser    ← JSZip, 7z-wasm, unrar.js, Pako, js-untar
│   ├── EbookParser      ← JSZip, mobi-parser (vendor)
│   ├── EmailParser      ← postal-mime, msgreader (vendor)
│   ├── DatabaseParser   ← Hyparquet, Arrow, avsc, jsfive, sql.js, pickleparser
│   └── DomainParser     ← libredwg-web, dxf-parser, shpjs, protobufjs, msgpack
└── ResultRenderer       DOM 렌더링
```

---

## 설계 원칙

### 1. 서버리스 (100% 클라이언트)
- 모든 파싱이 브라우저에서 실행됨
- 파일이 외부 서버로 전송되지 않음 (프라이버시)
- CDN에서 라이브러리만 가져옴

### 2. 지연 로딩 (Lazy Loading)
- `LibLoader`가 파싱 시점에 필요한 라이브러리만 CDN에서 로드
- 초기 로딩은 HTML + CSS + 코어 JS만 (vendor 번들 제외)
- 로드된 라이브러리는 캐시하여 재사용

### 3. Strategy 패턴 (파서)
- `BaseParser` 추상 클래스 → 18개 구체 파서가 상속
- `FormatRegistry`가 포맷 → 파서 이름 매핑
- `ParserManager`가 파서 이름 → 인스턴스 라우팅
- 새 포맷 추가 = Registry에 등록 + Parser 클래스 추가

### 4. 4단계 포맷 감지
1. **확장자** — 가장 빠르고 정확한 1차 판별
2. **매직바이트** — 확장자 없거나 틀릴 때 바이너리 시그니처 확인
3. **MIME 타입** — 브라우저가 제공하는 타입 정보 활용
4. **텍스트 분석** — YAML(`---`), Markdown(`#`) 등 텍스트 패턴 감지

### 5. 통일된 결과 구조
모든 파서가 동일한 형태의 결과 객체를 반환:
```js
{
  format: string,       // 포맷 이름
  category: string,     // 카테고리
  text: string,         // 추출된 텍스트
  metadata: object,     // 메타데이터 (파일명, 크기, 포맷별 정보)
  tables: array,        // 테이블 데이터 [{headers, rows}]
  supported: boolean,   // 지원 여부
  error: string|null    // 에러 메시지
}
```

---

## UI 구성

```
┌──────────────────────────────────────────────┐
│  헤더: "50 Format Parser"  [49/49 포맷 지원]  [테마 전환] │
├────────┬─────────────────────────────────────┤
│ 사이드바 │  메인 콘텐츠                         │
│        │                                     │
│ 문서    │  ┌─────────────────────────────┐   │
│  13종   │  │  드래그&드롭 업로드 영역      │   │
│ 웹/마크업│  │  (클릭으로도 파일 선택 가능)  │   │
│  4종    │  └─────────────────────────────┘   │
│ 이미지   │                                     │
│  4종    │  ┌─ 결과 화면 (파싱 후) ─────────┐  │
│ 전자책   │  │ [← 돌아가기]  파일명  [복사] [다운]│  │
│  2종    │  │ [텍스트|메타데이터|테이블|원본]  │  │
│ 오디오   │  │                               │  │
│  9종    │  │  (탭별 결과 출력)              │  │
│ 코드    │  └───────────────────────────────┘  │
│  2종    │                                     │
│ 데이터   │                                     │
│  8종    │                                     │
│ 압축    │                                     │
│  5종    │                                     │
│ 도메인   │                                     │
│  2종    │                                     │
└────────┴─────────────────────────────────────┘
```

- **사이드바**: 카테고리별 포맷 목록 (접기/펼치기)
- **업로드 영역**: 드래그&드롭 + 클릭 파일 선택
- **결과 화면**: 4개 탭 (텍스트 / 메타데이터 / 테이블 / 원본)
- **액션 버튼**: 텍스트 복사, txt 다운로드, 다크/라이트 테마 전환

---

## 스크립트 로딩 순서

```html
<!-- 1. 로컬 vendor 라이브러리 (즉시 로드) -->
<script src="js/vendor/rtf-parser.browser.js"></script>
<script src="js/vendor/avsc.browser.js"></script>
...

<!-- 2. CDN 동적 로더 -->
<script src="js/LibLoader.js"></script>

<!-- 3. 기반 파서 (다른 파서가 상속) -->
<script src="js/parsers/BaseParser.js"></script>

<!-- 4. 포맷별 파서 (18개) -->
<script src="js/parsers/TextParser.js"></script>
<script src="js/parsers/PdfParser.js"></script>
...

<!-- 5. 코어 시스템 -->
<script src="js/FormatRegistry.js"></script>
<script src="js/FileDetector.js"></script>
<script src="js/ParserManager.js"></script>
<script src="js/ResultRenderer.js"></script>
<script src="js/UIController.js"></script>

<!-- 6. 앱 시작 -->
<script src="js/app.js"></script>
```

---

## 코드 규모

| 영역 | 파일 수 | 줄 수 |
|---|---|---|
| CSS | 3 | 577 |
| 코어 JS | 6 | ~600 |
| 파서 JS | 18 | 4,670 |
| vendor JS | 8 | (번들) |
| **합계** | **36** | **~5,850+** |
