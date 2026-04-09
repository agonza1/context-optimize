import {
  initSchema,
  insertArtifact,
  openDatabase,
  pruneExpiredArtifacts,
  workspaceIdFor,
} from './storage.js';

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

export function summarizeText(text) {
  const lines = (text || '').split(/\r?\n/);
  let errorCount = 0;
  let warningCount = 0;
  let failCount = 0;

  for (const line of lines) {
    if (/\berror\b/i.test(line)) errorCount += 1;
    if (/\bwarning\b|\bwarn\b/i.test(line)) warningCount += 1;
    if (/\bfail\b|\bfailed\b/i.test(line)) failCount += 1;
  }

  const signals = [];
  if (errorCount) signals.push(`${errorCount} error lines`);
  if (warningCount) signals.push(`${warningCount} warning lines`);
  if (failCount) signals.push(`${failCount} fail lines`);

  if (!signals.length) {
    return 'Large tool output intercepted due to size threshold.';
  }

  return `Large tool output intercepted. Detected ${signals.join(', ')}.`;
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
