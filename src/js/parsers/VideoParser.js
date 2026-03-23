class VideoParser extends BaseParser {
  async parse(file, formatInfo) {
    const metadata = { format: formatInfo.name, type: file.type, size: this.formatFileSize(file.size) };

    // 브라우저 <video> 태그로 기본 정보
    try {
      const info = await this._getVideoInfo(file);
      Object.assign(metadata, info);
    } catch (e) { metadata.videoError = e.message; }

    const ext = this.getFileExtension(file.name);

    // MP4/MOV/M4V: MP4Box.js로 상세 메타데이터
    if (['.mp4', '.m4v', '.mov', '.m4a', '.3gp'].includes(ext)) {
      try {
        const MP4Box = await libLoader.loadMP4Box();
        const mp4Info = await this._parseMP4Box(MP4Box, file);
        if (mp4Info) {
          Object.assign(metadata, mp4Info);
          metadata.parserUsed = 'MP4Box.js';
          let text = '[비디오 파일]\n포맷: ' + formatInfo.name + '\n용량: ' + metadata.size + '\n';
          text += '재생시간: ' + (metadata.duration || '알 수 없음') + '\n';
          text += '해상도: ' + (metadata.width ? metadata.width + 'x' + metadata.height : '알 수 없음') + '\n';
          if (mp4Info.brands) text += '브랜드: ' + mp4Info.brands + '\n';
          if (mp4Info.timescale) text += '타임스케일: ' + mp4Info.timescale + '\n';
          if (mp4Info.tracks && mp4Info.tracks.length > 0) {
            text += '\n트랙 (' + mp4Info.tracks.length + '개):\n';
            mp4Info.tracks.forEach((t, i) => {
              text += (i + 1) + '. ' + t.type + ' - ' + t.codec;
              if (t.width) text += ' (' + t.width + 'x' + t.height + ')';
              if (t.audio_sample_rate) text += ' (' + t.audio_sample_rate + 'Hz, ' + t.channel_count + 'ch)';
              if (t.bitrate) text += ' ' + Math.round(t.bitrate / 1000) + 'kbps';
              text += '\n';
            });
          }
          return this.createResult(formatInfo.name, formatInfo.category, text, metadata);
        }
      } catch (e) {
        console.warn('MP4Box 파싱 실패:', e.message);
      }
    }

    // 폴백: 기본 정보
    return this.createResult(formatInfo.name, formatInfo.category,
      '[비디오 파일]\n포맷: ' + formatInfo.name + '\n용량: ' + metadata.size +
      '\n재생시간: ' + (metadata.duration || '알 수 없음') +
      '\n해상도: ' + (metadata.width ? metadata.width + 'x' + metadata.height : '알 수 없음'),
      metadata);
  }

  _parseMP4Box(MP4Box, file) {
    return new Promise((resolve, reject) => {
      const mp4boxFile = MP4Box.createFile();
      let resolved = false;

      mp4boxFile.onReady = function(info) {
        if (resolved) return;
        resolved = true;
        const result = {
          brands: info.brands ? info.brands.join(', ') : '',
          timescale: info.timescale,
          isFragmented: info.isFragmented,
          isProgressive: info.isProgressive
        };
        if (info.duration && info.timescale) {
          result.mp4Duration = (info.duration / info.timescale).toFixed(2) + 's';
        }
        if (info.tracks && info.tracks.length > 0) {
          result.tracks = info.tracks.map(t => ({
            type: t.type,
            codec: t.codec,
            width: t.video ? t.video.width : undefined,
            height: t.video ? t.video.height : undefined,
            audio_sample_rate: t.audio ? t.audio.sample_rate : undefined,
            channel_count: t.audio ? t.audio.channel_count : undefined,
            bitrate: t.bitrate,
            duration: t.duration,
            nb_samples: t.nb_samples,
            language: t.language
          }));
        }
        resolve(result);
      };

      mp4boxFile.onError = function(e) {
        if (!resolved) { resolved = true; reject(new Error(e)); }
      };

      const reader = new FileReader();
      reader.onload = function() {
        const buf = reader.result;
        buf.fileStart = 0;
        mp4boxFile.appendBuffer(buf);
        mp4boxFile.flush();
        // onReady가 호출되지 않은 경우 타임아웃
        setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 2000);
      };
      reader.onerror = function() {
        if (!resolved) { resolved = true; reject(new Error('파일 읽기 실패')); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  _getVideoInfo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({ duration: this._formatDuration(video.duration), durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => { reject(new Error('비디오 메타데이터 로드 실패')); URL.revokeObjectURL(video.src); };
      video.src = URL.createObjectURL(file);
    });
  }

  _formatDuration(s) {
    if (!s || !isFinite(s)) return '알 수 없음';
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60);
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') : m + ':' + String(sec).padStart(2, '0');
  }
}
