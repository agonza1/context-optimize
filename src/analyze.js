export function analyzeJsonLines(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const parsed = [];
  let parseErrors = 0;

  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      parseErrors += 1;
    }
  }

  return {
    format: 'jsonlines',
    lineCount: lines.length,
    validJsonLines: parsed.length,
    parseErrors,
    objects: parsed,
  };
}

export function analyzeJson(text) {
  try {
    const obj = JSON.parse(text);

    function countKeys(o, depth = 0) {
      if (depth > 5) return 0;
      if (typeof o !== 'object' || o === null) return 0;

      if (Array.isArray(o)) {
        return o.length + o.reduce((sum, item) => sum + countKeys(item, depth + 1), 0);
      }

      return Object.keys(o).length + Object.values(o).reduce((sum, v) => sum + countKeys(v, depth + 1), 0);
    }

    return {
      format: 'json',
      parseError: null,
      keyCount: countKeys(obj),
      arrayDepth: detectArrayDepth(obj),
      summary: summarizeJsonStructure(obj),
    };
  } catch (e) {
    return {
      format: 'json',
      parseError: String(e),
      keyCount: 0,
    };
  }
}

export function analyzeGrepOutput(text) {
  const lines = text.split(/\r?\n/).filter((l) => l);
  const byFile = {};

  for (const line of lines) {
    const match = line.match(/^([^:]+):(.*)$/);
    if (match) {
      const [, file, content] = match;
      if (!byFile[file]) byFile[file] = [];
      byFile[file].push(content);
    }
  }

  const files = Object.keys(byFile);
  const uniqueMatches = new Set(lines).size;

  return {
    format: 'grep',
    totalLines: lines.length,
    uniqueMatches,
    files: files.length,
    fileBreakdown: Object.fromEntries(Object.entries(byFile).map(([f, matches]) => [f, matches.length])),
  };
}

export function analyzeErrorLog(text) {
  const lines = text.split(/\r?\n/);
  const errors = [];
  const warnings = [];
  const stackTraces = [];

  let currentStack = [];

  for (const line of lines) {
    if (/\[ERROR\]|error|failed|fatal|exception|\berror:/i.test(line)) {
      if (currentStack.length) {
        stackTraces.push(currentStack.join('\n'));
        currentStack = [];
      }
      errors.push(line);
    } else if (/\[WARNING\]|\bwarn|deprecated/i.test(line)) {
      if (currentStack.length) {
        stackTraces.push(currentStack.join('\n'));
        currentStack = [];
      }
      warnings.push(line);
    } else if (/^\s+(at |in |from )/.test(line)) {
      currentStack.push(line);
    }
  }

  if (currentStack.length) {
    stackTraces.push(currentStack.join('\n'));
  }

  return {
    format: 'error-log',
    totalLines: lines.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    stackTraceCount: stackTraces.length,
    errors: errors.slice(0, 5),
    warnings: warnings.slice(0, 5),
    snippets: {
      firstError: errors.length ? errors[0] : null,
      lastError: errors.length ? errors[errors.length - 1] : null,
    },
  };
}

export function analyzeTestOutput(text) {
  const lines = text.split(/\r?\n/);
  let passing = 0;
  let failing = 0;
  let skipped = 0;
  const failures = [];

  for (const line of lines) {
    if (/✔|passed|OK|\bpass\b/i.test(line)) passing += 1;
    if (/✖|✕|failed|FAIL|\bfail\b/i.test(line)) {
      failing += 1;
      if (failures.length < 10) failures.push(line);
    }
    if (/skipped|skip|pending/i.test(line)) skipped += 1;
  }

  return {
    format: 'test-output',
    totalLines: lines.length,
    passing,
    failing,
    skipped,
    summary: `${passing} pass, ${failing} fail, ${skipped} skipped`,
    failingTests: failures,
  };
}

export function guessFormat(text) {
  const sample = text.slice(0, 500);
  const firstLine = sample.split('\n')[0];

  if (sample.includes('---') || /^#+ /.test(sample)) return 'markdown';
  if (/\[ERROR\]|\[WARNING\]|error|failed|fatal|exception/i.test(sample)) return 'error-log';
  if (/✔|✖|passed|failed/i.test(sample)) return 'test-output';
  if (firstLine.includes(':') && !firstLine.includes('{') && !sample.includes('\n\n')) return 'grep';
  if (/\{.*\}/.test(sample) && /[\[\]{}]/.test(sample)) return 'json';

  return 'text';
}

export function analyzeAuto(text) {
  const format = guessFormat(text);

  switch (format) {
    case 'json':
      return analyzeJson(text);
    case 'grep':
      return analyzeGrepOutput(text);
    case 'error-log':
      return analyzeErrorLog(text);
    case 'test-output':
      return analyzeTestOutput(text);
    default:
      return { format: 'text', lineCount: text.split(/\r?\n/).length };
  }
}

function detectArrayDepth(obj, depth = 0) {
  if (depth > 10) return depth;
  if (!Array.isArray(obj)) return depth;
  if (!obj.length) return depth;
  return Math.max(depth + 1, detectArrayDepth(obj[0], depth + 1));
}

function summarizeJsonStructure(obj) {
  if (Array.isArray(obj)) {
    return `Array of ${obj.length} items`;
  }
  const keys = Object.keys(obj);
  return `Object with keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
}
