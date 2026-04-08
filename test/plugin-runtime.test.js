import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import plugin, { pluginId, resolvePluginConfig, registerContextOptimizePlugin } from '../src/plugin/runtime.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'context-optimize-runtime-'));
}

test('plugin metadata exposes native OpenClaw plugin definition', () => {
  assert.equal(plugin.id, 'context-optimize');
  assert.equal(pluginId, 'context-optimize');
  assert.equal(plugin.name, 'context-optimize');
  assert.equal(typeof plugin.register, 'function');
});

test('resolvePluginConfig maps pluginConfig to runtime options', () => {
  const cfg = resolvePluginConfig({
    pluginConfig: {
      enabled: true,
      stateDir: '/tmp/context-optimize',
      ttlHours: 48,
      byteThreshold: 1234,
      lineThreshold: 55,
      source: 'gh issue list',
    },
  });

  assert.deepEqual(cfg, {
    enabled: true,
    storageRootDir: '/tmp/context-optimize',
    ttlHours: 48,
    maxBytes: 1234,
    maxLines: 55,
    source: 'gh issue list',
  });
});

test('registerContextOptimizePlugin wires tool_result_persist hook via api.on', async () => {
  const calls = [];
  const tempDir = makeTempDir();

  const api = {
    pluginConfig: {
      stateDir: tempDir,
      byteThreshold: 32,
      lineThreshold: 3,
    },
    on(hookName, handler, opts) {
      calls.push({ hookName, handler, opts });
    },
    logger: {
      info() {},
    },
  };

  registerContextOptimizePlugin(api);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].hookName, 'tool_result_persist');

  const result = calls[0].handler(
    {
      toolName: 'exec',
      message: {
        content: [{ type: 'text', text: 'error\nerror\nerror\nerror\n' }],
      },
    },
    {
      sessionKey: 'runtime-session',
      workspacePath: '/demo/workspace',
    },
  );

  assert.ok(result?.message);
  assert.match(result.message.content[0].text, /context-optimize intercepted tool output/);
});
