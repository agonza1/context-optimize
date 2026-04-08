import path from 'node:path';
import { createPlugin } from '../index.js';

export const pluginId = 'context-optimize';

export function resolvePluginConfig(api) {
  const pluginConfig = api?.pluginConfig || {};
  const stateDir = pluginConfig.stateDir || path.join(process.cwd(), '.context-optimize');

  return {
    enabled: pluginConfig.enabled !== false,
    storageRootDir: stateDir,
    ttlHours: Number(pluginConfig.ttlHours ?? 24),
    maxBytes: Number(pluginConfig.byteThreshold ?? 32 * 1024),
    maxLines: Number(pluginConfig.lineThreshold ?? 800),
    source: pluginConfig.source || 'exec',
  };
}

export function registerContextOptimizePlugin(api) {
  const cfg = resolvePluginConfig(api);
  if (!cfg.enabled) {
    api.logger?.info?.('[context-optimize] plugin disabled by config');
    return;
  }

  const plugin = createPlugin(cfg);

  api.registerHook(
    'tool_result_persist',
    async (event, ctx) => {
      const result = await plugin.tool_result_persist({
        message: event.message,
        sessionKey: ctx?.sessionKey,
        workspacePath: ctx?.workspacePath || process.cwd(),
      });

      if (!result?.message) return;
      return { message: result.message };
    },
    {
      name: 'context-optimize tool result persistence hook',
      description: 'Intercept large exec tool outputs, store raw artifacts locally, and replace them with summary payloads.',
    },
  );
}

const plugin = {
  id: pluginId,
  name: 'context-optimize',
  description: 'Intercept large exec tool outputs before they bloat model context, store them locally, and inject summary-first replacement payloads.',
  version: '0.1.0',
  register(api) {
    registerContextOptimizePlugin(api);
  },
};

export default plugin;
