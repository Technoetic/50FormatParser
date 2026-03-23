# 50 Format Parser — 지원 포맷 & 라이브러리 정리

## 카테고리별 지원 확장자

### 문서 (13종, 25개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| PDF | `.pdf` | PdfParser | 중 |
| PDF 폼 데이터 | `.fdf` `.xfdf` | PdfParser | 중 |
| Word | `.docx` `.doc` | DocxParser | 하 |
| PowerPoint | `.pptx` `.ppt` | PptxParser | 중 |
| Excel | `.xlsx` `.xls` | XlsxParser | 중 |
| 한글 (HWP) | `.hwp` | HwpParser | 상 |
| 한글 (HWPX) | `.hwpx` | HwpParser | 중 |
| OpenDocument | `.odt` `.ods` `.odp` | OfficeParser | 하 |
| Apple iWork | `.pages` `.numbers` `.key` | OfficeParser | 중 |
| WPS Office | `.wps` `.et` `.dps` | OfficeParser | 중 |
| RTF | `.rtf` | OfficeParser | 하 |
| XPS | `.xps` `.oxps` | OfficeParser | 중 |
| OneNote | `.one` `.onepkg` | OfficeParser | 상 |

### 웹/마크업 (4종, 5개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| YAML | `.yaml` `.yml` | YamlParser | 하 |
| TOML | `.toml` | YamlParser | 하 |
| 이메일 (EML) | `.eml` | EmailParser | 중 |
| Outlook (MSG) | `.msg` | EmailParser | 중 |

### 이미지/스캔 (4종, 6개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| HEIC/HEIF | `.heic` `.heif` | ImageParser | 상 |
| DJVU | `.djvu` | ImageParser | 상 |
| DICOM | `.dcm` | ImageParser | 상 |
| CAD/도면 | `.dwg` `.dxf` | DomainParser | 최상 |

### 전자책/출판 (2종, 4개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| EPUB | `.epub` | EbookParser | 중 |
| MOBI/AZW | `.mobi` `.azw3` `.azw` | EbookParser | 중 |

### 오디오/비디오 (9종, 13개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| MP3 | `.mp3` | AudioParser | 중 |
| WAV | `.wav` | AudioParser | 중 |
| M4A/AAC | `.m4a` `.aac` | AudioParser | 중 |
| OGG | `.ogg` | AudioParser | 중 |
| FLAC | `.flac` | AudioParser | 중 |
| MP4 | `.mp4` | VideoParser | 중 |
| WebM/MKV | `.webm` `.mkv` | VideoParser | 중 |
| SRT 자막 | `.srt` | SubtitleParser | 하 |
| VTT 자막 | `.vtt` | SubtitleParser | 하 |
| ASS/SSA 자막 | `.ass` `.ssa` | SubtitleParser | 하 |

### 코드/기술문서 (2종, 3개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| Markdown | `.md` `.markdown` | MarkdownParser | 하 |
| Protocol Buffers | `.proto` | DomainParser | 중 |

### 구조화 데이터 (8종, 13개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| CSV | `.csv` | TextParser | 하 |
| TSV | `.tsv` | TextParser | 하 |
| Parquet | `.parquet` | DatabaseParser | 하 |
| Arrow/Feather | `.arrow` `.feather` | DatabaseParser | 하 |
| Avro | `.avro` | DatabaseParser | 중 |
| HDF5 | `.h5` `.hdf5` | DatabaseParser | 중 |
| SQLite | `.db` `.sqlite` `.sqlite3` | DatabaseParser | 중 |
| Pickle | `.pkl` `.pickle` | DatabaseParser | 중 |

### 복합/압축 (5종, 7개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| ZIP | `.zip` | ArchiveParser | 중 |
| 7z | `.7z` | ArchiveParser | 중 |
| RAR | `.rar` | ArchiveParser | 중 |
| tar.gz | `.tar.gz` `.tgz` `.tar.bz2` `.tar` | ArchiveParser | 중 |
| ISO | `.iso` | ArchiveParser | 중 |

### 도메인 특수 (2종, 4개 확장자)

| 포맷 | 확장자 | 파서 | 난이도 |
|---|---|---|---|
| Shapefile | `.shp` `.dbf` | DomainParser | 중 |
| MessagePack | `.msgpack` `.msgpck` | DomainParser | 중 |

> **합계: 49개 포맷 / 약 80개 확장자**

---

## 사용 라이브러리

### CDN 로딩 (jsDelivr, 32개)

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| PDF.js | 3.11.174 | PDF 파싱 |
| PDF.js Worker | 3.11.174 | PDF 워커 스레드 |
| JSZip | 3.10.1 | ZIP 압축 처리 |
| SheetJS (XLSX) | 0.18.5 | Excel 파싱 |
| js-yaml | 4.1.0 | YAML 파싱 |
| Marked | 15.0.7 | Markdown 렌더링 |
| Tesseract.js | 5 | OCR (이미지→텍스트) |
| sql.js | 1.11.0 | SQLite 파싱 (WASM) |
| Mammoth | 1.8.0 | DOCX→HTML 변환 |
| Papa Parse | 5.5.2 | CSV/TSV 파싱 |
| libheif-js | 1.19.8 | HEIC/HEIF 이미지 디코딩 |
| dcmjs | 0.33.0 | DICOM 의료영상 파싱 |
| Hyparquet | 1.25.0 | Parquet 파싱 |
| Apache Arrow | 18.1.0 | Arrow/Feather 파싱 |
| jsfive | 0.3.10 | HDF5 파싱 |
| DjVu.js | 0.10.1 | DJVU 문서 파싱 |
| smol-toml | 1.3.1 | TOML 파싱 |
| postal-mime | 2.3.2 | EML 이메일 파싱 |
| Subtitle | 4.2.1 | 자막 파싱 (SRT/VTT/ASS) |
| Pako | 2.1.0 | gzip 압축/해제 |
| js-untar | 2.0.0 | tar 아카이브 해제 |
| dxf-parser | 1.1.2 | DXF 도면 파싱 |
| shpjs | 5.0.1 | Shapefile 지리데이터 |
| protobufjs | 7.4.0 | Protocol Buffers 파싱 |
| @tonejs/midi | 2.0.28 | MIDI 파싱 |
| music-metadata | 11.12.1 | 오디오 메타데이터 추출 |
| mp4box | 0.5.2 | MP4/비디오 메타데이터 |
| pickleparser | 0.2.1 | Python Pickle 파싱 |
| libredwg-web | 0.6.6 | DWG 도면 파싱 (WASM) |
| BrowserFS | 1.4.3 | 브라우저 파일시스템 에뮬레이션 |
| 7z-wasm | 1.2.0 | 7z 압축 해제 (WASM) |
| @msgpack/msgpack | 3.1.3 | MessagePack 파싱 |
| fzstd | 0.1.1 | Zstandard 압축 해제 |

### 로컬 번들 (vendor/, 8개)

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| rtf-parser | 1.0.1 | RTF 문서 파싱 |
| avsc | 5.7.9 | Avro 파싱 |
| dbf-reader | 1.0.3 | DBF 파싱 |
| onenote-wasm | custom | OneNote 파싱 (WASM) |
| msgreader | 1.28.0 | Outlook MSG 파싱 |
| unrar.js | 2.0.2 | RAR 압축 해제 |
| HWP.js | 0.0.3 | HWP 한글 문서 파싱 |
| mobi-parser | 0.4.5 | MOBI/Kindle 전자책 파싱 |

> **합계: 40개 외부 라이브러리**
