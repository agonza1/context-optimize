import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../src/index.js';
import { latestArtifacts, searchArtifacts, fetchSlice, artifactPreview } from '../src/retrieval.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'context-optimize-test-'));
}

test('retrieval: latestArtifacts returns recent artifacts', () => {
  const dir = makeTempDir();
  const store = createStore(dir);

  const artifact1 = store.insertArtifact({
    id: 'art_1',
    workspaceId: 'ws_1',
    sessionKey: 'sess_1',
    toolName: 'exec',
    sourceLabel: 'cmd1',
    content: 'hello world error line',
    summary: 'test',
    bytes: 100,
    lines: 3,
    createdAt: '2026-04-08T10:00:00.000Z',
  });

  const artifact2 = store.insertArtifact({
    id: 'art_2',
    workspaceId: 'ws_1',
    sessionKey: 'sess_1',
    toolName: 'exec',
    sourceLabel: 'cmd2',
    content: 'another output warning here',
    summary: 'test 2',
    bytes: 150,
    lines: 2,
    createdAt: '2026-04-08T10:01:00.000Z',
  });

  const latest = latestArtifacts(store.db, {
    workspaceId: artifact1.workspace_id,
    sessionKey: 'sess_1',
    limit: 5,
  });

  assert.equal(latest.length, 2);
  assert.equal(latest[0].id, artifact2.id);
});

test('retrieval: searchArtifacts finds artifacts by query', () => {
  const dir = makeTempDir();
  const store = createStore(dir);

  store.insertArtifact({
    id: 'art_search_1',
    workspaceId: 'ws_2',
    sessionKey: 'sess_2',
    toolName: 'exec',
    sourceLabel: 'find results',
    content: 'file1.js error on line 42\nfile2.js warning on line 10',
    summary: 'errors',
    bytes: 100,
    lines: 2,
  });

  store.insertArtifact({
    id: 'art_search_2',
    workspaceId: 'ws_2',
    sessionKey: 'sess_2',
    toolName: 'exec',
    sourceLabel: 'different',
    content: 'success output no errors here',
    summary: 'good',
    bytes: 50,
    lines: 1,
  });

  const results = searchArtifacts(store.db, 'error', {
    workspaceId: 'ws_2',
    limit: 10,
  });

  assert.ok(results.length >= 1);
  assert.ok(results.some((r) => r.id === 'art_search_1'));
});

test('retrieval: fetchSlice extracts a keyword-centered snippet', () => {
  const dir = makeTempDir();
  const store = createStore(dir);

  const content = `line 1
line 2
line 3 with error
line 4
line 5
line 6
line 7
line 8
line 9
line 10`;

  store.insertArtifact({
    id: 'art_slice',
    workspaceId: 'ws_3',
    toolName: 'exec',
    sourceLabel: 'test content',
    content,
    summary: 'test',
    bytes: 100,
    lines: 10,
  });

  const slice = fetchSlice(store.db, 'art_slice', { keyword: 'error', lineCount: 4 });

  assert.ok(slice);
  assert.match(slice.slice, /error/);
  assert.ok(slice.sliceLineCount >= 2);
});

test('retrieval: artifactPreview returns preview + metadata', () => {
  const dir = makeTempDir();
  const store = createStore(dir);

  store.insertArtifact({
    id: 'art_preview',
    workspaceId: 'ws_4',
    toolName: 'exec',
    sourceLabel: 'gh issue list',
    content: `line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11`,
    summary: 'many issues found',
    bytes: 150,
    lines: 11,
  });

  const preview = artifactPreview(store.db, 'art_preview', 5);

  assert.ok(preview);
  assert.equal(preview.bytes, 150);
  assert.equal(preview.lines, 11);
  assert.match(preview.summary, /many issues/);
  assert.match(preview.preview, /line 1/);
  assert.ok(!preview.preview.includes('line 6'));
});
