import {
  initSchema,
  insertArtifact,
  openDatabase,
  pruneExpiredArtifacts,
  workspaceIdFor,
} from './storage.js';
import { analyzeAuto } from './analyze.js';

export const version = '0.1.0';

export const DEFAULT_MAX_BYTES = 4 * 1024;
export const DEFAULT_MAX_LINES = 100;

export function extractTextFromContent(content) {
  if (!Array.isArray(content)) return '';

  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;

    if (typeof block.text === 'string') {
      parts.push(block.text);
      continue;
    }

    if (block.type === 'text' && typeof block.value === 'string') {
      parts.push(block.value);
      continue;
    }

    if (typeof block.content === 'string') {
      parts.push(block.content);
    }
  }

  return parts.join('\n').trim();
}

export function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function countBytes(text) {
  return Buffer.byteLength(text || '', 'utf8');
}

export const DEFAULT_INTERCEPTED_TOOLS = [
  'exec',
  'read',
  'process',
  'web_fetch',
  'browser',
  'memory_search',
  'memory_get',
  'message',
  'grep',
  'glob',
  'list_dir',
  'sessions_list',
];

export function resolveToolName(message, overrideToolName) {
  if (overrideToolName) return overrideToolName;
  if (!message || typeof message !== 'object') return null;

  if (message.toolName) return message.toolName;
  if (message.name) return message.name;
  if (message.tool) return message.tool;

  const metaCandidates = [message.metadata, message.meta];
  for (const meta of metaCandidates) {
    if (!meta || typeof meta !== 'object') continue;
    if (meta.toolName) return meta.toolName;
    if (meta.name) return meta.name;
    if (meta.tool) return meta.tool;
  }

  return null;
}

export function isInterceptableToolMessage(message, overrideToolName, interceptedTools) {
  const tools = interceptedTools || DEFAULT_INTERCEPTED_TOOLS;
  const resolved = resolveToolName(message, overrideToolName);
  return resolved ? tools.includes(resolved) : false;
}

export function shouldInterceptText(text, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

  const bytes = countBytes(text);
  const lines = countLines(text);

  return {
    intercept: bytes >= maxBytes || lines >= maxLines,
    bytes,
    lines,
    maxBytes,
    maxLines,
  };
}

export function buildPlaceholderPayload({ artifactId, toolName, bytes, lines, source, summary }) {
  const label = toolName || source || 'tool';
  const parts = [
    '[context-optimize intercepted tool output]',
    `artifactId: ${artifactId}`,
    `tool: ${label}`,
    `source: ${source || label}`,
    `bytes: ${bytes}`,
    `lines: ${lines}`,
    `summary: ${summary || 'Large tool output stored locally.'}`,
    `retrieval: Use memory_get with corpus="artifacts" lookup="${artifactId}" to fetch raw content. Use memory_search with corpus="artifacts" to find artifacts by content.`,
  ];

  return parts.join('\n');
}

export function replaceMessageTextContent(message, text) {
  const next = {
    ...message,
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };

  return next;
}

export function makeArtifactId() {
  return `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatAnalysisSummary(analysis) {
  if (!analysis || !analysis.format) return null;

  switch (analysis.format) {
    case 'grep': {
      const parts = [`${analysis.totalLines} matches across ${analysis.files} files`];
      const topFiles = Object.entries(analysis.fileBreakdown || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([f, n]) => `${f} (${n})`);
      if (topFiles.length) parts.push(`top: ${topFiles.join(', ')}`);
      return `Grep output. ${parts.join('. ')}.`;
    }
    case 'error-log': {
      const parts = [];
      if (analysis.errorCount) parts.push(`${analysis.errorCount} errors`);
      if (analysis.warningCount) parts.push(`${analysis.warningCount} warnings`);
      if (analysis.stackTraceCount) parts.push(`${analysis.stackTraceCount} stack traces`);
      const detail = parts.length ? parts.join(', ') : 'no errors detected';
      let msg = `Error log (${analysis.totalLines} lines). ${detail}.`;
      if (analysis.snippets?.firstError) msg += ` First: ${analysis.snippets.firstError.slice(0, 80)}`;
      return msg;
    }
    case 'test-output':
      return `Test output. ${analysis.summary || `${analysis.passing} pass, ${analysis.failing} fail`}.`;
    case 'json':
      return `JSON. ${analysis.summary || `${analysis.keyCount} keys`}.`;
    case 'jsonlines':
      return `JSONL. ${analysis.validJsonLines} valid lines, ${analysis.parseErrors} parse errors.`;
    default:
      return null;
  }
}

export function summarizeText(text) {
  const analysis = analyzeAuto(text || '');
  const formatted = formatAnalysisSummary(analysis);
  if (formatted) return formatted;

  const lines = (text || '').split(/\r?\n/);
  const lineCount = lines.length;
  const preview = lines.slice(0, 3).join(' ').slice(0, 120);
  return `Text output (${lineCount} lines). Preview: ${preview}`;
}

export function interceptToolResultMessage(message, options = {}) {
  const toolName = resolveToolName(message, options.toolName);

  if (!isInterceptableToolMessage(message, options.toolName, options.interceptedTools)) {
    return { intercepted: false, message };
  }

  const text = extractTextFromContent(message.content);
  const decision = shouldInterceptText(text, options);

  if (!decision.intercept) {
    return { intercepted: false, message, stats: decision };
  }

  const artifactId = makeArtifactId();
  const summary = summarizeText(text);

  let persistedArtifact = null;
  if (options.storeArtifact) {
    persistedArtifact = options.storeArtifact({
      id: artifactId,
      workspaceId: workspaceIdFor(options.workspacePath || ''),
      workspacePath: options.workspacePath || null,
      sessionKey: options.sessionKey || null,
      toolName: toolName || 'unknown',
      sourceLabel: options.source || toolName || 'unknown',
      commandText: options.commandText || null,
      content: text,
      summary,
      bytes: decision.bytes,
      lines: decision.lines,
      metadataJson: options.metadataJson || null,
      ttlHours: options.ttlHours,
    });
  }

  const payload = buildPlaceholderPayload({
    artifactId,
    toolName,
    bytes: decision.bytes,
    lines: decision.lines,
    source: options.source || toolName,
    summary,
  });

  const nextMessage = replaceMessageTextContent(message, payload);

  return {
    intercepted: true,
    artifactId,
    artifact: persistedArtifact,
    stats: decision,
    summary,
    originalText: text,
    message: nextMessage,
  };
}

export function createStore(rootDir) {
  const db = openDatabase(rootDir);
  initSchema(db);
  pruneExpiredArtifacts(db);

  return {
    db,
    insertArtifact(artifact) {
      pruneExpiredArtifacts(db);
      return insertArtifact(db, artifact);
    },
  };
}

export function createPlugin(options = {}) {
  const store = options.store || (options.storageRootDir ? createStore(options.storageRootDir) : null);

  return {
    name: 'context-optimize',

    tool_result_persist({ message, toolName, sessionKey, workspacePath }) {
      try {
        const result = interceptToolResultMessage(message, {
          ...options,
          toolName: toolName || options.toolName,
          sessionKey: options.sessionKey || sessionKey,
          workspacePath: options.workspacePath || workspacePath,
          storeArtifact: store ? (artifact) => store.insertArtifact(artifact) : options.storeArtifact,
        });
        if (!result.intercepted) {
          return {};
        }

        return { message: result.message };
      } catch {
        return {};
      }
    },
  };
}

export default createPlugin;
