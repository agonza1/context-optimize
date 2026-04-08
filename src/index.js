import {
  initSchema,
  insertArtifact,
  openDatabase,
  pruneExpiredArtifacts,
  workspaceIdFor,
} from './storage.js';

export const version = '0.1.0';

export const DEFAULT_MAX_BYTES = 32 * 1024;
export const DEFAULT_MAX_LINES = 800;

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

export function isExecToolMessage(message, overrideToolName) {
  if (overrideToolName === 'exec') return true;
  if (!message || typeof message !== 'object') return false;

  if (message.toolName === 'exec') return true;
  if (message.name === 'exec') return true;
  if (message.tool === 'exec') return true;

  const metaCandidates = [message.metadata, message.meta];
  for (const meta of metaCandidates) {
    if (!meta || typeof meta !== 'object') continue;
    if (meta.toolName === 'exec' || meta.name === 'exec' || meta.tool === 'exec') {
      return true;
    }
  }

  return false;
}

export function shouldInterceptExecText(text, options = {}) {
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

export function buildPlaceholderPayload({ artifactId, bytes, lines, source = 'exec', summary }) {
  const parts = [
    '[context-optimize intercepted tool output]',
    `artifactId: ${artifactId}`,
    'tool: exec',
    `source: ${source}`,
    `bytes: ${bytes}`,
    `lines: ${lines}`,
    `summary: ${summary || 'Large exec output stored locally.'}`,
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

export function summarizeExecText(text) {
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
    return 'Large exec output intercepted due to size threshold.';
  }

  return `Large exec output intercepted. Detected ${signals.join(', ')}.`;
}

export function interceptToolResultMessage(message, options = {}) {
  if (!isExecToolMessage(message, options.toolName)) {
    return { intercepted: false, message };
  }

  const text = extractTextFromContent(message.content);
  const decision = shouldInterceptExecText(text, options);

  if (!decision.intercept) {
    return { intercepted: false, message, stats: decision };
  }

  const artifactId = makeArtifactId();
  const summary = summarizeExecText(text);

  let persistedArtifact = null;
  if (options.storeArtifact) {
    persistedArtifact = options.storeArtifact({
      id: artifactId,
      workspaceId: workspaceIdFor(options.workspacePath || ''),
      workspacePath: options.workspacePath || null,
      sessionKey: options.sessionKey || null,
      toolName: 'exec',
      sourceLabel: options.source || 'exec',
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
    bytes: decision.bytes,
    lines: decision.lines,
    source: options.source || 'exec',
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
