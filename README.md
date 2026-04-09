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
tool produces large output
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

## Defaults

| Setting | Default | Config key |
|---|---|---|
| Byte threshold | **4 KB** (4096) | `byteThreshold` |
| Line threshold | **100 lines** | `lineThreshold` |
| TTL | 24 hours | `ttlHours` |
| Intercepted tools | `exec`, `read`, `process`, `web_fetch`, `browser`, `memory_search`, `memory_get`, `message`, `grep`, `glob`, `list_dir`, `sessions_list` | `tools` |

Any tool result from an intercepted tool that exceeds **either** threshold gets stored in SQLite and replaced with a ~300-byte stub.

### Observed savings

A short conversation (4–6 turns) typically saves **8k–15k input tokens** (~25% less context).
The agent can still retrieve any raw content on demand via `memory_get`.

<details>
<summary>Details from a live test session</summary>

In a 4-turn session the main agent read two workspace files and fetched a web page.
The plugin intercepted 7 tool results, replacing raw payloads (1.8 KB–13 KB each) with ~350-byte stubs (~89 tokens each).

| Metric | Value |
|---|---|
| Tool results intercepted | 7 |
| Cumulative input tokens saved | ~12,100 |
| Avg savings per intercept | ~1,730 tokens |
| Stub overhead per intercept | ~89 tokens |

These savings compound: every follow-up model call in the session avoids re-processing the raw content, so longer conversations benefit even more.
</details>

## Roadmap

### v0.1
- Tool-result interception for 12 common tools
- OpenClaw native plugin with `tool_result_persist` hook
- SQLite + FTS5 scratch store
- Retrieval via memory corpus supplement (`memory_get` / `memory_search`)
- 4 KB / 100-line thresholds, 24h retention
- Live-validated: ~25% context reduction in short conversations

### v0.2 (current)
- Wire `analyze.js` for smarter per-format summarization (module exists, not yet integrated)
- Repeated-output dedup heuristics
- Pre-model interception (current-turn context savings — today the model still sees the full payload on the turn it was produced)

## Design constraints

- Local only
- No telemetry
- No auto-update
- No outbound network from this project
- Preserve exact fidelity for code-review/edit flows

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

The plugin registers a `tool_result_persist` hook via `src/plugin/runtime.js`.
When a tool result exceeds the configured thresholds (see Defaults above), it:

- stores raw output locally in SQLite
- replaces the persisted tool result with a ~300-byte stub containing an `artifactId`

### 5. Retrieval

Agents retrieve raw content through OpenClaw's existing memory tools — no custom tools needed:

- `memory_search corpus="artifacts"` — full-text search across stored artifacts
- `memory_get corpus="artifacts" lookup="<artifactId>"` — fetch raw content by ID

### 6. Default storage

By default, runtime storage goes to:

```text
<plugin-root>/.context-optimize
```

When loaded by OpenClaw, `<plugin-root>` is the plugin directory (via `api.rootDir`).

You can override that through plugin config, for example with:

- `stateDir`
- `ttlHours`
- `byteThreshold`
- `lineThreshold`
- `source`

### 7. Verify it works

After restarting, run any tool that produces >4 KB of output. Check the session transcript — the tool result should contain `[context-optimize intercepted tool output]` with an `artifactId`, not the raw content.

You can also run the live monitor:

```bash
node scripts/watch-context.mjs
```
