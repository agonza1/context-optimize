import createPlugin from './index.js';

export function loadContextOptimizePlugin(options = {}) {
  const config = {
    storageRootDir: options.storageRootDir || process.env.CONTEXT_OPTIMIZE_STORAGE || '~/.openclaw/context-optimize',
    maxBytes: options.maxBytes ?? parseInt(process.env.CONTEXT_OPTIMIZE_MAX_BYTES || '32768'),
    maxLines: options.maxLines ?? parseInt(process.env.CONTEXT_OPTIMIZE_MAX_LINES || '800'),
    source: options.source || 'exec',
    ttlHours: options.ttlHours ?? parseInt(process.env.CONTEXT_OPTIMIZE_TTL_HOURS || '24'),
  };

  if (process.env.CONTEXT_OPTIMIZE_DEBUG) {
    console.log('[context-optimize] loading with config:', config);
  }

  return createPlugin(config);
}

export default loadContextOptimizePlugin;
