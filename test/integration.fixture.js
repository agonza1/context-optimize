/**
 * Integration fixture — demonstrates context-optimize in a live-like scenario
 * 
 * This shows what happens when a real OpenClaw agent session intercepts a bulky exec output.
 * Not a test, just a fixture for manual inspection.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlugin, createStore } from '../src/index.js';
import { latestArtifacts, artifactPreview } from '../src/retrieval.js';

function simulateLiveSession() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-optimize-fixture-'));

  console.log('🚀 Starting context-optimize integration fixture');
  console.log(`📁 Storage: ${tempDir}\n`);

  // 1. Create plugin (as if OpenClaw loaded it)
  const plugin = createPlugin({
    storageRootDir: tempDir,
    maxBytes: 1024, // Lower threshold for demo
    maxLines: 20,
  });

  console.log('✅ Plugin created\n');

  // 2. Simulate a tool_result_persist event with a large exec output
  const fakeLargeExecOutput = `
$ gh issue list --json number,title,labels,state

Processing 100 issues...
Found issues with labels: bug, feature, documentation, help-wanted
  Issue #1: Setup failing on macOS [bug] [help-wanted]
  Issue #2: Add dark mode support [feature]
  Issue #3: Update docs for v2 API [documentation]
  ...
  Issue #100: Fix memory leak in event handler [bug] [critical]

Test run summary:
✔ 87 passed
✖ 3 failed
⊝ 2 skipped

Failures:
  - test_auth_flow: timeout after 30s
  - test_concurrent_uploads: assertion error at line 42
  - test_cleanup_on_exit: SEGV in cleanup

Dependencies:
  @types/node: ^18.0.0
  better-sqlite3: ^11.10.0
  ...

Total time: 2.3s
  `.trim();

  const mockToolResultMessage = {
    toolName: 'exec',
    content: [
      {
        type: 'text',
        text: fakeLargeExecOutput,
      },
    ],
  };

  console.log('📦 Incoming tool result:');
  console.log(`   Tool: exec`);
  console.log(`   Size: ${fakeLargeExecOutput.length} bytes, ${fakeLargeExecOutput.split('\n').length} lines\n`);

  // 3. Process through plugin
  plugin.tool_result_persist({
    message: mockToolResultMessage,
    sessionKey: 'fixture-session-1',
    workspacePath: '/demo/workspace',
  }).then((result) => {
    console.log('⚡ Plugin processed result:');
    console.log(`   Intercepted: ${!!result.message}`);

    if (result.message) {
      const replacedText = result.message.content[0].text;
      console.log(`   Replacement text (first 200 chars):\n   ${replacedText.slice(0, 200)}...\n`);

      // 4. Open storage and show what was persisted
      const store = createStore(tempDir);
      const latest = latestArtifacts(store.db, { sessionKey: 'fixture-session-1', limit: 1 });

      if (latest.length) {
        const artifact = latest[0];
        console.log('💾 Artifact persisted:');
        console.log(`   ID: ${artifact.id}`);
        console.log(`   Session: ${artifact.session_key}`);
        console.log(`   Tool: ${artifact.tool_name}`);
        console.log(`   Size: ${artifact.bytes} bytes, ${artifact.lines} lines`);
        console.log(`   Summary: ${artifact.summary}`);
        console.log(`   Stored at: ${tempDir}/artifacts.db\n`);

        // 5. Show retrieval
        const preview = artifactPreview(store.db, artifact.id, 5);
        console.log('📄 Retrieved preview (first 5 lines):');
        console.log(preview.preview.split('\n').slice(0, 5).join('\n'));
        console.log('...\n');
      }

      console.log('✅ Integration fixture complete');
      console.log(`\n📊 Summary:`);
      console.log(`   Raw output size: ${fakeLargeExecOutput.length} bytes`);
      console.log(`   Replacement size: ${replacedText.length} bytes`);
      console.log(`   Compression: ${(100 - (replacedText.length / fakeLargeExecOutput.length) * 100).toFixed(1)}%`);
      console.log(`   Tokens saved (est): ${Math.round((fakeLargeExecOutput.length - replacedText.length) / 4)}`);
    }
  });
}

simulateLiveSession();
