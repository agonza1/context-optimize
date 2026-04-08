# Architecture

## Goal

Intercept bulky tool outputs before they reach the model context, store them locally, and replace them with compact structured payloads.

## Primary execution path

1. Tool executes normally in OpenClaw
2. `context-optimize` plugin receives tool result in post-execution / pre-prompt path
3. Plugin classifies result
4. If result is below threshold or tool is excluded, pass through unchanged
5. If result is interceptable and bulky:
   - store raw output locally
   - compute compact summary
   - replace raw output with interception payload
6. Model receives only compact payload
7. Later, retrieval helpers can search/fetch slices from local storage

## v0.1 tool scope

### Included
- `exec`

### Excluded
- `read`
- `write`
- `edit`
- `apply_patch`
- all other tools until explicitly reviewed

## Next scope after v0.1

### Likely next targets
- search-heavy outputs that behave like inventories or grep dumps
- bulky structured results where retrieval-first is better than blind replay

### Separate future lane: think on code
This should be implemented as a code-aware retrieval/summarization path with stricter fidelity rules than generic context compression.

Principles:
- understand code structure without repeatedly replaying full source blobs
- preserve exact source retrieval for editing
- keep diffs, patches, and line-precise review flows out of aggressive compression paths

## Why `exec` first

`exec` is the highest-value/lowest-ambiguity source of context bloat:
- logs
- test output
- lint output
- inventories
- diagnostics
- repeated shell scans

It is also safer than intercepting source-file reads, where exact text fidelity is often the point.

## Component layout

- `src/plugin/`
  - OpenClaw hook integration
  - tool-result interception decisions
- `src/storage/`
  - SQLite DB init/migrations
  - artifact persistence
  - pruning
- `src/classify/`
  - threshold logic
  - tool allow/deny rules
- `src/summarize/`
  - compact replacement summaries
- `src/retrieval/`
  - search/fetch API

## Runtime data flow

### Pass-through path
- tool result small or excluded
- plugin returns original result unchanged

### Intercept path
- raw output persisted to artifact store
- summary generated
- original result replaced with compact payload string/object

## Failure policy

If storage or summarization fails:
- fail open for v0.1
- pass original tool output through unchanged
- never block the user’s task because `context-optimize` had an internal problem

## Privacy

- all storage local only
- no remote sync
- no telemetry
- no version checks
- no outbound requests
