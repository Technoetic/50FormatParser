class DomainParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.shp') return this._parseShapefile(file, formatInfo);
    if (ext === '.dbf') return this._parseDbf(file, formatInfo);
    if (ext === '.dxf') return this._parseDxf(file, formatInfo);
    if (ext === '.dwg') return this._parseDwg(file, formatInfo);
    if (ext === '.proto') return this._parseProto(file, formatInfo);
    if (ext === '.msgpack' || ext === '.msgpck') return this._parseMsgpack(file, formatInfo);
    return this.createResult(formatInfo.name, formatInfo.category, '[' + formatInfo.name + ' 파일]\n파일 크기: ' + this.formatFileSize(file.size), { format: formatInfo.name, size: file.size });
  }

  // --- Shapefile: shpjs 라이브러리 ---
  async _parseShapefile(file, info) {
    try {
      const shp = await libLoader.loadShpjs();
      const buffer = await this.readAsArrayBuffer(file);
      const geojson = await shp(buffer);
      if (geojson) {
        const features = geojson.features || [];
        const meta = {
          format: 'Shapefile (shpjs)',
          featureCount: features.length,
          type: geojson.type
        };
        if (features.length > 0 && features[0].geometry) {
          meta.geometryType = features[0].geometry.type;
        }
        if (features.length > 0 && features[0].properties) {
          meta.fields = Object.keys(features[0].properties);
        }
        // bbox
        if (geojson.bbox) meta.bbox = geojson.bbox;

        let text = '[Shapefile 지리 데이터]\n' +
          '피처 수: ' + features.length + '\n';
        if (meta.geometryType) text += '도형 타입: ' + meta.geometryType + '\n';
        if (meta.fields) text += '속성 필드: ' + meta.fields.join(', ') + '\n';
        if (meta.bbox) text += '바운딩 박스: ' + meta.bbox.map(v => v.toFixed(6)).join(', ') + '\n';

        // 속성 테이블 (최대 50행)
        if (features.length > 0 && meta.fields) {
          const headers = meta.fields;
          const rows = features.slice(0, 50).map(f => headers.map(h => String(f.properties[h] != null ? f.properties[h] : '')));
          text += '\n속성 데이터 (최대 50행):\n';
          text += features.slice(0, 50).map((f, i) => (i + 1) + '. ' + headers.map(h => h + '=' + (f.properties[h] != null ? f.properties[h] : '')).join(', ')).join('\n');
          return this.createResult(info.name, info.category, text, meta, { tables: [{ headers, rows }] });
        }
        return this.createResult(info.name, info.category, text, meta);
      }
    } catch (e) {
      console.warn('shpjs 실패, 폴백:', e.message);
    }
    return this._parseShapefileFallback(file, info);
  }

  async _parseShapefileFallback(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const view = new DataView(buffer);
    const meta = { format: 'Shapefile (폴백)', size: file.size };
    let text = '[Shapefile 지리 데이터]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (buffer.byteLength >= 100) {
      const fileCode = view.getInt32(0, false);
      meta.validMagic = fileCode === 9994;
      if (meta.validMagic) {
        const version = view.getInt32(28, true);
        const shapeType = view.getInt32(32, true);
        const shapeTypes = { 0: 'Null', 1: 'Point', 3: 'PolyLine', 5: 'Polygon', 8: 'MultiPoint', 11: 'PointZ', 13: 'PolyLineZ', 15: 'PolygonZ', 18: 'MultiPointZ', 21: 'PointM', 23: 'PolyLineM', 25: 'PolygonM', 28: 'MultiPointM', 31: 'MultiPatch' };
        meta.shapeType = shapeTypes[shapeType] || 'Unknown(' + shapeType + ')';
        meta.bbox = {
          xMin: view.getFloat64(36, true), yMin: view.getFloat64(44, true),
          xMax: view.getFloat64(52, true), yMax: view.getFloat64(60, true)
        };
        text += '도형 타입: ' + meta.shapeType + '\n' +
          'X: ' + meta.bbox.xMin.toFixed(6) + ' ~ ' + meta.bbox.xMax.toFixed(6) + '\n' +
          'Y: ' + meta.bbox.yMin.toFixed(6) + ' ~ ' + meta.bbox.yMax.toFixed(6) + '\n';
        let recordCount = 0;
        let offset = 100;
        while (offset + 8 < buffer.byteLength) {
          const recLen = view.getInt32(offset + 4, false) * 2;
          recordCount++;
          offset += 8 + recLen;
        }
        meta.recordCount = recordCount;
        text += '레코드 수: ' + recordCount + '\n';
      }
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  // --- DBF: dbf-reader 라이브러리 (vendor/dbf-reader.browser.js) ---
  async _parseDbf(file, info) {
    const buffer = await this.readAsArrayBuffer(file);

    // dbf-reader 라이브러리 사용
    if (window.DBFReader && window.DBFReader.Dbf) {
      try {
        const dbf = window.DBFReader.Dbf.read(buffer);
        const meta = {
          format: 'dBASE (dbf-reader)',
          size: file.size,
          recordCount: dbf.rows.length,
          fields: dbf.fields.map(f => f.name)
        };
        let text = '[dBASE/DBF 속성 데이터]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
        text += '레코드 수: ' + dbf.rows.length + '\n';
        text += '\n필드 (' + dbf.fields.length + '개):\n';
        text += dbf.fields.map((f, i) => (i + 1) + '. ' + f.name + ' (' + f.type + ', ' + f.size + ')').join('\n');

        // 데이터 테이블
        const headers = dbf.fields.map(f => f.name);
        const rows = dbf.rows.slice(0, 50).map(row => headers.map(h => String(row[h] != null ? row[h] : '')));
        if (rows.length > 0) {
          text += '\n\n레코드 데이터 (최대 50행):\n';
          text += rows.slice(0, 20).map((row, i) => (i + 1) + '. ' + headers.map((h, j) => h + '=' + row[j]).join(', ')).join('\n');
          if (rows.length > 20) text += '\n... (' + (rows.length - 20) + '행 더)';
          return this.createResult(info.name, info.category, text, meta, { tables: [{ headers, rows }] });
        }
        return this.createResult(info.name, info.category, text, meta);
      } catch (e) {
        console.warn('dbf-reader 파싱 실패, 폴백:', e.message);
      }
    }

    // 폴백: 자체 바이너리 파싱
    return this._parseDbfFallback(buffer, info);
  }

  _parseDbfFallback(buffer, info) {
    const view = new DataView(buffer);
    const meta = { format: 'dBASE (폴백)', size: info.size || buffer.byteLength };
    let text = '[dBASE/DBF 속성 데이터]\n';
    if (buffer.byteLength >= 32) {
      const recordCount = view.getUint32(4, true);
      const headerSize = view.getUint16(8, true);
      meta.recordCount = recordCount;
      text += '레코드 수: ' + recordCount + '\n';
      const fields = [];
      let offset = 32;
      while (offset + 32 <= headerSize && view.getUint8(offset) !== 0x0D) {
        const nameBytes = new Uint8Array(buffer, offset, 11);
        const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
        const type = String.fromCharCode(view.getUint8(offset + 11));
        const length = view.getUint8(offset + 16);
        fields.push({ name, type, length });
        offset += 32;
      }
      if (fields.length > 0) {
        meta.fields = fields.map(f => f.name);
        text += '\n필드 (' + fields.length + '개):\n';
        text += fields.map((f, i) => (i + 1) + '. ' + f.name + ' (' + f.type + ', ' + f.length + ')').join('\n');
        return this.createResult(info.name, info.category, text, meta, {
          tables: [{ headers: ['필드명', '타입', '길이'], rows: fields.map(f => [f.name, f.type, f.length + '']) }]
        });
      }
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  // --- DXF: dxf-parser 라이브러리 ---
  async _parseDxf(file, info) {
    const text = await this.readAsText(file);
    try {
      const DxfParser = await libLoader.loadDxfParser();
      const parser = new DxfParser();
      const dxf = parser.parseSync(text);
      if (dxf) {
        const meta = { format: 'DXF (dxf-parser)' };
        let result = '[DXF CAD 도면]\n';

        // 헤더 변수
        if (dxf.header) {
          const vars = Object.keys(dxf.header);
          meta.headerVars = vars.length;
          if (dxf.header['$ACADVER']) result += 'AutoCAD 버전: ' + dxf.header['$ACADVER'] + '\n';
          if (dxf.header['$INSUNITS']) result += '단위: ' + dxf.header['$INSUNITS'] + '\n';
        }

        // 레이어
        if (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
          const layers = Object.keys(dxf.tables.layer.layers);
          meta.layerCount = layers.length;
          result += '레이어 수: ' + layers.length + '\n';
          result += '레이어: ' + layers.slice(0, 20).join(', ') + (layers.length > 20 ? '...' : '') + '\n';
        }

        // 블록
        if (dxf.blocks) {
          const blocks = Object.keys(dxf.blocks);
          meta.blockCount = blocks.length;
          result += '블록 수: ' + blocks.length + '\n';
        }

        // 엔티티
        if (dxf.entities) {
          meta.entityCount = dxf.entities.length;
          result += '엔티티 수: ' + dxf.entities.length + '\n';
          const typeCounts = {};
          dxf.entities.forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
          result += '엔티티 타입: ' + Object.entries(typeCounts).map(([k, v]) => k + '(' + v + ')').join(', ') + '\n';

          // TEXT/MTEXT 내용 추출
          const texts = dxf.entities.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && e.text);
          if (texts.length > 0) {
            result += '\n텍스트 내용:\n' + texts.slice(0, 100).map(t => t.text).join('\n');
            meta.textCount = texts.length;
          }

          // DIMENSION
          const dims = dxf.entities.filter(e => e.type === 'DIMENSION');
          if (dims.length > 0) {
            meta.dimensionCount = dims.length;
            result += '\n치수 수: ' + dims.length + '\n';
          }
        }

        return this.createResult(info.name, info.category, result, meta);
      }
    } catch (e) {
      console.warn('dxf-parser 실패, 폴백:', e.message);
    }
    return this._parseDxfFallback(text, info);
  }

  _parseDxfFallback(text, info) {
    const entities = text.match(/^\s*0\n\s*(\w+)/gm) || [];
    const typeCounts = {};
    entities.forEach(e => { const t = e.trim().split('\n').pop().trim(); typeCounts[t] = (typeCounts[t] || 0) + 1; });
    let result = '[DXF CAD 도면 (폴백)]\n엔티티: ' + entities.length + '\n';
    result += Object.entries(typeCounts).map(([k, v]) => k + ': ' + v).join('\n');
    return this.createResult(info.name, info.category, result, { format: 'DXF (폴백)', entities: entities.length });
  }

  // --- DWG: libredwg-web (WASM) ---
  async _parseDwg(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'DWG', size: file.size };

    try {
      const libredwg = await libLoader.loadLibreDwg();
      return this._parseDwgWithLib(libredwg, buffer, file, info, meta);
    } catch (e) {
      console.warn('libredwg-web 로드 실패, 폴백:', e.message);
      return this._parseDwgFallback(bytes, file, info, meta);
    }
  }

  _parseDwgWithLib(libredwg, buffer, file, info, meta) {
    const allText = ['[DWG CAD 도면 (libredwg-web)]'];
    const allTables = [];
    allText.push('파일 크기: ' + this.formatFileSize(file.size));

    const dwgData = libredwg.dwg_read_data(buffer, 0); // 0 = DWG type
    if (!dwgData) throw new Error('DWG 파일 열기 실패');

    // 버전 정보
    const version = libredwg.dwg_get_version_type(dwgData);
    if (version) {
      meta.version = version;
      allText.push('버전: AutoCAD ' + version);
    }

    // convert to DwgDatabase
    const db = libredwg.convert(dwgData);
    libredwg.dwg_free(dwgData);

    if (!db) throw new Error('DWG 변환 실패');

    // 레이어
    if (db.tables && db.tables.LAYER && db.tables.LAYER.entries) {
      const layers = db.tables.LAYER.entries;
      meta.layerCount = layers.length;
      allText.push('\n레이어 (' + layers.length + '개):');
      const layerRows = layers.map(function(l) {
        return [
          l.name || '',
          l.frozen ? '동결' : l.off ? '꺼짐' : '켜짐',
          l.locked ? '잠김' : '',
          l.lineType || ''
        ];
      });
      allTables.push({ headers: ['레이어명', '상태', '잠금', '선종류'], rows: layerRows });
    }

    // 엔티티 통계
    if (db.entities && db.entities.length > 0) {
      meta.entityCount = db.entities.length;
      allText.push('\n엔티티 수: ' + db.entities.length);
      // 타입별 카운트
      const typeCounts = {};
      db.entities.forEach(function(e) {
        var t = e.type || 'UNKNOWN';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      const typeEntries = Object.entries(typeCounts).sort(function(a, b) { return b[1] - a[1]; });
      allText.push('\n엔티티 타입 분포:');
      const typeRows = typeEntries.map(function(entry) { return [entry[0], String(entry[1])]; });
      allTables.push({ headers: ['엔티티 타입', '개수'], rows: typeRows });

      // TEXT/MTEXT 내용 추출
      var texts = [];
      db.entities.forEach(function(e) {
        if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.text) {
          texts.push(e.text);
        } else if (e.type === 'ATTRIB' && e.text) {
          texts.push(e.text);
        }
      });
      if (texts.length > 0) {
        meta.textCount = texts.length;
        allText.push('\n텍스트 내용 (' + texts.length + '개):');
        texts.slice(0, 100).forEach(function(t, i) { allText.push((i + 1) + '. ' + t); });
        if (texts.length > 100) allText.push('... 외 ' + (texts.length - 100) + '개');
      }
    }

    // 블록 레코드
    if (db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) {
      var blocks = db.tables.BLOCK_RECORD.entries.filter(function(b) {
        return b.name && !b.name.startsWith('*');
      });
      if (blocks.length > 0) {
        meta.blockCount = blocks.length;
        allText.push('\n사용자 블록 (' + blocks.length + '개):');
        blocks.slice(0, 30).forEach(function(b, i) { allText.push('  ' + (i + 1) + '. ' + b.name); });
      }
    }

    // 스타일
    if (db.tables && db.tables.STYLE && db.tables.STYLE.entries) {
      meta.styleCount = db.tables.STYLE.entries.length;
    }

    meta.library = 'libredwg-web (WASM)';
    var r = this.createResult(info.name, info.category, allText.join('\n'), meta);
    if (allTables.length > 0) r.tables = allTables;
    return r;
  }

  _parseDwgFallback(bytes, file, info, meta) {
    var text = '[DWG CAD 도면]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes.length >= 6) {
      var verStr = new TextDecoder().decode(bytes.slice(0, 6));
      var versions = {
        'AC1015': '2000', 'AC1018': '2004', 'AC1021': '2007',
        'AC1024': '2010', 'AC1027': '2013', 'AC1032': '2018'
      };
      meta.versionCode = verStr;
      meta.version = versions[verStr] || 'Unknown';
      text += '버전: AutoCAD ' + meta.version + ' (' + verStr + ')\n';
    }
    text += '\nDWG 라이브러리 로드 실패. 기본 헤더 정보만 표시합니다.';
    return this.createResult(info.name, info.category, text, meta);
  }

  // --- Protocol Buffers (.proto): protobufjs ---
  async _parseProto(file, info) {
    const text = await this.readAsText(file);
    try {
      const protobuf = await libLoader.loadProtobuf();
      const parsed = protobuf.parse(text);
      if (parsed && parsed.root) {
        const meta = { format: 'Protobuf (protobufjs)' };
        let result = '[Protocol Buffers 정의 파일]\n';
        if (parsed.package) {
          meta.package = parsed.package;
          result += '패키지: ' + parsed.package + '\n';
        }
        // 메시지 타입들
        const types = [];
        const services = [];
        parsed.root.nestedArray.forEach(item => {
          if (item.constructor.name === 'Type') {
            types.push(item);
          } else if (item.constructor.name === 'Service') {
            services.push(item);
          }
        });
        if (types.length > 0) {
          meta.messageCount = types.length;
          result += '메시지 수: ' + types.length + '\n\n';
          types.forEach(t => {
            result += 'message ' + t.name + ' {\n';
            if (t.fieldsArray) {
              t.fieldsArray.forEach(f => {
                result += '  ' + f.type + ' ' + f.name + ' = ' + f.id + ';\n';
              });
            }
            result += '}\n\n';
          });
        }
        if (services.length > 0) {
          meta.serviceCount = services.length;
          result += '서비스 수: ' + services.length + '\n';
          services.forEach(s => {
            result += 'service ' + s.name + '\n';
          });
        }
        return this.createResult(info.name, info.category, result, meta);
      }
    } catch (e) {
      console.warn('protobufjs 파싱 실패:', e.message);
    }
    // 폴백: 텍스트 그대로
    return this.createResult(info.name, info.category, text, { format: 'Protobuf (텍스트)', size: file.size });
  }

  // --- MessagePack: @msgpack/msgpack ---
  async _parseMsgpack(file, info) {
    var buffer = await this.readAsArrayBuffer(file);
    var bytes = new Uint8Array(buffer);

    try {
      var msgpack = await libLoader.loadMsgpack();
      return this._parseMsgpackWithLib(msgpack, bytes, file, info);
    } catch (e) {
      console.warn('msgpack 로드 실패, 폴백:', e.message);
      return this._parseMsgpackFallback(bytes, file, info);
    }
  }

  _parseMsgpackWithLib(msgpack, bytes, file, info) {
    var decoded = msgpack.decode(bytes);
    var meta = { format: 'MessagePack (@msgpack/msgpack)', size: file.size };
    var text = '[MessagePack 데이터 (@msgpack/msgpack)]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';

    var type = typeof decoded;
    if (Array.isArray(decoded)) {
      type = 'Array';
      meta.itemCount = decoded.length;
      text += '타입: 배열 (' + decoded.length + '개 항목)\n';
    } else if (decoded && type === 'object') {
      var keys = Object.keys(decoded);
      type = 'Object';
      meta.keyCount = keys.length;
      meta.keys = keys.slice(0, 50);
      text += '타입: 객체 (' + keys.length + '개 키)\n';
      text += '키: ' + keys.slice(0, 30).join(', ') + (keys.length > 30 ? '...' : '') + '\n';
    } else {
      text += '타입: ' + type + '\n';
    }

    // JSON으로 변환하여 표시
    try {
      var jsonStr = JSON.stringify(decoded, function(key, value) {
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
          return '[Binary ' + (value.byteLength || value.length) + ' bytes]';
        }
        if (typeof value === 'bigint') return value.toString();
        return value;
      }, 2);
      if (jsonStr.length > 20000) jsonStr = jsonStr.substring(0, 20000) + '\n... (truncated)';
      text += '\n--- 데이터 ---\n' + jsonStr;
      meta.characters = jsonStr.length;
    } catch (e) {
      text += '\n[JSON 변환 실패: ' + e.message + ']';
    }

    // 배열인 경우 테이블로 표시
    if (Array.isArray(decoded) && decoded.length > 0 && decoded[0] && typeof decoded[0] === 'object' && !Array.isArray(decoded[0])) {
      var headers = Object.keys(decoded[0]).slice(0, 20);
      var rows = decoded.slice(0, 100).map(function(row) {
        return headers.map(function(h) {
          var v = row[h];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return JSON.stringify(v).substring(0, 100);
          return String(v);
        });
      });
      meta.library = '@msgpack/msgpack';
      var r = this.createResult(info.name, info.category, text, meta);
      r.tables = [{ headers: headers, rows: rows }];
      return r;
    }

    meta.library = '@msgpack/msgpack';
    return this.createResult(info.name, info.category, text, meta);
  }

  _parseMsgpackFallback(bytes, file, info) {
    var meta = { format: 'MessagePack (폴백)', size: file.size };
    var text = '[MessagePack 파일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    // 첫 바이트로 타입 추정
    if (bytes.length > 0) {
      var b = bytes[0];
      if (b >= 0x80 && b <= 0x8F) text += '타입: fixmap (' + (b - 0x80) + '개 엔트리)\n';
      else if (b >= 0x90 && b <= 0x9F) text += '타입: fixarray (' + (b - 0x90) + '개 항목)\n';
      else if (b === 0xDC) text += '타입: array16\n';
      else if (b === 0xDD) text += '타입: array32\n';
      else if (b === 0xDE) text += '타입: map16\n';
      else if (b === 0xDF) text += '타입: map32\n';
    }
    return this.createResult(info.name, info.category, text, meta);
  }
}
