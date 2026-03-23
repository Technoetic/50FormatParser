class AudioParser extends BaseParser {
  async parse(file, formatInfo) {
    const metadata = { format: formatInfo.name, type: file.type, size: this.formatFileSize(file.size) };

    // 브라우저 Audio 태그로 duration 추출
    try {
      const duration = await this._getAudioDuration(file);
      metadata.duration = this._formatDuration(duration);
      metadata.durationSeconds = duration;
    } catch (e) { metadata.durationError = e.message; }

    // MIDI는 별도 파서
    const ext = this.getFileExtension(file.name);
    if (ext === '.mid' || ext === '.midi') {
      return this._parseMidi(file, formatInfo, metadata);
    }

    // music-metadata로 메타데이터 추출
    try {
      const mmb = await libLoader.loadMusicMetadataBrowser();
      const result = await mmb.parseBlob(file);
      if (result && result.common) {
        const c = result.common;
        if (c.title) metadata.title = c.title;
        if (c.artist) metadata.artist = c.artist;
        if (c.album) metadata.album = c.album;
        if (c.year) metadata.year = c.year;
        if (c.genre && c.genre.length > 0) metadata.genre = c.genre.join(', ');
        if (c.track && c.track.no) metadata.track = c.track.no + (c.track.of ? '/' + c.track.of : '');
        if (c.comment && c.comment.length > 0) metadata.comment = c.comment[0];
        if (c.lyrics && c.lyrics.length > 0) metadata.lyrics = c.lyrics[0];
        if (c.disk && c.disk.no) metadata.disk = c.disk.no + (c.disk.of ? '/' + c.disk.of : '');
        if (c.albumartist) metadata.albumArtist = c.albumartist;
        if (c.composer && c.composer.length > 0) metadata.composer = c.composer.join(', ');
      }
      if (result && result.format) {
        const f = result.format;
        if (f.codec) metadata.codec = f.codec;
        if (f.sampleRate) metadata.sampleRate = f.sampleRate + ' Hz';
        if (f.bitrate) metadata.bitrate = Math.round(f.bitrate / 1000) + ' kbps';
        if (f.numberOfChannels) metadata.channels = f.numberOfChannels;
        if (f.bitsPerSample) metadata.bitsPerSample = f.bitsPerSample;
        if (f.duration) {
          metadata.duration = this._formatDuration(f.duration);
          metadata.durationSeconds = f.duration;
        }
        if (f.container) metadata.container = f.container;
        if (f.lossless !== undefined) metadata.lossless = f.lossless;
      }

      let text = '[오디오 파일]\n포맷: ' + formatInfo.name + '\n용량: ' + metadata.size + '\n재생시간: ' + (metadata.duration || '알 수 없음') + '\n';
      if (metadata.codec) text += '코덱: ' + metadata.codec + '\n';
      if (metadata.bitrate) text += '비트레이트: ' + metadata.bitrate + '\n';
      if (metadata.sampleRate) text += '샘플레이트: ' + metadata.sampleRate + '\n';
      if (metadata.channels) text += '채널: ' + metadata.channels + '\n';
      if (metadata.title) text += '제목: ' + metadata.title + '\n';
      if (metadata.artist) text += '아티스트: ' + metadata.artist + '\n';
      if (metadata.album) text += '앨범: ' + metadata.album + '\n';
      if (metadata.albumArtist) text += '앨범 아티스트: ' + metadata.albumArtist + '\n';
      if (metadata.year) text += '연도: ' + metadata.year + '\n';
      if (metadata.genre) text += '장르: ' + metadata.genre + '\n';
      if (metadata.track) text += '트랙: ' + metadata.track + '\n';
      if (metadata.composer) text += '작곡가: ' + metadata.composer + '\n';
      if (metadata.comment) text += '코멘트: ' + metadata.comment + '\n';
      if (metadata.lyrics) text += '\n가사:\n' + metadata.lyrics + '\n';
      metadata.parserUsed = 'music-metadata';
      return this.createResult(formatInfo.name, formatInfo.category, text, metadata);
    } catch (e) {
      console.warn('music-metadata 실패:', e.message);
    }

    // 폴백
    return this.createResult(formatInfo.name, formatInfo.category,
      '[오디오 파일]\n포맷: ' + formatInfo.name + '\n용량: ' + metadata.size + '\n재생시간: ' + (metadata.duration || '알 수 없음'),
      metadata);
  }

  // --- MIDI: @tonejs/midi 라이브러리 ---
  async _parseMidi(file, info, metadata) {
    try {
      const MidiClass = await libLoader.loadToneMidi();
      const buffer = await this.readAsArrayBuffer(file);
      const midi = new MidiClass(buffer);
      if (midi) {
        metadata.name = midi.name || '';
        metadata.tracks = midi.tracks ? midi.tracks.length : 0;
        metadata.duration = midi.duration ? this._formatDuration(midi.duration) : '알 수 없음';
        metadata.durationSeconds = midi.duration || 0;
        metadata.ppq = midi.header ? midi.header.ppq : undefined;
        metadata.tempos = midi.header && midi.header.tempos ? midi.header.tempos.length : 0;
        metadata.timeSignatures = midi.header && midi.header.timeSignatures ? midi.header.timeSignatures.length : 0;

        let text = '[MIDI 파일]\n';
        if (midi.name) text += '이름: ' + midi.name + '\n';
        text += '트랙 수: ' + metadata.tracks + '\n';
        text += '재생시간: ' + metadata.duration + '\n';
        if (metadata.ppq) text += 'PPQ: ' + metadata.ppq + '\n';

        // 템포 정보
        if (midi.header && midi.header.tempos && midi.header.tempos.length > 0) {
          const tempo = midi.header.tempos[0];
          text += 'BPM: ' + Math.round(tempo.bpm) + '\n';
          metadata.bpm = Math.round(tempo.bpm);
        }

        // 박자 정보
        if (midi.header && midi.header.timeSignatures && midi.header.timeSignatures.length > 0) {
          const ts = midi.header.timeSignatures[0];
          text += '박자: ' + ts.timeSignature[0] + '/' + ts.timeSignature[1] + '\n';
        }

        // 트랙 상세
        if (midi.tracks) {
          for (let i = 0; i < midi.tracks.length; i++) {
            const track = midi.tracks[i];
            text += '\n트랙 ' + (i + 1);
            if (track.name) text += ' (' + track.name + ')';
            text += ': ';
            text += track.notes ? track.notes.length + '개 노트' : '0개 노트';
            if (track.instrument && track.instrument.name) text += ', 악기: ' + track.instrument.name;
            if (track.channel !== undefined) text += ', 채널: ' + track.channel;
            text += '\n';
          }
        }

        metadata.parserUsed = '@tonejs/midi';
        return this.createResult(info.name, info.category, text, metadata);
      }
    } catch (e) {
      console.warn('MIDI 파서 실패:', e.message);
    }
    return this.createResult(info.name, info.category,
      '[MIDI 파일]\n파일 크기: ' + metadata.size, metadata);
  }

  _getAudioDuration(file) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => { resolve(audio.duration); URL.revokeObjectURL(audio.src); };
      audio.onerror = () => { reject(new Error('오디오 메타데이터 로드 실패')); URL.revokeObjectURL(audio.src); };
      audio.src = URL.createObjectURL(file);
    });
  }

  _formatDuration(s) {
    if (!s || !isFinite(s)) return '알 수 없음';
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60);
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') : m + ':' + String(sec).padStart(2, '0');
  }
}
