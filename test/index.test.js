import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlugin,
  createStore,
  extractTextFromContent,
  interceptToolResultMessage,
  shouldInterceptText,
} from '../src/index.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'context-optimize-test-'));
}

test('extractTextFromContent joins text blocks', () => {
  const text = extractTextFromContent([
    { type: 'text', text: 'hello' },
    { type: 'text', text: 'world' },
  ]);

  assert.equal(text, 'hello\nworld');
});

test('shouldInterceptText stays false for small output', () => {
  const result = shouldInterceptText('small output');
  assert.equal(result.intercept, false);
});

test('interceptToolResultMessage skips tools not in the intercepted list', () => {
  const message = {
    toolName: 'web_search',
    content: [{ type: 'text', text: 'x'.repeat(40000) }],
  };

  const result = interceptToolResultMessage(message);
  assert.equal(result.intercepted, false);
});

test('interceptToolResultMessage rewrites bulky exec output', () => {
  const message = {
    toolName: 'exec',
    content: [{ type: 'text', text: `${'error line\n'.repeat(900)}` }],
  };

  const result = interceptToolResultMessage(message);
  assert.equal(result.intercepted, true);
  assert.match(result.message.content[0].text, /context-optimize intercepted tool output/);
  assert.match(result.message.content[0].text, /tool: exec/);
  assert.match(result.message.content[0].text, /artifactId:/);
  assert.match(result.message.content[0].text, /error lines/);
});

test('interceptToolResultMessage rewrites bulky read output', () => {
  const message = {
    toolName: 'read',
    content: [{ type: 'text', text: 'x'.repeat(40000) }],
  };

  const result = interceptToolResultMessage(message);
  assert.equal(result.intercepted, true);
  assert.match(result.message.content[0].text, /tool: read/);
});

test('createStore persists intercepted artifacts', () => {
  const dir = makeTempDir();
  const store = createStore(dir);

  const message = {
    toolName: 'exec',
    content: [{ type: 'text', text: 'warning\n'.repeat(900) }],
  };

  const result = interceptToolResultMessage(message, {
    workspacePath: '/tmp/workspace',
    sessionKey: 'session-1',
    source: 'gh issue list --json',
    storeArtifact: (artifact) => store.insertArtifact(artifact),
  });

  assert.equal(result.intercepted, true);
  assert.ok(result.artifact);

  const row = store.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(result.artifactId);
  assert.equal(row.tool_name, 'exec');
  assert.equal(row.session_key, 'session-1');
  assert.match(row.content, /warning/);
});

test('plugin tool_result_persist fails open and returns rewritten message only when needed', async () => {
  const plugin = createPlugin();

  const passthrough = await plugin.tool_result_persist({
    message: {
      toolName: 'exec',
      content: [{ type: 'text', text: 'short output' }],
    },
  });
  assert.deepEqual(passthrough, {});

  const rewritten = await plugin.tool_result_persist({
    message: {
      toolName: 'exec',
      content: [{ type: 'text', text: 'warning\n'.repeat(900) }],
    },
  });

  assert.ok(rewritten.message);
  assert.match(rewritten.message.content[0].text, /warning lines/);
});

test('plugin with storageRootDir persists bulky exec output before rewriting', async () => {
  const dir = makeTempDir();
  const plugin = createPlugin({ storageRootDir: dir, source: 'gh issue list' });

  const rewritten = await plugin.tool_result_persist({
    sessionKey: 'session-2',
    workspacePath: '/workspace/demo',
    message: {
      toolName: 'exec',
      content: [{ type: 'text', text: 'error\n'.repeat(900) }],
    },
  });

  assert.ok(rewritten.message);

  const dbPath = path.join(dir, 'artifacts.db');
  const dbExists = fs.existsSync(dbPath);
  assert.equal(dbExists, true);
});
