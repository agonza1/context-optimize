# context-optimize

OpenClaw-native pre-injection interception for bulky tool outputs.

## What it is

`context-optimize` is a local-first project focused on one problem:

- intercept large **tool call outputs** before they are injected into model context
- store raw bulky output locally
- pass only compact summaries and retrieval handles to the model

## Where it fits in the OpenClaw stack

OpenClaw already ships several layers that manage context size and agent memory.
context-optimize is not a replacement for any of them — it fills a specific gap none of them cover.

```
exec produces large output
  │
  ├─ context-optimize ──→ Intercepts at persist time, before the blob
  │                        enters the transcript. Stores raw in SQLite,
  │                        injects ~300B structured summary.
  │
  ├─ capToolResultSize ──→ Built-in blind truncation (runs before hooks).
  │
  ├─ contextPruning ─────→ Drops stale context entries (e.g. cache-ttl).
  │
  ├─ compaction ──────────→ Summarizes old turns when the context window
  │   + memoryFlush         fills up. Flushes to memory before compacting.
  │
  ├─ memory-core ─────────→ Extracts facts into a persistent vector store.
  │
  └─ memory-wiki ─────────→ Compiles durable knowledge into a structured
                             wiki vault (entities, concepts, claims).
```

| Layer | Question it answers |
|---|---|
| **context-optimize** | Should this tool output enter the transcript at full size? |
| **contextPruning** | Is this context entry still fresh enough to keep? |
| **compaction** | Is the context window getting too full? |
| **memory-core** | What facts should the agent remember across sessions? |
| **memory-wiki** | How should durable knowledge be organized and navigated? |

Without context-optimize, a large exec result sits in the transcript burning tokens on every LLM call until compaction or pruning eventually cleans it up — and the raw output is lost once that happens. With it, the transcript only ever sees a compact summary, and the raw artifact stays retrievable in SQLite.

## What it is not

- not a durable memory system
- not a replacement for compaction, contextPruning, or memory-core
- not a general interception layer for all prompt content

## Initial scope

### v0.1
- Tool-result interception only
- OpenClaw plugin approach
- SQLite + FTS5 scratch store
- `exec` bulky-output interception first
- retrieval of stored artifacts by targeted search/slice
- 24h retention

### v0.2
- search-heavy tool interception
- better classification and summarization
- repeated-output dedup heuristics

## Design constraints

- Local only
- No telemetry
- No auto-update
- No outbound network from this project
- Preserve exact fidelity for code-review/edit flows

## Status

Native OpenClaw plugin packaging and interception runtime are implemented.

## OpenClaw integration

### 1. Load the plugin from your OpenClaw config

Point `plugins.load.paths` at this repo, then enable the entry:

```json
{
  "plugins": {
    "entries": {
      "context-optimize": {
        "enabled": true
      }
    },
    "load": {
      "paths": [
        "/absolute/path/to/context-optimize"
      ]
    }
  }
}
```

In this workspace, the working path is:

```text
/Users/alberto/.openclaw/workspace/projects/context-optimize
```

### 2. Restart OpenClaw

```bash
openclaw gateway restart
```

### 3. Verify config is clean

```bash
openclaw status
```

You should not see a stale `plugin not found` warning for `context-optimize`.

### 4. How it works at runtime

The plugin exports a native OpenClaw plugin definition from:

```text
src/plugin/runtime.js
```

It registers a `tool_result_persist` hook and currently targets large `exec` outputs.
When thresholds are exceeded, it:

- stores raw output locally in SQLite
- replaces the persisted tool result with a compact summary payload
- preserves a retrieval handle (`artifactId`) for follow-up inspection

### Retrieval via memory engine

The plugin registers a `MemoryCorpusSupplement` so stored artifacts are accessible
through the standard `memory_search` and `memory_get` tools that agents already use:

- `memory_search corpus="artifacts"` — full-text search across stored artifacts
- `memory_get corpus="artifacts" lookup="<artifactId>"` — fetch raw content by ID

A prompt supplement is also registered so agents are informed when artifacts are
available. No custom tools are needed — retrieval works through OpenClaw's existing
memory infrastructure.

### 5. Default storage

By default, runtime storage goes to:

```text
$PWD/.context-optimize
```

You can override that through plugin config, for example with:

- `stateDir`
- `ttlHours`
- `byteThreshold`
- `lineThreshold`
- `source`

### 6. Minimal runtime example

OpenClaw resolves plugin config into the runtime wrapper, which then creates the interception plugin internally:

```js
import plugin from './src/plugin/runtime.js';

export default plugin;
```

### 7. Current verification status

Verified in repo:

- native plugin export present
- hook registration test passes
- interception/storage/retrieval tests pass
- live OpenClaw config now points at this repo path instead of the stale `/tmp/context-optimize-work`

Recommended final validation in a live session:

- run a very large `exec` output
- confirm persisted tool output is replaced with a summary payload containing `artifactId`
- confirm local artifact DB is populated
