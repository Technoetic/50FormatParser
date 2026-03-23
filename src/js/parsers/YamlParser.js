class YamlParser extends BaseParser {
  async parse(file, formatInfo) {
    const text = await this.readAsText(file);
    const ext = this.getFileExtension(file.name);

    if (ext === '.toml') return this._parseToml(text, formatInfo);
    try {
      const jsyaml = await libLoader.loadJsYaml();
      return this._parseYamlWithLib(jsyaml, text, formatInfo);
    } catch (e) {
      console.warn('js-yaml 로드 실패, 폴백:', e.message);
      return this._parseYamlFallback(text, formatInfo);
    }
  }

  _parseYamlWithLib(jsyaml, text, info) {
    try {
      const data = jsyaml.load(text);
      const type = Array.isArray(data) ? 'array' : typeof data;
      return this.createResult(info.name, info.category, text, {
        format: 'YAML (js-yaml)',
        type,
        keys: type === 'object' && data ? Object.keys(data) : undefined,
        length: type === 'array' ? data.length : undefined,
        parsed: data
      });
    } catch (e) {
      return this.createResult(info.name, info.category, text, { format: 'YAML', error: e.message });
    }
  }

  _parseYamlFallback(text, info) {
    try {
      const data = this._yamlParse(text);
      const type = Array.isArray(data) ? 'array' : typeof data;
      return this.createResult(info.name, info.category, text, {
        format: 'YAML (폴백)',
        type,
        keys: type === 'object' ? Object.keys(data) : undefined,
        length: type === 'array' ? data.length : undefined,
        parsed: data
      });
    } catch (e) {
      return this.createResult(info.name, info.category, text, { error: e.message });
    }
  }

  _yamlParse(text) {
    const result = {};
    const stack = [{ obj: result, indent: -1 }];
    const lines = text.split('\n');
    for (const line of lines) {
      const stripped = line.replace(/\r$/, '');
      if (!stripped.trim() || stripped.trim().startsWith('#')) continue;
      if (stripped.trim() === '---' || stripped.trim() === '...') continue;
      const indent = stripped.search(/\S/);
      const content = stripped.trim();
      const kvMatch = content.match(/^([^:]+):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let val = kvMatch[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val === 'null' || val === '~') val = null;
        else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
        else if (/^-?\d+\.\d+$/.test(val)) val = parseFloat(val);
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        stack[stack.length - 1].obj[key] = val;
        continue;
      }
      const keyOnly = content.match(/^([^:]+):\s*$/);
      if (keyOnly) {
        const key = keyOnly[1].trim();
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        const newObj = {};
        stack[stack.length - 1].obj[key] = newObj;
        stack.push({ obj: newObj, indent });
        continue;
      }
      if (content.startsWith('- ')) {
        const val = content.substring(2).trim();
        const parent = stack[stack.length - 1].obj;
        const lastKey = Object.keys(parent).pop();
        if (lastKey && !Array.isArray(parent[lastKey])) parent[lastKey] = [];
        if (lastKey && Array.isArray(parent[lastKey])) parent[lastKey].push(val);
      }
    }
    return result;
  }

  async _parseToml(text, info) {
    try {
      const smolToml = await libLoader.loadSmolToml();
      const data = smolToml.parse(text);
      return this.createResult(info.name, info.category, text, {
        format: 'TOML (smol-toml)',
        type: 'object',
        sections: Object.keys(data),
        parsed: data
      });
    } catch (e) {
      console.warn('smol-toml 로드 실패, 폴백:', e.message);
      return this._parseTomlFallback(text, info);
    }
  }

  _parseTomlFallback(text, info) {
    try {
      const data = this._tomlParse(text);
      return this.createResult(info.name, info.category, text, {
        format: 'TOML (폴백)',
        type: 'object',
        sections: Object.keys(data),
        parsed: data
      });
    } catch (e) {
      return this.createResult(info.name, info.category, text, { error: e.message });
    }
  }

  _tomlParse(text) {
    const result = {};
    let currentSection = result;
    text.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        const key = sectionMatch[1].trim();
        result[key] = result[key] || {};
        currentSection = result[key];
        return;
      }
      const kvMatch = line.match(/^([^=]+)=\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let val = kvMatch[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
        else if (/^-?\d+\.\d+$/.test(val)) val = parseFloat(val);
        currentSection[key] = val;
      }
    });
    return result;
  }
}
