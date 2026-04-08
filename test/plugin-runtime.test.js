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

test('registerContextOptimizePlugin wires hook and registers retrieval tool', () => {
  const hookCalls = [];
  const toolCalls = [];
  const tempDir = makeTempDir();

  const api = {
    pluginConfig: {
      stateDir: tempDir,
      byteThreshold: 32,
      lineThreshold: 3,
    },
    on(hookName, handler, opts) {
      hookCalls.push({ hookName, handler, opts });
    },
    registerTool(tool, opts) {
      toolCalls.push({ tool, opts });
    },
    logger: {
      info() {},
    },
  };

  registerContextOptimizePlugin(api);

  assert.equal(hookCalls.length, 1);
  assert.equal(hookCalls[0].hookName, 'tool_result_persist');

  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].tool.name, 'artifact_retrieve');
  assert.equal(toolCalls[0].opts.optional, true);
  assert.equal(typeof toolCalls[0].tool.execute, 'function');

  const result = hookCalls[0].handler(
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
  assert.match(result.message.content[0].text, /artifact_retrieve/);
});

test('artifact_retrieve tool can fetch stored artifacts', async () => {
  const tempDir = makeTempDir();
  let registeredTool = null;
  let hookHandler = null;

  const api = {
    pluginConfig: {
      stateDir: tempDir,
      byteThreshold: 32,
      lineThreshold: 3,
    },
    on(_hookName, handler) {
      hookHandler = handler;
    },
    registerTool(tool) {
      registeredTool = tool;
    },
    logger: {
      info() {},
    },
  };

  registerContextOptimizePlugin(api);

  const hookResult = hookHandler(
    {
      toolName: 'exec',
      message: {
        content: [{ type: 'text', text: 'line1\nline2\nerror on line3\nline4\n' }],
      },
    },
    { sessionKey: 'test-session', workspacePath: '/test' },
  );

  const artifactIdMatch = hookResult.message.content[0].text.match(/artifactId: (art_\w+)/);
  assert.ok(artifactIdMatch, 'placeholder should contain artifactId');
  const artifactId = artifactIdMatch[1];

  const fetchResult = await registeredTool.execute('call-1', { artifactId });
  assert.ok(fetchResult.content[0].text.includes('line1'));
  assert.ok(fetchResult.content[0].text.includes('error on line3'));
  assert.equal(fetchResult.details.found, true);

  const keywordResult = await registeredTool.execute('call-2', { artifactId, keyword: 'error' });
  assert.ok(keywordResult.content[0].text.includes('error on line3'));

  const searchResult = await registeredTool.execute('call-3', { search: 'error' });
  assert.ok(searchResult.content[0].text.includes(artifactId));
});
