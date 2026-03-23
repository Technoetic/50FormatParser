class DatabaseParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
      return this._parseSqlite(file, formatInfo);
    }
    if (ext === '.pkl' || ext === '.pickle') return this._parsePickle(file, formatInfo);
    if (ext === '.parquet') return this._parseParquet(file, formatInfo);
    if (ext === '.arrow' || ext === '.feather') return this._parseArrow(file, formatInfo);
    if (ext === '.avro') return this._parseAvro(file, formatInfo);
    if (ext === '.h5' || ext === '.hdf5') return this._parseHdf5(file, formatInfo);
    return this._parseBinaryHeader(file, formatInfo);
  }

  async _parseSqlite(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const headerText = String.fromCharCode(...bytes.slice(0, 16));

    if (!headerText.startsWith('SQLite format 3')) {
      return this.createResult(info.name, info.category, '[SQLite 데이터베이스 파일]\n용량: ' + this.formatFileSize(file.size), { format: 'SQLite', size: file.size });
    }

    try {
      const SQL = await libLoader.loadSqlJs();
      return this._parseWithSqlJs(SQL, buffer, info);
    } catch (e) {
      console.warn('sql.js 로드 실패, 폴백:', e.message);
      return this._parseSqliteFallback(buffer, file, info);
    }
  }

  _parseWithSqlJs(SQL, buffer, info) {
    const db = new SQL.Database(new Uint8Array(buffer));
    const meta = { format: 'SQLite (sql.js)', size: info.size };
    const allText = ['[SQLite 데이터베이스]\n'];

    // 테이블 목록 조회
    const tablesResult = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name");
    const tables = [];
    const views = [];
    if (tablesResult.length > 0) {
      for (const row of tablesResult[0].values) {
        if (row[1] === 'table') tables.push(row[0]);
        else views.push(row[0]);
      }
    }
    meta.tables = tables;
    meta.views = views;
    meta.tableCount = tables.length;
    meta.viewCount = views.length;

    allText.push('테이블 수: ' + tables.length);
    if (views.length > 0) allText.push('뷰 수: ' + views.length);

    const allTables = [];

    // 각 테이블의 스키마와 데이터 미리보기
    for (const tableName of tables) {
      allText.push('\n--- 테이블: ' + tableName + ' ---');

      // 행 수
      try {
        const countResult = db.exec('SELECT COUNT(*) FROM "' + tableName.replace(/"/g, '""') + '"');
        const rowCount = countResult[0]?.values[0]?.[0] || 0;
        allText.push('행 수: ' + rowCount);
      } catch (e) { /* skip */ }

      // 컬럼 정보
      try {
        const colResult = db.exec('PRAGMA table_info("' + tableName.replace(/"/g, '""') + '")');
        if (colResult.length > 0) {
          const columns = colResult[0].values.map(row => row[1] + ' (' + row[2] + ')');
          allText.push('컬럼: ' + columns.join(', '));
        }
      } catch (e) { /* skip */ }

      // 데이터 미리보기 (최대 20행)
      try {
        const dataResult = db.exec('SELECT * FROM "' + tableName.replace(/"/g, '""') + '" LIMIT 20');
        if (dataResult.length > 0) {
          const headers = dataResult[0].columns;
          const rows = dataResult[0].values.map(row => row.map(cell => String(cell != null ? cell : '')));
          allTables.push({ headers, rows, tableName });
          allText.push('\n미리보기 (' + rows.length + '행):');
          allText.push(headers.join(' | '));
          allText.push(headers.map(() => '---').join(' | '));
          for (const row of rows.slice(0, 10)) {
            allText.push(row.join(' | '));
          }
          if (rows.length > 10) allText.push('... (' + (rows.length - 10) + '행 더)');
        }
      } catch (e) { /* skip */ }
    }

    db.close();

    return this.createResult(info.name, info.category, allText.join('\n'), meta,
      allTables.length > 0 ? { tables: allTables } : {});
  }

  _parseSqliteFallback(buffer, file, info) {
    const view = new DataView(buffer);
    const meta = { format: 'SQLite (폴백)', size: file.size };
    meta.pageSize = view.getUint16(16, false);
    meta.pageCount = view.getUint32(28, false);
    meta.textEncoding = view.getUint32(56, false) === 1 ? 'UTF-8' : view.getUint32(56, false) === 2 ? 'UTF-16le' : view.getUint32(56, false) === 3 ? 'UTF-16be' : 'unknown';
    meta.schemaVersion = view.getUint32(40, false);
    const text = '[SQLite 데이터베이스]\n' +
      '페이지 크기: ' + meta.pageSize + ' bytes\n' +
      '페이지 수: ' + meta.pageCount + '\n' +
      '텍스트 인코딩: ' + meta.textEncoding + '\n' +
      '스키마 버전: ' + meta.schemaVersion + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size);
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parsePickle(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'Python Pickle', size: file.size };

    // 프로토콜 버전 감지
    if (bytes[0] === 0x80) {
      meta.protocol = bytes[1];
    } else if (bytes[0] === 0x28 || bytes[0] === 0x7D || bytes[0] === 0x5D) {
      meta.protocol = 0;
    }

    try {
      const lib = await libLoader.loadPickleParser();
      return this._parsePickleWithLib(lib, bytes, file, info, meta);
    } catch (e) {
      console.warn('pickleparser 로드 실패, 폴백:', e.message);
      return this._parsePickleFallback(bytes, file, info, meta);
    }
  }

  _parsePickleWithLib(lib, bytes, file, info, meta) {
    const allText = ['[Python Pickle 파일]\n'];
    const allTables = [];
    allText.push('프로토콜: v' + (meta.protocol !== undefined ? meta.protocol : '?'));
    allText.push('파일 크기: ' + this.formatFileSize(file.size));

    try {
      const parser = new lib.Parser();
      const result = parser.parse(bytes);
      meta.parsedType = typeof result;
      if (result !== null && result !== undefined) meta.parsedType = Array.isArray(result) ? 'list' : typeof result === 'object' ? result.constructor.name || 'dict' : typeof result;
      allText.push('데이터 타입: ' + meta.parsedType);

      // 결과를 읽기 쉬운 형태로 변환
      if (Array.isArray(result)) {
        meta.length = result.length;
        allText.push('항목 수: ' + result.length);
        // 배열이 dict 객체의 리스트인 경우 테이블로
        if (result.length > 0 && typeof result[0] === 'object' && result[0] !== null && !Array.isArray(result[0])) {
          const keys = Object.keys(result[0]);
          if (keys.length > 0 && keys.length <= 30) {
            const rows = result.slice(0, 100);
            const tableData = rows.map(row => {
              const r = {};
              keys.forEach(k => {
                const v = row[k];
                r[k] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v);
              });
              return r;
            });
            allTables.push({ headers: keys, rows: tableData.map(r => keys.map(k => r[k])) });
            if (result.length > 100) allText.push('(처음 100행만 표시)');
          }
        } else {
          // 간단한 배열
          const preview = result.slice(0, 50).map((v, i) => (i + 1) + '. ' + (typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v)));
          allText.push('\n데이터:\n' + preview.join('\n'));
          if (result.length > 50) allText.push('... 외 ' + (result.length - 50) + '개');
        }
      } else if (typeof result === 'object' && result !== null) {
        const keys = Object.keys(result);
        meta.keyCount = keys.length;
        allText.push('키 수: ' + keys.length);
        // dict를 키-값 테이블로
        if (keys.length > 0 && keys.length <= 200) {
          const tableRows = keys.slice(0, 100).map(k => {
            const v = result[k];
            const valStr = v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v);
            const typeStr = v === null ? 'null' : Array.isArray(v) ? 'list[' + v.length + ']' : typeof v;
            return [k, typeStr, valStr];
          });
          allTables.push({ headers: ['키', '타입', '값'], rows: tableRows });
          if (keys.length > 100) allText.push('(처음 100개 키만 표시)');
        }
      } else {
        allText.push('\n값: ' + String(result));
      }
    } catch (parseErr) {
      allText.push('\n[파싱 오류: ' + parseErr.message + ']');
      // 폴백으로 문자열 추출
      const strings = this._extractPickleStringsFallback(bytes);
      if (strings.length > 0) {
        allText.push('\n감지된 문자열:');
        strings.forEach((s, i) => allText.push((i + 1) + '. ' + s));
      }
    }

    allText.push('\n⚠ 보안 주의: Pickle 파일은 임의 코드 실행이 가능하므로 신뢰할 수 있는 소스의 파일만 사용하세요.');
    const r = this.createResult(info.name, info.category, allText.join('\n'), meta);
    if (allTables.length > 0) r.tables = allTables;
    return r;
  }

  _parsePickleFallback(bytes, file, info, meta) {
    const strings = this._extractPickleStringsFallback(bytes);
    const text = strings.length > 0 ? strings.map((s, idx) => (idx + 1) + '. ' + s).join('\n') : '(문자열 추출 불가)';
    return this.createResult(info.name, info.category,
      '[Python Pickle 파일]\n' +
      '프로토콜: v' + (meta.protocol !== undefined ? meta.protocol : '?') + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n\n' +
      '포함된 문자열:\n' + text + '\n\n' +
      '⚠ 보안 주의: Pickle 파일은 임의 코드 실행이 가능하므로 신뢰할 수 있는 소스의 파일만 사용하세요.',
      meta);
  }

  _extractPickleStringsFallback(bytes) {
    const strings = [];
    let i = 0;
    while (i < bytes.length && strings.length < 50) {
      if ((bytes[i] === 0x8C || bytes[i] === 0x55) && i + 1 < bytes.length) {
        const len = bytes[i + 1];
        if (i + 2 + len <= bytes.length) {
          try {
            const str = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(i + 2, i + 2 + len));
            if (str.length > 1 && /^[\x20-\x7E\u0080-\uFFFF]+$/.test(str)) strings.push(str);
          } catch (e) { /* skip */ }
          i += 2 + len;
          continue;
        }
      }
      if (bytes[i] === 0x58 && i + 4 < bytes.length) {
        const len = bytes[i + 1] | (bytes[i + 2] << 8) | (bytes[i + 3] << 16) | (bytes[i + 4] << 24);
        if (len > 0 && len < 10000 && i + 5 + len <= bytes.length) {
          try {
            const str = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(i + 5, i + 5 + len));
            if (str.length > 1) strings.push(str);
          } catch (e) { /* skip */ }
          i += 5 + len;
          continue;
        }
      }
      i++;
    }
    return strings;
  }

  async _parseParquet(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const hyparquet = await libLoader.loadHyparquet();
      return await this._parseParquetWithLib(hyparquet, buffer, file, info);
    } catch (e) {
      console.warn('hyparquet 로드 실패, 폴백:', e.message);
      return this._parseParquetFallback(buffer, file, info);
    }
  }

  async _parseParquetWithLib(hyparquet, buffer, file, info) {
    const meta = { format: 'Apache Parquet (hyparquet)', size: file.size, validMagic: true };
    const allText = ['[Apache Parquet 파일]\n'];
    const allTables = [];

    await hyparquet.parquetRead({
      file: buffer,
      rowEnd: 100,
      onComplete: (data) => {
        if (data && data.length > 0) {
          // data는 2D 배열 [[col1, col2, ...], ...]
          meta.totalRows = data.length;
        }
      }
    });

    // 메타데이터에서 스키마 읽기
    let columns = [];
    try {
      const metadata = hyparquet.parquetMetadataAsync ? await hyparquet.parquetMetadataAsync(buffer) : null;
      if (metadata && metadata.schema) {
        columns = metadata.schema.filter(s => s.name !== 'schema').map(s => s.name);
      }
      if (metadata) {
        meta.rowCount = metadata.num_rows;
        meta.rowGroupCount = metadata.row_groups ? metadata.row_groups.length : 0;
        allText.push('총 행 수: ' + (metadata.num_rows || '?'));
        allText.push('Row Group 수: ' + meta.rowGroupCount);
      }
    } catch (e) { /* skip */ }

    // 데이터 읽기 (최대 50행)
    try {
      let previewData = null;
      await hyparquet.parquetRead({
        file: buffer,
        rowEnd: 50,
        onComplete: (data) => { previewData = data; }
      });
      if (previewData && previewData.length > 0) {
        // 컬럼명이 없으면 첫 행 기반으로 인덱스 사용
        const headers = columns.length > 0 ? columns : previewData[0].map((_, i) => 'col_' + i);
        const rows = previewData.map(row => row.map(cell => String(cell != null ? cell : '')));
        allTables.push({ headers, rows: rows.slice(0, 50) });

        meta.columns = headers;
        meta.previewRows = rows.length;
        allText.push('컬럼 수: ' + headers.length);
        allText.push('\n컬럼명: ' + headers.join(', '));
        allText.push('\n미리보기 (' + Math.min(rows.length, 10) + '행):');
        allText.push(headers.join(' | '));
        allText.push(headers.map(() => '---').join(' | '));
        for (const row of rows.slice(0, 10)) {
          allText.push(row.join(' | '));
        }
        if (rows.length > 10) allText.push('... (' + (rows.length - 10) + '행 더)');
      }
    } catch (e) {
      allText.push('\n데이터 미리보기 실패: ' + e.message);
    }

    allText.unshift('파일 크기: ' + this.formatFileSize(file.size));
    return this.createResult(info.name, info.category, allText.join('\n'), meta,
      allTables.length > 0 ? { tables: allTables } : {});
  }

  _parseParquetFallback(buffer, file, info) {
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'Apache Parquet (폴백)', size: file.size };
    const magic = String.fromCharCode(...bytes.slice(0, 4));
    const tailMagic = bytes.length >= 4 ? String.fromCharCode(...bytes.slice(-4)) : '';
    meta.validMagic = magic === 'PAR1' && tailMagic === 'PAR1';
    if (meta.validMagic && bytes.length >= 8) {
      const view = new DataView(buffer);
      meta.footerLength = view.getInt32(bytes.length - 8, true);
    }
    const columns = this._extractParquetColumns(bytes);
    let text = '[Apache Parquet 파일]\n' +
      '매직: ' + (meta.validMagic ? 'PAR1 (유효)' : '확인 불가') + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (meta.footerLength) text += '푸터 크기: ' + this.formatFileSize(meta.footerLength) + '\n';
    if (columns.length > 0) {
      text += '\n감지된 컬럼명:\n' + columns.map((c, i) => (i + 1) + '. ' + c).join('\n');
      meta.columns = columns;
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  _extractParquetColumns(bytes) {
    const columns = [];
    const str = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(Math.max(0, bytes.length - 10000)));
    const matches = str.match(/[a-zA-Z_][a-zA-Z0-9_]{0,63}/g) || [];
    const seen = new Set();
    const ignoreWords = new Set(['PAR1', 'parquet', 'schema', 'PLAIN', 'SNAPPY', 'GZIP', 'NONE', 'OPTIONAL', 'REQUIRED', 'REPEATED', 'UTF8', 'INT32', 'INT64', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'BYTE_ARRAY', 'FIXED_LEN', 'MAP', 'LIST', 'org', 'apache', 'spark', 'pandas', 'writer', 'version', 'created', 'NULL']);
    for (const m of matches) {
      if (m.length > 1 && m.length < 50 && !ignoreWords.has(m) && !ignoreWords.has(m.toUpperCase()) && !seen.has(m)) {
        seen.add(m);
        columns.push(m);
        if (columns.length >= 30) break;
      }
    }
    return columns;
  }

  async _parseArrow(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const Arrow = await libLoader.loadArrowUmd();
      return this._parseArrowWithLib(Arrow, buffer, file, info);
    } catch (e) {
      console.warn('Apache Arrow UMD 로드 실패, 폴백:', e.message);
      return this._parseArrowFallback(buffer, file, info);
    }
  }

  _parseArrowWithLib(Arrow, buffer, file, info) {
    const meta = { format: 'Apache Arrow (arrow-js)', size: file.size, validMagic: true };
    const allText = [];
    const allTables = [];

    try {
      const table = Arrow.tableFromIPC(new Uint8Array(buffer));
      const schema = table.schema;
      const fields = schema.fields.map(f => ({ name: f.name, type: String(f.type) }));

      meta.columns = fields.map(f => f.name);
      meta.columnCount = fields.length;
      meta.rowCount = table.numRows;

      allText.push('[Apache Arrow 파일]');
      allText.push('파일 크기: ' + this.formatFileSize(file.size));
      allText.push('행 수: ' + table.numRows);
      allText.push('컬럼 수: ' + fields.length);
      allText.push('\n스키마:');
      for (const f of fields) {
        allText.push('  ' + f.name + ' (' + f.type + ')');
      }

      // 데이터 미리보기 (최대 20행)
      const headers = fields.map(f => f.name);
      const previewRows = Math.min(table.numRows, 20);
      const rows = [];
      for (let i = 0; i < previewRows; i++) {
        const row = headers.map(h => {
          const col = table.getChild(h);
          const val = col ? col.get(i) : '';
          return String(val != null ? val : '');
        });
        rows.push(row);
      }
      if (rows.length > 0) {
        allTables.push({ headers, rows });
        allText.push('\n미리보기 (' + rows.length + '행):');
        allText.push(headers.join(' | '));
        allText.push(headers.map(() => '---').join(' | '));
        for (const row of rows.slice(0, 10)) {
          allText.push(row.join(' | '));
        }
        if (rows.length > 10) allText.push('... (' + (rows.length - 10) + '행 더)');
      }
    } catch (e) {
      allText.push('[Arrow 파싱 오류: ' + e.message + ']');
    }

    return this.createResult(info.name, info.category, allText.join('\n'), meta,
      allTables.length > 0 ? { tables: allTables } : {});
  }

  _parseArrowFallback(buffer, file, info) {
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'Apache Arrow/Feather (폴백)', size: file.size };
    const magic = String.fromCharCode(...bytes.slice(0, 6));
    const featherMagic = String.fromCharCode(...bytes.slice(0, 4));
    if (magic === 'ARROW1') { meta.variant = 'Arrow IPC'; meta.validMagic = true; }
    else if (featherMagic === 'FEA1') { meta.variant = 'Feather v1'; meta.validMagic = true; }
    else { meta.variant = 'Arrow/Feather'; meta.validMagic = false; }
    const columns = this._extractTextStrings(bytes, 30);
    let text = '[' + meta.variant + ' 파일]\n' +
      '매직: ' + (meta.validMagic ? (meta.variant) + ' (유효)' : '확인 불가') + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (columns.length > 0) {
      text += '\n감지된 문자열:\n' + columns.map((c, i) => (i + 1) + '. ' + c).join('\n');
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseAvro(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'Apache Avro', size: file.size };
    const magic = bytes[0] === 0x4F && bytes[1] === 0x62 && bytes[2] === 0x6A && bytes[3] === 0x01;
    meta.validMagic = magic;

    // avsc 라이브러리로 스키마 및 데이터 디코딩
    if (magic && window.AvscLib) {
      try {
        // Avro 파일 헤더에서 스키마 JSON 추출
        const headerStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 16000)));
        const schemaMatch = headerStr.match(/\{[^{}]*"type"\s*:\s*"record"[^]*?\}/);
        if (schemaMatch) {
          const schemaJson = JSON.parse(schemaMatch[0]);
          const type = window.AvscLib.Type.forSchema(schemaJson);
          meta.schemaName = schemaJson.name;
          meta.namespace = schemaJson.namespace;
          meta.fields = type.fields.map(f => ({ name: f.name, type: f.type.typeName || String(f.type) }));

          let text = '[Apache Avro 파일]\n매직: Obj1 (유효)\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
          text += '스키마: ' + schemaJson.name + '\n';
          if (schemaJson.namespace) text += '네임스페이스: ' + schemaJson.namespace + '\n';
          text += '\n필드 (' + meta.fields.length + '개):\n';
          text += meta.fields.map((f, i) => (i + 1) + '. ' + f.name + ' (' + f.type + ')').join('\n');

          // Avro 바이너리 데이터 디코딩 시도 (sync block 파싱)
          try {
            const records = this._decodeAvroRecords(bytes, type);
            if (records.length > 0) {
              meta.recordCount = records.length;
              text += '\n\n레코드 수: ' + records.length + '\n';
              const headers = meta.fields.map(f => f.name);
              const rows = records.slice(0, 50).map(r => headers.map(h => String(r[h] != null ? r[h] : '')));
              text += '\n미리보기 (최대 50행):\n';
              text += headers.join(' | ') + '\n';
              text += headers.map(() => '---').join(' | ') + '\n';
              for (const row of rows.slice(0, 20)) text += row.join(' | ') + '\n';
              if (rows.length > 20) text += '... (' + (rows.length - 20) + '행 더)\n';
              meta.parserUsed = 'avsc';
              return this.createResult(info.name, info.category, text, meta, { tables: [{ headers, rows }] });
            }
          } catch (decErr) { /* 데이터 디코딩 실패해도 스키마는 표시 */ }

          meta.parserUsed = 'avsc';
          return this.createResult(info.name, info.category, text, meta);
        }
      } catch (e) {
        console.warn('avsc 파싱 실패, 폴백:', e.message);
      }
    }

    // 폴백: 정규식 스키마 추출
    let schemaText = '';
    if (magic) {
      const headerStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 8000)));
      const schemaMatch = headerStr.match(/\{[^{}]*"type"\s*:\s*"record"[^]*?\}/);
      if (schemaMatch) {
        try {
          const schema = JSON.parse(schemaMatch[0]);
          meta.schemaName = schema.name;
          meta.namespace = schema.namespace;
          meta.fields = (schema.fields || []).map(f => f.name);
          schemaText = '\n스키마: ' + schema.name + '\n' +
            (schema.namespace ? '네임스페이스: ' + schema.namespace + '\n' : '') +
            '\n필드:\n' + meta.fields.map((f, i) => (i + 1) + '. ' + f).join('\n');
        } catch (e) { /* skip */ }
      }
    }
    let text = '[Apache Avro 파일]\n' +
      '매직: ' + (meta.validMagic ? 'Obj1 (유효)' : '확인 불가') + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n' + schemaText;
    return this.createResult(info.name, info.category, text, meta);
  }

  _decodeAvroRecords(bytes, type) {
    // Avro Object Container File: header + sync marker + data blocks
    // Header: magic(4) + meta(map) + sync(16)
    // Each block: count(long) + size(long) + data + sync(16)
    const records = [];
    let pos = 4; // skip magic

    // Skip header metadata (Avro map encoding)
    const readLong = () => {
      let n = 0, shift = 0, b;
      do {
        if (pos >= bytes.length) return 0;
        b = bytes[pos++];
        n |= (b & 0x7F) << shift;
        shift += 7;
      } while (b & 0x80);
      return (n >>> 1) ^ -(n & 1); // zigzag decode
    };

    // Read header map
    let blockCount = readLong();
    while (blockCount !== 0) {
      const count = Math.abs(blockCount);
      for (let i = 0; i < count; i++) {
        // key (string)
        const keyLen = readLong();
        pos += keyLen;
        // value (bytes)
        const valLen = readLong();
        pos += valLen;
      }
      blockCount = readLong();
    }
    // sync marker (16 bytes)
    const syncMarker = bytes.slice(pos, pos + 16);
    pos += 16;

    // Read data blocks
    const maxRecords = 200;
    while (pos < bytes.length - 16 && records.length < maxRecords) {
      const count = readLong();
      const blockSize = readLong();
      if (count <= 0 || blockSize <= 0 || pos + blockSize > bytes.length) break;
      const blockEnd = pos + blockSize;
      for (let i = 0; i < count && pos < blockEnd && records.length < maxRecords; i++) {
        try {
          const buf = Buffer.from(bytes.buffer, bytes.byteOffset + pos, blockEnd - pos);
          const record = type.fromBuffer(buf);
          const consumed = type.fromBuffer(buf, undefined, true);
          // fromBuffer with resolver returns [val, buf] when noCheck is true
          records.push(record);
          // Estimate consumed bytes
          const reEncoded = type.toBuffer(record);
          pos += reEncoded.length;
        } catch (e) {
          break;
        }
      }
      pos = blockEnd + 16; // skip sync marker
    }
    return records;
  }

  async _parseHdf5(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    try {
      const hdf5 = await libLoader.loadJsfive();
      return this._parseHdf5WithLib(hdf5, buffer, file, info);
    } catch (e) {
      console.warn('jsfive 로드 실패, 폴백:', e.message);
      return this._parseHdf5Fallback(buffer, file, info);
    }
  }

  _parseHdf5WithLib(hdf5, buffer, file, info) {
    const meta = { format: 'HDF5 (jsfive)', size: file.size, validMagic: true };
    const allText = ['[HDF5 과학 데이터 파일]\n'];
    allText.push('파일 크기: ' + this.formatFileSize(file.size));

    const f = new hdf5.File(buffer, file.name);
    const datasets = [];
    const groups = [];

    // 재귀적으로 그룹/데이터셋 탐색
    const explore = (obj, path) => {
      if (!obj || !obj.keys) return;
      for (const key of obj.keys) {
        const fullPath = path ? path + '/' + key : key;
        try {
          const item = obj.get(key);
          if (item && item.keys) {
            groups.push(fullPath);
            if (groups.length + datasets.length < 100) explore(item, fullPath);
          } else if (item) {
            const ds = { name: fullPath };
            if (item.shape) ds.shape = item.shape;
            if (item.dtype) ds.dtype = String(item.dtype);
            datasets.push(ds);
          }
        } catch (e) { /* skip unreadable item */ }
      }
    };
    explore(f, '');

    meta.groups = groups;
    meta.datasetCount = datasets.length;
    meta.groupCount = groups.length;

    allText.push('그룹 수: ' + groups.length);
    allText.push('데이터셋 수: ' + datasets.length);

    if (groups.length > 0) {
      allText.push('\n그룹:');
      for (const g of groups.slice(0, 20)) {
        allText.push('  /' + g);
      }
      if (groups.length > 20) allText.push('  ... (' + (groups.length - 20) + '개 더)');
    }

    if (datasets.length > 0) {
      allText.push('\n데이터셋:');
      for (const ds of datasets.slice(0, 30)) {
        let line = '  /' + ds.name;
        if (ds.shape) line += '  shape=' + JSON.stringify(ds.shape);
        if (ds.dtype) line += '  dtype=' + ds.dtype;
        allText.push(line);
      }
      if (datasets.length > 30) allText.push('  ... (' + (datasets.length - 30) + '개 더)');

      // 첫 번째 작은 데이터셋 미리보기
      for (const ds of datasets.slice(0, 3)) {
        try {
          const item = f.get(ds.name);
          if (item && item.value) {
            const val = item.value;
            if (Array.isArray(val) || ArrayBuffer.isView(val)) {
              const preview = Array.from(val).slice(0, 10).map(String);
              allText.push('\n/' + ds.name + ' 미리보기: [' + preview.join(', ') + (val.length > 10 ? ', ...' : '') + ']');
            }
          }
        } catch (e) { /* skip */ }
      }
    }

    // 루트 속성
    try {
      if (f.attrs && Object.keys(f.attrs).length > 0) {
        allText.push('\n루트 속성:');
        for (const [key, val] of Object.entries(f.attrs)) {
          allText.push('  ' + key + ': ' + String(val));
          meta['attr_' + key] = String(val);
        }
      }
    } catch (e) { /* skip */ }

    return this.createResult(info.name, info.category, allText.join('\n'), meta);
  }

  _parseHdf5Fallback(buffer, file, info) {
    const bytes = new Uint8Array(buffer);
    const meta = { format: 'HDF5 (폴백)', size: file.size };
    const magic = bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46 &&
                  bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
    meta.validMagic = magic;
    if (magic) meta.superblockVersion = bytes[8];
    const datasets = this._extractTextStrings(bytes, 30);
    let text = '[HDF5 과학 데이터 파일]\n' +
      '매직: ' + (meta.validMagic ? 'HDF5 (유효)' : '확인 불가') + '\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (meta.superblockVersion !== undefined) text += '슈퍼블록 버전: ' + meta.superblockVersion + '\n';
    if (datasets.length > 0) {
      text += '\n감지된 데이터셋/속성명:\n' + datasets.map((d, i) => (i + 1) + '. ' + d).join('\n');
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  async _parseBinaryHeader(file, info) {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);
    const strings = this._extractTextStrings(bytes, 20);
    let text = '[' + info.name + ' 파일]\n' +
      '파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (strings.length > 0) {
      text += '\n감지된 문자열:\n' + strings.map((s, i) => (i + 1) + '. ' + s).join('\n');
    }
    return this.createResult(info.name, info.category, text, { format: info.name, size: file.size });
  }

  _extractTextStrings(bytes, maxCount) {
    const strings = [];
    const seen = new Set();
    let current = '';
    const limit = Math.min(bytes.length, 50000);
    for (let i = 0; i < limit; i++) {
      const b = bytes[i];
      if (b >= 0x20 && b <= 0x7E) {
        current += String.fromCharCode(b);
      } else {
        if (current.length >= 3 && current.length < 100 && !seen.has(current) && /[a-zA-Z]/.test(current)) {
          seen.add(current);
          strings.push(current);
          if (strings.length >= maxCount) break;
        }
        current = '';
      }
    }
    return strings;
  }
}
