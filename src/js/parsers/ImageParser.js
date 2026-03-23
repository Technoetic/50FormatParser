class ImageParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.heic' || ext === '.heif') return this._parseHeic(file, formatInfo);
    if (ext === '.djvu') return this._parseDjvu(file, formatInfo);
    if (ext === '.dcm') return this._parseDicom(file, formatInfo);
    return this.createResult(formatInfo.name, formatInfo.category, '[지원하지 않는 이미지 형식]', { error: 'Unknown image format' });
  }

  _getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    });
  }

  async _parseHeic(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'HEIC/HEIF', size: file.size };
    if (bytes.length > 12) {
      const ftyp = String.fromCharCode(...bytes.slice(4, 8));
      meta.hasFtyp = ftyp === 'ftyp';
      if (meta.hasFtyp) {
        const brand = String.fromCharCode(...bytes.slice(8, 12));
        meta.majorBrand = brand;
      }
    }
    const exif = this._findExifInIsobmff(bytes);
    Object.assign(meta, exif);

    // libheif-js(WASM)로 HEIC 디코딩
    try {
      const libheif = await libLoader.loadLibheif();
      const decoder = new libheif.HeifDecoder();
      var images = decoder.decode(new Uint8Array(buffer));
      if (images && images.length > 0) {
        var img = images[0];
        var w = img.get_width();
        var h = img.get_height();
        meta.width = w;
        meta.height = h;
        meta.decoded = true;
        meta.imageCount = images.length;
        meta.format = 'HEIC/HEIF (libheif-js)';
        // RGBA 추출 → Canvas → dataUrl
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        var imageData = ctx.createImageData(w, h);
        await new Promise(function(resolve, reject) {
          img.display(imageData, function(result) {
            if (result) resolve();
            else reject(new Error('libheif display 실패'));
          });
        });
        ctx.putImageData(imageData, 0, 0);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        meta.imageDataUrl = dataUrl;
        let text = '[HEIC/HEIF 이미지 파일 - 디코딩 완료]\n' +
          '크기: ' + w + 'x' + h + '\n' +
          '파일 크기: ' + this.formatFileSize(file.size) + '\n';
        if (images.length > 1) text += '이미지 수: ' + images.length + '\n';
        if (meta.majorBrand) text += '브랜드: ' + meta.majorBrand + '\n';
        return this.createResult(info.name, info.category, text, meta);
      }
    } catch (e) {
      console.warn('libheif-js 디코딩 실패, 폴백:', e.message);
    }

    // 폴백: 메타데이터만
    let text = '[HEIC/HEIF 이미지 파일]\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (meta.majorBrand) text += '브랜드: ' + meta.majorBrand + '\n';
    if (exif.width) text += '이미지 크기: ' + exif.width + 'x' + exif.height + '\n';
    text += '\nHEIC 디코딩 라이브러리를 로드할 수 없습니다.';
    return this.createResult(info.name, info.category, text, meta);
  }

  _findExifInIsobmff(bytes) {
    const result = {};
    for (let i = 0; i < Math.min(bytes.length - 6, 10000); i++) {
      if (bytes[i] === 0x45 && bytes[i + 1] === 0x78 && bytes[i + 2] === 0x69 && bytes[i + 3] === 0x66) {
        result.hasExif = true;
        break;
      }
    }
    for (let i = 0; i < Math.min(bytes.length - 12, 50000); i++) {
      if (bytes[i] === 0x69 && bytes[i + 1] === 0x73 && bytes[i + 2] === 0x70 && bytes[i + 3] === 0x65) {
        if (i + 12 <= bytes.length) {
          const view = new DataView(bytes.buffer, bytes.byteOffset + i + 4, 8);
          result.width = view.getUint32(0, false);
          result.height = view.getUint32(4, false);
        }
        break;
      }
    }
    return result;
  }

  async _parseDjvu(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);

    // djvu.js 라이브러리 시도
    try {
      const DjVu = await libLoader.loadDjVuJs();
      const doc = new DjVu.Document(buffer);
      const pages = doc.pages ? doc.pages.length : 0;
      const meta = { format: 'DjVu (djvu.js)', size: file.size, pages };
      let text = '[DjVu 문서]\n페이지 수: ' + pages + '\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
      // 텍스트 추출
      const texts = [];
      for (let i = 0; i < Math.min(pages, 20); i++) {
        try {
          const pageText = doc.pages[i].getText ? doc.pages[i].getText() : '';
          if (pageText && pageText.trim()) texts.push(pageText.trim());
        } catch (e) { /* skip */ }
      }
      if (texts.length > 0) {
        text += '\n추출된 텍스트:\n' + texts.join('\n\n');
        meta.textPages = texts.length;
      }
      return this.createResult(info.name, info.category, text, meta);
    } catch (e) {
      console.warn('djvu.js 로드 실패, 폴백:', e.message);
    }

    // 폴백: 헤더 분석
    const meta = { format: 'DjVu (폴백)', size: file.size };
    let text = '[DjVu 문서 파일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes.length > 16) {
      const formTag = String.fromCharCode(...bytes.slice(0, 4));
      if (formTag === 'AT&T') {
        meta.validMagic = true;
        text += '매직: AT&T (유효)\n';
      }
      const djvuType = String.fromCharCode(...bytes.slice(8, 12));
      if (djvuType === 'DJVU' || djvuType === 'DJVM') {
        meta.type = djvuType;
        meta.isMultiPage = djvuType === 'DJVM';
        text += '타입: ' + djvuType + (meta.isMultiPage ? ' (다중 페이지)' : ' (단일 페이지)') + '\n';
      }
    }
    const str = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 50000)));
    const pageCount = str.split('DJVU').length - 1;
    if (pageCount > 0) {
      meta.estimatedPages = pageCount;
      text += '추정 페이지 수: ' + pageCount + '\n';
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseDicom(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const dcmjsLib = await libLoader.loadDcmjs();
      return this._parseDicomWithLib(dcmjsLib, buffer, file, info);
    } catch (e) {
      console.warn('dcmjs 로드 실패, 폴백:', e.message);
      return this._parseDicomFallback(buffer, file, info);
    }
  }

  _parseDicomWithLib(dcmjsLib, buffer, file, info) {
    const DicomMessage = dcmjsLib.data.DicomMessage;
    const dataSet = DicomMessage.readFile(buffer);
    const dict = dcmjsLib.data.DicomMetaDictionary;
    const naturalData = dict.naturalizeDataset(dataSet.dict);
    const meta = { format: 'DICOM (dcmjs)', size: file.size, validMagic: true };

    // 주요 필드 맵 (dcmjs naturalizeDataset 키 → 한글명)
    const fieldMap = [
      { key: 'PatientName', name: '환자명' },
      { key: 'PatientID', name: '환자 ID' },
      { key: 'PatientBirthDate', name: '생년월일' },
      { key: 'PatientSex', name: '성별' },
      { key: 'Modality', name: '모달리티' },
      { key: 'Manufacturer', name: '제조사' },
      { key: 'StudyDescription', name: '검사 설명' },
      { key: 'SeriesDescription', name: '시리즈 설명' },
      { key: 'StudyDate', name: '검사 날짜' },
      { key: 'StudyTime', name: '검사 시간' },
      { key: 'AccessionNumber', name: '접수 번호' },
      { key: 'InstitutionName', name: '기관명' },
      { key: 'ReferringPhysicianName', name: '의뢰의' },
      { key: 'ProtocolName', name: '프로토콜' },
      { key: 'InstanceNumber', name: '인스턴스 번호' },
      { key: 'Rows', name: '행 수' },
      { key: 'Columns', name: '열 수' },
      { key: 'PixelSpacing', name: '픽셀 간격' },
      { key: 'BitsAllocated', name: '비트 할당' },
      { key: 'BitsStored', name: '비트 저장' },
      { key: 'PhotometricInterpretation', name: '포토메트릭' },
      { key: 'SamplesPerPixel', name: '샘플/픽셀' },
      { key: 'SliceThickness', name: '슬라이스 두께' },
      { key: 'KVP', name: 'kVp' },
      { key: 'Exposure', name: '노출량' },
    ];

    let text = '[DICOM 의료 영상 파일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n\n';
    text += '메타데이터:\n';

    for (const f of fieldMap) {
      const val = naturalData[f.key];
      if (val !== undefined && val !== null && val !== '') {
        const valStr = typeof val === 'object' ? (val.Alphabetic || JSON.stringify(val)) : String(val);
        if (valStr.trim()) {
          meta[f.name] = valStr.trim();
          text += f.name + ': ' + valStr.trim() + '\n';
        }
      }
    }

    // 이미지 크기
    if (naturalData.Rows && naturalData.Columns) {
      meta.imageSize = naturalData.Columns + 'x' + naturalData.Rows;
      text += '\n이미지 크기: ' + naturalData.Columns + 'x' + naturalData.Rows + ' 픽셀\n';
    }

    // Transfer Syntax
    const metaHeader = dataSet.meta || {};
    const naturalMeta = dict.naturalizeDataset(metaHeader);
    const ts = naturalMeta.TransferSyntaxUID;
    if (ts) {
      meta.transferSyntax = ts;
      const tsNames = {
        '1.2.840.10008.1.2': 'Implicit VR Little Endian',
        '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
        '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
        '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
        '1.2.840.10008.1.2.4.70': 'JPEG Lossless',
        '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
        '1.2.840.10008.1.2.4.91': 'JPEG 2000',
      };
      text += 'Transfer Syntax: ' + (tsNames[ts] || ts) + '\n';
    }

    return this.createResult(info.name, info.category, text, meta);
  }

  _parseDicomFallback(buffer, file, info) {
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'DICOM (폴백)', size: file.size };
    let text = '[DICOM 의료 영상 파일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes.length > 132) {
      const dicm = String.fromCharCode(...bytes.slice(128, 132));
      meta.validMagic = dicm === 'DICM';
      text += '매직: ' + (meta.validMagic ? 'DICM (유효)' : '확인 불가') + '\n';
    }
    const tags = this._extractDicomTagsFallback(bytes);
    if (Object.keys(tags).length > 0) {
      text += '\n메타데이터:\n';
      for (const [key, value] of Object.entries(tags)) {
        text += key + ': ' + value + '\n';
        meta[key] = value;
      }
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  _extractDicomTagsFallback(bytes) {
    const tags = {};
    const tagDefs = [
      { group: 0x0010, elem: 0x0010, name: '환자명' },
      { group: 0x0010, elem: 0x0020, name: '환자 ID' },
      { group: 0x0008, elem: 0x0060, name: '모달리티' },
      { group: 0x0008, elem: 0x1030, name: '검사 설명' },
      { group: 0x0008, elem: 0x0020, name: '검사 날짜' },
      { group: 0x0028, elem: 0x0010, name: '행 수' },
      { group: 0x0028, elem: 0x0011, name: '열 수' },
    ];
    if (bytes.length < 136) return tags;
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    for (let i = 132; i < Math.min(bytes.length - 8, 5000); i += 2) {
      for (const td of tagDefs) {
        if (view.getUint16(i, true) === td.group && view.getUint16(i + 2, true) === td.elem) {
          const vr = String.fromCharCode(bytes[i + 4], bytes[i + 5]);
          let valLen = 0;
          let valStart = 0;
          if (['OB', 'OW', 'OF', 'SQ', 'UC', 'UN', 'UT', 'UR'].includes(vr)) {
            valLen = view.getUint32(i + 8, true);
            valStart = i + 12;
          } else {
            valLen = view.getUint16(i + 6, true);
            valStart = i + 8;
          }
          if (valLen > 0 && valLen < 200 && valStart + valLen <= bytes.length) {
            const val = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(valStart, valStart + valLen)).replace(/\0/g, '').trim();
            if (val) tags[td.name] = val;
          }
        }
      }
    }
    return tags;
  }

}
