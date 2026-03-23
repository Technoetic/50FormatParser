/**
 * Build script: 모든 소스 파일을 단일 dist/index.html로 번들링
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

// CSS 파일 순서
const cssFiles = [
  'css/themes.css',
  'css/main.css',
  'css/components.css',
];

// JS 파일 순서 (src/index.html의 script 태그 순서와 동일)
const jsFiles = [
  'js/vendor/rtf-parser.browser.js',
  'js/vendor/avsc.browser.js',
  'js/vendor/dbf-reader.browser.js',
  'js/vendor/onenote-wasm-loader.js',
  'js/vendor/msgreader.browser.js',
  'js/vendor/unrar.browser.js',
  'js/vendor/hwpjs.browser.js',
  'js/vendor/mobi-parser.browser.js',
  'js/LibLoader.js',
  'js/parsers/BaseParser.js',
  'js/parsers/TextParser.js',
  'js/parsers/YamlParser.js',
  'js/parsers/MarkdownParser.js',
  'js/parsers/PdfParser.js',
  'js/parsers/DocxParser.js',
  'js/parsers/XlsxParser.js',
  'js/parsers/PptxParser.js',
  'js/parsers/ImageParser.js',
  'js/parsers/AudioParser.js',
  'js/parsers/VideoParser.js',
  'js/parsers/SubtitleParser.js',
  'js/parsers/ArchiveParser.js',
  'js/parsers/EbookParser.js',
  'js/parsers/EmailParser.js',
  'js/parsers/DatabaseParser.js',
  'js/parsers/HwpParser.js',
  'js/parsers/OfficeParser.js',
  'js/parsers/DomainParser.js',
  'js/FormatRegistry.js',
  'js/FileDetector.js',
  'js/ParserManager.js',
  'js/ResultRenderer.js',
  'js/UIController.js',
  'js/app.js',
];

// HTML 템플릿에서 body 내용 추출
const htmlSrc = fs.readFileSync(path.join(SRC, 'index.html'), 'utf-8');
const bodyMatch = htmlSrc.match(/<body>([\s\S]*?)(?=\s*<!--\s*Scripts)/);
const bodyContent = bodyMatch ? bodyMatch[1].trim() : '';

// CSS 합치기
const allCss = cssFiles.map(f => {
  const filePath = path.join(SRC, f);
  return fs.readFileSync(filePath, 'utf-8');
}).join('\n\n');

// WASM base64 인라인 (OneNote parser)
const wasmPath = path.join(__dirname, 'tools', 'onenote-wasm', 'pkg', 'onenote_wasm_bg.wasm');
let wasmBase64 = '';
if (fs.existsSync(wasmPath)) {
  wasmBase64 = fs.readFileSync(wasmPath).toString('base64');
  console.log('WASM inlined: onenote_wasm_bg.wasm (' + (wasmBase64.length / 1024).toFixed(1) + ' KB base64)');
}

// JS 합치기
let allJs = 'if(typeof process==="undefined"){var process={env:{}};};\nvar __ONENOTE_WASM_BASE64__ = "' + wasmBase64 + '";\n\n';
allJs += jsFiles.map(f => {
  const filePath = path.join(SRC, f);
  let code = fs.readFileSync(filePath, 'utf-8');
  // vendor 파일의 Node.js fs 참조를 브라우저 폴리필로 대체
  if (f.startsWith('js/vendor/')) {
    code = code.replace(/require\("fs"\)/g, '({})');
    code = code.replace(/require\('fs'\)/g, '({})');
    // esbuild dynamic require 래퍼: eo("fs"), ro("fs") 등
    code = code.replace(/\b\w{2}\("fs"\)/g, (match) => {
      // require("fs")는 이미 처리했으므로 나머지 2글자 함수("fs") 패턴만
      if (match === 'fs("fs")') return match; // 자기참조 방지
      return '({})';
    });
  }
  return code;
}).join('\n\n');

// 최종 HTML 조합
const output = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>83 Format Parser - RAG 문서 파서</title>
  <style>
${allCss}
  </style>
</head>
<body>
${bodyContent}
  <script>
${allJs}
  </script>
</body>
</html>
`;

// dist 디렉토리 생성
if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}

const outputPath = path.join(DIST, 'index.html');
fs.writeFileSync(outputPath, output, 'utf-8');

const size = fs.statSync(outputPath).size;
console.log('Build complete: dist/index.html (' + (size / 1024).toFixed(1) + ' KB)');
console.log('CSS files: ' + cssFiles.length);
console.log('JS files: ' + jsFiles.length);
