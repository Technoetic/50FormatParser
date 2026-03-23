class EmailParser extends BaseParser {
  async parse(file, formatInfo) {
    const ext = this.getFileExtension(file.name);
    if (ext === '.msg') return this._parseMsg(file, formatInfo);
    const text = await this.readAsText(file);
    return this._parseEml(text, formatInfo);
  }

  async _parseMsg(file, info) {
    const buffer = await this.readAsArrayBuffer(file);

    // @kenjiuno/msgreader 라이브러리 사용
    if (window.MsgReaderLib) {
      try {
        return this._parseMsgWithLib(buffer, file, info);
      } catch (e) {
        console.warn('MsgReader 파싱 실패, 폴백:', e.message);
      }
    }

    return this._parseMsgFallback(buffer, file, info);
  }

  _parseMsgWithLib(buffer, file, info) {
    var reader = new window.MsgReaderLib(buffer);
    var msgData = reader.getFileData();
    var meta = { format: 'Outlook MSG (msgreader)', size: file.size };
    var text = '[Outlook MSG 이메일 (msgreader)]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';

    if (msgData.subject) { meta.subject = msgData.subject; text += '제목: ' + msgData.subject + '\n'; }
    if (msgData.senderName) { text += '보낸 사람: ' + msgData.senderName; }
    if (msgData.senderEmail) { meta.from = msgData.senderEmail; text += ' <' + msgData.senderEmail + '>'; }
    if (msgData.senderName || msgData.senderEmail) text += '\n';

    // 수신자
    if (msgData.recipients && msgData.recipients.length > 0) {
      var toList = msgData.recipients.filter(function(r) { return r.recipType === 'to'; });
      var ccList = msgData.recipients.filter(function(r) { return r.recipType === 'cc'; });
      if (toList.length > 0) {
        meta.to = toList.map(function(r) { return r.name + (r.email ? ' <' + r.email + '>' : ''); }).join(', ');
        text += '받는 사람: ' + meta.to + '\n';
      }
      if (ccList.length > 0) {
        meta.cc = ccList.map(function(r) { return r.name + (r.email ? ' <' + r.email + '>' : ''); }).join(', ');
        text += '참조: ' + meta.cc + '\n';
      }
    }

    if (msgData.creationTime) { text += '작성일: ' + msgData.creationTime + '\n'; }
    if (msgData.lastModificationTime) { meta.lastModified = msgData.lastModificationTime; }

    // 첨부파일
    if (msgData.attachments && msgData.attachments.length > 0) {
      meta.attachments = msgData.attachments.length;
      text += '첨부파일: ' + msgData.attachments.length + '개';
      var names = msgData.attachments.map(function(a) { return a.fileName || a.name; }).filter(Boolean);
      if (names.length > 0) text += ' (' + names.join(', ') + ')';
      text += '\n';
    }

    // 본문
    if (msgData.body) {
      text += '\n--- 본문 ---\n' + msgData.body.substring(0, 10000);
    } else if (msgData.bodyHTML) {
      var body = msgData.bodyHTML.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      text += '\n--- 본문 ---\n' + body.substring(0, 10000);
    }

    meta.library = 'msgreader';
    return this.createResult(info.name, info.category, text, meta);
  }

  _parseMsgFallback(buffer, file, info) {
    var bytes = new Uint8Array(buffer);
    var meta = { format: 'Outlook MSG (폴백)', size: file.size };
    var text = '[Outlook MSG 이메일]\n파일 크기: ' + this.formatFileSize(file.size) + '\n';
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      meta.isOle2 = true;
      text += '형식: OLE2 Compound Document\n';
    }
    var strings = this._extractMsgStrings(bytes);
    if (strings.from) { meta.from = strings.from; text += '보낸 사람: ' + strings.from + '\n'; }
    if (strings.body) {
      text += '\n--- 본문 ---\n' + strings.body;
    } else if (strings.allStrings.length > 0) {
      text += '\n추출된 텍스트:\n' + strings.allStrings.join('\n');
    }
    return this.createResult(info.name, info.category, text, meta);
  }

  _extractMsgStrings(bytes) {
    var result = { allStrings: [] };
    var strings = [];
    var current = '';
    var limit = Math.min(bytes.length - 1, 200000);
    for (var i = 0; i < limit; i += 2) {
      var lo = bytes[i];
      var hi = bytes[i + 1];
      var code = lo | (hi << 8);
      if ((code >= 0x20 && code <= 0x7E) || (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x3000 && code <= 0x9FFF) || code === 0x0A || code === 0x0D) {
        current += String.fromCharCode(code);
      } else {
        if (current.trim().length >= 3) strings.push(current.trim());
        current = '';
      }
    }
    if (current.trim().length >= 3) strings.push(current.trim());
    current = '';
    for (var j = 0; j < Math.min(bytes.length, 200000); j++) {
      var b = bytes[j];
      if (b >= 0x20 && b <= 0x7E) { current += String.fromCharCode(b); }
      else { if (current.length >= 5) strings.push(current); current = ''; }
    }
    for (var k = 0; k < strings.length; k++) {
      if (strings[k].includes('@') && !result.from && strings[k].length < 100) { result.from = strings[k]; break; }
    }
    var sorted = strings.slice().sort(function(a, b) { return b.length - a.length; });
    if (sorted.length > 0 && sorted[0].length > 20) result.body = sorted[0].substring(0, 5000);
    result.allStrings = strings.filter(function(s) { return s.length >= 5; }).slice(0, 30);
    return result;
  }

  async _parseEml(text, info) {
    try {
      const PostalMime = await libLoader.loadPostalMime();
      return await this._parseEmlWithLib(PostalMime, text, info);
    } catch (e) {
      console.warn('postal-mime 로드 실패, 폴백:', e.message);
      return this._parseEmlFallback(text, info);
    }
  }

  async _parseEmlWithLib(PostalMime, text, info) {
    const parser = new PostalMime();
    const email = await parser.parse(text);
    const meta = {
      format: 'EML (postal-mime)',
      from: email.from ? (email.from.name ? email.from.name + ' <' + email.from.address + '>' : email.from.address) : undefined,
      to: email.to ? email.to.map(t => t.name ? t.name + ' <' + t.address + '>' : t.address).join(', ') : undefined,
      subject: email.subject,
      date: email.date,
      messageId: email.messageId,
      cc: email.cc ? email.cc.map(c => c.address).join(', ') : undefined,
      attachments: email.attachments ? email.attachments.length : 0
    };

    let body = email.text || '';
    if (!body && email.html) {
      body = email.html.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    let header = '';
    if (meta.subject) header += '제목: ' + meta.subject + '\n';
    if (meta.from) header += '보낸 사람: ' + meta.from + '\n';
    if (meta.to) header += '받는 사람: ' + meta.to + '\n';
    if (meta.cc) header += '참조: ' + meta.cc + '\n';
    if (meta.date) header += '날짜: ' + meta.date + '\n';
    if (meta.attachments > 0) {
      header += '첨부파일: ' + meta.attachments + '개';
      const names = email.attachments.map(a => a.filename).filter(Boolean);
      if (names.length > 0) header += ' (' + names.join(', ') + ')';
      header += '\n';
    }
    if (header) header += '\n--- 본문 ---\n';

    return this.createResult(info.name, info.category, header + body.substring(0, 10000), meta);
  }

  _parseEmlFallback(text, info) {
    const headerEnd = text.indexOf('\n\n');
    const headerStr = headerEnd > 0 ? text.substring(0, headerEnd) : text.substring(0, 2000);
    const body = headerEnd > 0 ? text.substring(headerEnd + 2) : '';
    const headers = {};
    headerStr.split('\n').forEach(line => {
      const m = line.match(/^([A-Za-z-]+):\s*(.+)/);
      if (m) headers[m[1]] = m[2].trim();
    });
    let plainBody = body;
    if (body.includes('Content-Type: text/plain')) {
      const idx = body.indexOf('Content-Type: text/plain');
      const start = body.indexOf('\n\n', idx);
      if (start > 0) {
        const end = body.indexOf('\n--', start);
        plainBody = end > 0 ? body.substring(start + 2, end) : body.substring(start + 2);
      }
    }
    return this.createResult(info.name, info.category, plainBody.substring(0, 10000), { format: 'EML (폴백)', from: headers['From'], to: headers['To'], subject: headers['Subject'], date: headers['Date'], contentType: headers['Content-Type'] });
  }

}
