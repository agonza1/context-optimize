# Integration Guide — context-optimize v0.1

This document covers how to integrate context-optimize into an OpenClaw workspace as a plugin.

## Architecture

`context-optimize` acts as an OpenClaw plugin that intercepts bulky tool outputs before they are persisted into session transcripts.

### Core responsibility
- Listen to the `tool_result_persist` hook
- Inspect tool results (starting with `exec`)
- If output is bulky (>32 KB or >800 lines), store it locally
- Replace the raw output in the message with a compact placeholder
- Provide retrieval helpers to fetch stored artifacts later

## Installation

1. The project is already in your workspace at:
   ```
   /Users/alberto/.openclaw/workspace/projects/context-optimize
   ```

2. Dependencies are declared in `package.json`. Install them:
   ```bash
   cd projects/context-optimize
   npm install
   ```

## Loading as a plugin

OpenClaw plugins are loaded via configuration. The exact mechanism depends on your OpenClaw version and plugin system.

### Option 1: Direct require in your OpenClaw config

If your OpenClaw config supports a `plugins` array, add:

```json
{
  "plugins": [
    {
      "name": "context-optimize",
      "path": "./projects/context-optimize/src/index.js",
      "config": {
        "storageRootDir": "~/.openclaw/context-optimize",
        "maxBytes": 32768,
        "maxLines": 800
      }
    }
  ]
}
```

### Option 2: Environment-based loading

If your OpenClaw gateway or agent supports plugin loading via environment variables or service discovery:

```bash
export OPENCLAW_PLUGINS="context-optimize:./projects/context-optimize/src/index.js"
```

### Option 3: Runtime registration

In your OpenClaw startup code, before session initialization:

```javascript
import createPlugin from './projects/context-optimize/src/index.js';

const plugin = createPlugin({
  storageRootDir: '~/.openclaw/context-optimize',
  maxBytes: 32 * 1024,
  maxLines: 800,
});

// Register with OpenClaw's plugin system
// Exact method depends on your OpenClaw version
agentRuntime.registerPlugin(plugin);
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storageRootDir` | string | `~/.openclaw/context-optimize` | Where to store artifacts DB |
| `maxBytes` | number | 32768 | Threshold for interception (bytes) |
| `maxLines` | number | 800 | Threshold for interception (lines) |
| `source` | string | 'exec' | Label for intercepted artifacts |
| `sessionKey` | string | (from context) | Session identifier for scoping |
| `workspacePath` | string | (from context) | Workspace path for scoping |
| `ttlHours` | number | 24 | Artifact retention time in hours |

## Runtime behavior

### When a tool result is processed

1. Plugin receives `tool_result_persist` event
2. Checks if tool is `exec` (only v0.1 target)
3. Extracts text from tool result content
4. Measures bytes and lines
5. If below threshold: **pass through unchanged**
6. If above threshold:
   - Generates artifact ID
   - Stores raw output in local SQLite DB
   - Runs lightweight code-first analysis (errors, warnings, etc.)
   - Replaces message content with compact summary
   - Returns rewritten message

### Artifact storage location

All artifacts stored under:
```
~/.openclaw/context-optimize/artifacts.db
```

This is a SQLite database with:
- `artifacts` table (raw outputs + metadata)
- `artifacts_fts` table (full-text search mirror)
- Indexes on workspace, session, tool, created_at

Artifacts are pruned after 24 hours (configurable).

## Retrieval in sessions

After interception, agents in sessions can retrieve stored artifacts programmatically:

```javascript
import { createStore } from './projects/context-optimize/src/index.js';
import { latestArtifacts, fetchSlice, searchArtifacts } from './projects/context-optimize/src/retrieval.js';

const store = createStore('~/.openclaw/context-optimize');

// Get latest intercepted exec outputs for this session
const latest = latestArtifacts(store.db, {
  sessionKey: 'session-xyz',
  limit: 5,
});

// Search artifacts for a keyword
const results = searchArtifacts(store.db, 'error', {
  sessionKey: 'session-xyz',
});

// Fetch a snippet from an artifact (keyword-centered or line range)
const slice = fetchSlice(store.db, 'art_123', {
  keyword: 'failure',
  lineCount: 20,
});
```

## Testing integration

Before deploying to production sessions:

1. **Unit tests** (already passing):
   ```bash
   npm test
   ```

2. **Manual fixture test** — create a session and run a bulky command:
   ```bash
   exec find /Users/alberto/.openclaw/workspace -type f | wc -l
   ```

   Expected behavior:
   - Message in transcript should contain `[context-optimize intercepted tool output]`
   - SQLite DB should have a new artifact row
   - Original output should be in `artifacts.db`, not in session transcript

3. **Retrieval test** — query the stored artifact:
   ```javascript
   // In an agent session
   import { createStore } from '.../context-optimize/src/index.js';
   import { latestArtifacts } from '.../context-optimize/src/retrieval.js';
   
   const store = createStore();
   const latest = latestArtifacts(store.db, { limit: 1 });
   console.log(latest[0].summary);
   ```

## Known limitations (v0.1)

- Only intercepts `exec` tool outputs
- No support for `read`, `write`, `edit`, `apply_patch` yet
- Format detection (JSON, grep, logs) is heuristic-based, not perfect
- Artifact retrieval is manual, not automatic (agent must ask for it)
- No UI for browsing/managing artifacts yet
- TTL is global (24h), not per-artifact

## Next phases

### v0.2
- Extend interception to search-heavy tools
- Better format detection and specialized summarizers
- Repeated-output dedup heuristics
- Configurable thresholds per tool

### v0.3+
- Code-aware retrieval (AST parsing, symbol indexing)
- Automatic compact code summaries (structure, imports, key functions)
- Code-review-safe exact-fidelity preservation
- UI for artifact browser
- Metrics and cost savings reporting

## Debugging

### Enable verbose logging

Set environment variable before running OpenClaw:
```bash
export CONTEXT_OPTIMIZE_DEBUG=1
```

### Inspect the artifacts DB

```bash
sqlite3 ~/.openclaw/context-optimize/artifacts.db

# List recent artifacts
SELECT id, tool_name, source_label, bytes, lines, created_at FROM artifacts ORDER BY created_at DESC LIMIT 5;

# Search for errors
SELECT id, summary FROM artifacts WHERE content MATCH 'error';
```

### Check plugin registration

Look for `context-optimize` in OpenClaw's plugin list:
```bash
openclaw status --plugins
```

## Support

If integration fails, check:
1. OpenClaw version and plugin system compatibility
2. SQLite support and file system permissions
3. Plugin path is correct and accessible
4. Node.js version (should be 18+)

See `/Users/alberto/.openclaw/workspace/projects/context-optimize/docs/` for technical details.
