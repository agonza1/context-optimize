import path from 'node:path';
import { createPlugin, createStore, DEFAULT_INTERCEPTED_TOOLS } from '../index.js';
import { createArtifactCorpusSupplement, createArtifactPromptSupplement } from './memory-supplement.js';

function definePluginEntry(entry) {
  return {
    ...entry,
    get configSchema() {
      return {};
    },
  };
}

export const pluginId = 'context-optimize';

export function resolvePluginConfig(api) {
  const pluginConfig = api?.pluginConfig || {};
  const rootDir = api?.rootDir || process.cwd();
  const stateDir = pluginConfig.stateDir || path.join(rootDir, '.context-optimize');

  return {
    enabled: pluginConfig.enabled !== false,
    storageRootDir: stateDir,
    ttlHours: Number(pluginConfig.ttlHours ?? 24),
    maxBytes: Number(pluginConfig.byteThreshold ?? 32 * 1024),
    maxLines: Number(pluginConfig.lineThreshold ?? 800),
    interceptedTools: pluginConfig.tools || DEFAULT_INTERCEPTED_TOOLS,
    source: pluginConfig.source || null,
  };
}

export function registerContextOptimizePlugin(api) {
  const cfg = resolvePluginConfig(api);
  if (!cfg.enabled) {
    api.logger?.info?.('[context-optimize] plugin disabled by config');
    return;
  }

  api.logger?.info?.(`[context-optimize] register called, stateDir=${cfg.storageRootDir}, maxBytes=${cfg.maxBytes}, maxLines=${cfg.maxLines}`);

  const store = createStore(cfg.storageRootDir);
  const plugin = createPlugin({ ...cfg, store });

  api.registerMemoryCorpusSupplement(createArtifactCorpusSupplement(store));
  api.registerMemoryPromptSupplement(createArtifactPromptSupplement(store));
  api.logger?.info?.('[context-optimize] registered memory corpus + prompt supplements');

  api.on(
    'tool_result_persist',
    (event, ctx) => {
      const toolName = event?.toolName || event?.message?.toolName || 'unknown';
      api.logger?.info?.(`[context-optimize] tool_result_persist hook fired, tool=${toolName}, session=${ctx?.sessionKey || 'unknown'}`);

      const result = plugin.tool_result_persist({
        message: event.message,
        toolName,
        sessionKey: ctx?.sessionKey,
        workspacePath: ctx?.workspacePath || process.cwd(),
      });

      if (!result?.message) {
        api.logger?.info?.('[context-optimize] hook pass-through, no rewrite');
        return;
      }

      api.logger?.info?.('[context-optimize] hook rewrote persisted tool result');
      return { message: result.message };
    },
    {
      priority: 10,
    },
  );
}

const plugin = definePluginEntry({
  id: pluginId,
  name: 'context-optimize',
  description: 'Intercept large exec tool outputs before they bloat model context, store them locally, and inject summary-first replacement payloads.',
  kind: 'tool',
  register(api) {
    registerContextOptimizePlugin(api);
  },
});

export default plugin;
