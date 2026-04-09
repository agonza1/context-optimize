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
    interceptedTools: ['exec', 'read', 'process', 'web_fetch', 'browser', 'memory_search', 'memory_get', 'message', 'grep', 'glob', 'list_dir', 'sessions_list'],
    source: 'gh issue list',
  });
});

test('registerContextOptimizePlugin wires hook and memory supplements', () => {
  const hookCalls = [];
  const corpusSupplements = [];
  const promptSupplements = [];
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
    registerMemoryCorpusSupplement(supplement) {
      corpusSupplements.push(supplement);
    },
    registerMemoryPromptSupplement(builder) {
      promptSupplements.push(builder);
    },
    logger: {
      info() {},
    },
  };

  registerContextOptimizePlugin(api);

  assert.equal(hookCalls.length, 1);
  assert.equal(hookCalls[0].hookName, 'tool_result_persist');

  assert.equal(corpusSupplements.length, 1);
  assert.equal(typeof corpusSupplements[0].search, 'function');
  assert.equal(typeof corpusSupplements[0].get, 'function');

  assert.equal(promptSupplements.length, 1);
  assert.equal(typeof promptSupplements[0], 'function');

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
  assert.match(result.message.content[0].text, /memory_get/);
});

test('memory corpus supplement search and get work against stored artifacts', async () => {
  const tempDir = makeTempDir();
  let corpusSupplement = null;
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
    registerMemoryCorpusSupplement(supplement) {
      corpusSupplement = supplement;
    },
    registerMemoryPromptSupplement() {},
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

  const getResult = await corpusSupplement.get({ lookup: artifactId });
  assert.ok(getResult);
  assert.equal(getResult.corpus, 'artifacts');
  assert.equal(getResult.id, artifactId);
  assert.ok(getResult.content.includes('line1'));
  assert.ok(getResult.content.includes('error on line3'));

  const getSlice = await corpusSupplement.get({ lookup: artifactId, fromLine: 3, lineCount: 1 });
  assert.ok(getSlice);
  assert.ok(getSlice.content.includes('error on line3'));
  assert.equal(getSlice.fromLine, 3);

  const searchResults = await corpusSupplement.search({ query: 'error' });
  assert.ok(searchResults.length > 0);
  assert.equal(searchResults[0].corpus, 'artifacts');
  assert.equal(searchResults[0].id, artifactId);

  const emptySearch = await corpusSupplement.search({ query: 'nonexistent_xyz_abc' });
  assert.equal(emptySearch.length, 0);

  const missingGet = await corpusSupplement.get({ lookup: 'art_does_not_exist' });
  assert.equal(missingGet, null);
});

test('memory prompt supplement returns guidance when artifacts exist', () => {
  const tempDir = makeTempDir();
  let promptBuilder = null;
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
    registerMemoryCorpusSupplement() {},
    registerMemoryPromptSupplement(builder) {
      promptBuilder = builder;
    },
    logger: {
      info() {},
    },
  };

  registerContextOptimizePlugin(api);

  const emptyResult = promptBuilder({ availableTools: new Set(['memory_search', 'memory_get']) });
  assert.deepEqual(emptyResult, []);

  hookHandler(
    {
      toolName: 'exec',
      message: {
        content: [{ type: 'text', text: 'error\nerror\nerror\nerror\n' }],
      },
    },
    { sessionKey: 'test-session', workspacePath: '/test' },
  );

  const withArtifacts = promptBuilder({ availableTools: new Set(['memory_search', 'memory_get']) });
  assert.ok(withArtifacts.length > 0);
  assert.ok(withArtifacts.some((line) => line.includes('memory_search')));

  const noTools = promptBuilder({ availableTools: new Set() });
  assert.deepEqual(noTools, []);
});
