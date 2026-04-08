import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeGrepOutput, analyzeErrorLog, analyzeTestOutput, analyzeJson, analyzeAuto } from '../src/analyze.js';

test('analyze: grep output groups by file', () => {
  const grepOutput = `src/index.js:export function hello() {
src/index.js:  console.log('hello');
src/utils.js:function helper() {
src/utils.js:  return 42;
`;

  const result = analyzeGrepOutput(grepOutput);

  assert.equal(result.format, 'grep');
  assert.equal(result.files, 2);
  assert.equal(result.totalLines, 4);
  assert.equal(result.fileBreakdown['src/index.js'], 2);
  assert.equal(result.fileBreakdown['src/utils.js'], 2);
});

test('analyze: error log detects errors and warnings', () => {
  const errorLog = `[INFO] Starting server
[ERROR] Failed to load config file
[WARNING] Deprecated API used
[ERROR] Connection timeout after 30s
At handler.js:42
  in onRequest
  in middleware
[INFO] Retrying connection`;

  const result = analyzeErrorLog(errorLog);

  assert.equal(result.format, 'error-log');
  assert.equal(result.errorCount, 2);
  assert.equal(result.warningCount, 1);
  assert.ok(result.stackTraceCount >= 1);
  assert.match(result.errors[0], /Failed|timeout/);
});

test('analyze: test output counts passes and failures', () => {
  const testOutput = `✔ test 1 passed (5ms)
✔ test 2 passed (3ms)
✖ test 3 failed: expected true got false
✔ test 4 passed (2ms)
⊝ test 5 skipped
✖ test 6 failed: timeout`;

  const result = analyzeTestOutput(testOutput);

  assert.equal(result.format, 'test-output');
  assert.equal(result.passing, 3);
  assert.equal(result.failing, 2);
  assert.equal(result.skipped, 1);
  assert.match(result.summary, /3 pass, 2 fail/);
  assert.equal(result.failingTests.length, 2);
});

test('analyze: JSON structure summary', () => {
  const jsonText = JSON.stringify({
    items: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    count: 2,
    status: 'ok',
  });

  const result = analyzeJson(jsonText);

  assert.equal(result.format, 'json');
  assert.equal(result.parseError, null);
  assert.ok(result.keyCount > 0);
});

test('analyze: auto-detection identifies format', () => {
  const grepText = 'file.js:export function test() { }';
  const errorText = '[ERROR] Something went wrong at line 42';
  const testText = '✔ test passed\n✖ test failed';

  const grep = analyzeAuto(grepText);
  const error = analyzeAuto(errorText);
  const testOut = analyzeAuto(testText);

  assert.equal(grep.format, 'grep');
  assert.equal(error.format, 'error-log');
  assert.equal(testOut.format, 'test-output');
});

test('analyze: large grep output summary', () => {
  const lines = [];
  for (let i = 0; i < 100; i++) {
    lines.push(`src/file_${i}.js:function test_${i}() { }`);
  }

  const result = analyzeGrepOutput(lines.join('\n'));

  assert.equal(result.format, 'grep');
  assert.equal(result.files, 100);
  assert.equal(result.totalLines, 100);
});
