# 50 Format Parser

브라우저 전용(서버리스) RAG 문서 파서. 49개 포맷, 80+ 확장자를 클라이언트 사이드에서 파싱합니다.

## 지원 포맷

| 카테고리 | 종수 | 주요 확장자 |
|---|---|---|
| 문서 | 13 | PDF, DOCX, PPTX, XLSX, HWP, RTF, ODT, XPS, OneNote... |
| 웹/마크업 | 4 | YAML, TOML, EML, MSG |
| 이미지/스캔 | 4 | HEIC, DJVU, DICOM, DWG/DXF |
| 전자책 | 2 | EPUB, MOBI/AZW |
| 오디오/비디오 | 9 | MP3, WAV, FLAC, MP4, WebM, SRT, VTT... |
| 코드/기술문서 | 2 | Markdown, Protobuf |
| 구조화 데이터 | 8 | CSV, Parquet, Arrow, Avro, HDF5, SQLite, Pickle... |
| 압축 | 5 | ZIP, 7z, RAR, tar.gz, ISO |
| 도메인 특수 | 2 | Shapefile, MessagePack |

## 특징

- 100% 클라이언트 사이드 — 파일이 서버로 전송되지 않음
- 41개 외부 라이브러리 지연 로딩 (CDN + vendor 번들)
- 드래그&드롭 / 클릭 파일 업로드
- 4단계 포맷 감지 (확장자 → 매직바이트 → MIME → 텍스트 분석)
- 다크/라이트 테마
- 텍스트 복사 & 다운로드

## 라이브 데모

https://technoetic.github.io/50FormatParser/
