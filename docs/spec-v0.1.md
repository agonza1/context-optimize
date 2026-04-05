# context-optimize v0.1

## Core objective

Reduce prompt-token waste by intercepting bulky **tool call outputs before they are injected into model context**.

This project is **not** a general memory system, not a clone of context-mode, and not a replacement for OpenClaw session continuity. It is a narrow OpenClaw-native layer for handling noisy transient tool outputs safely.

## Product boundary

### In scope
- Tool-result interception only
- Local storage of bulky raw tool output
- Compact replacement payloads passed to the model instead of raw blobs
- Targeted retrieval of stored output when needed
- Workspace + session scoping
- 24h retention and pruning

### Out of scope
- User-message interception
- Assistant-text interception
- Durable memory / personal memory
- Replacing OpenClaw work-state/session snapshots
- General-purpose remote fetching or telemetry
- Hiding source code/diffs that require exact review

## Core requirement

Interception must happen **after tool execution but before raw output is added to prompt context**.

Advisory-only behavior is not sufficient for the main goal because the model would have already consumed the bulky output.

## Architecture

### 1. OpenClaw plugin layer
Acts on tool call results in the pre-injection path.

Responsibilities:
- inspect tool name + result payload
- classify result as pass-through vs interceptable
- store bulky raw output locally when interception is allowed
- replace raw output with a compact representation

### 2. Local scratch store
Use SQLite + FTS5 under OpenClaw state home.

Properties:
- local only
- 24h TTL
- prune by age and optional size budget
- scoped by workspace path and session key

### 3. Retrieval path
Allow targeted retrieval of stored artifacts:
- search by session/workspace/tool/source
- fetch slices/snippets only
- avoid replaying entire stored blobs unless explicitly needed

## Safety principle

This system should optimize **transient noisy artifacts**, not reduce review quality for exact code/text tasks.

### Safe early targets
- exec output
- large logs
- diagnostic dumps
- inventories
- repeated search/grep style outputs

### Exclude initially
- code diffs under review
- targeted source reads for editing
- patch/apply outputs
- small tool outputs
- any output where exact fidelity is the point

## v0.1 interception matrix

### Intercept in v0.1
1. `exec`
   - especially stdout/stderr heavy commands
   - logs, diagnostics, inventories, long command output

### Consider later
2. search-heavy tool outputs
   - only after validating fidelity and retrieval flow

### Do not intercept in v0.1
- `write`
- `edit`
- `apply_patch`
- source-code `read` by default

## Initial heuristics

Interception candidates should meet both:
- tool class is allowlisted
- output exceeds threshold

### Suggested thresholds
- bytes > 32 KB
- or lines > 800
- or repeated bulky outputs from same tool/session within a short interval

Thresholds should be configurable.

## Replacement payload shape

Instead of raw output, the model receives a compact payload like:

- tool name
- artifact id/reference
- source label/command summary
- byte count / line count
- short structured summary
- notable patterns (errors/warnings/headings)
- retrieval hint

Example shape:

```json
{
  "intercepted": true,
  "artifactId": "art_123",
  "tool": "exec",
  "summary": "Large command output stored locally. Contains 3 error lines, 12 warnings, and a test summary.",
  "stats": {
    "bytes": 81234,
    "lines": 1542
  },
  "hint": "Use context-optimize retrieval to search or fetch relevant slices."
}
```

## Storage model

### Table: artifacts
- id
- workspace_id
- session_key
- tool_name
- source_label
- content
- summary
- metadata_json
- created_at
- expires_at

### Table: artifacts_fts
FTS5 mirror for searchable text.

## Scoping

Every artifact should be tagged by:
- workspace path hash/id
- session key when available
- tool name
- source label

Support queries by either workspace or session or both.

## Retention

Default:
- TTL: 24 hours
- prune expired artifacts on write/startup/interval
- optional max-db-size enforcement later

## Privacy constraints

- local only
- no telemetry
- no version phone-home
- no auto-update behavior
- no outbound network from this project itself

## Implementation plan

### Phase 1
- SQLite/FTS scratch store
- artifact schema + pruning
- compact replacement payload contract
- OpenClaw plugin skeleton with `exec` interception only
- retrieval API/tooling for targeted recall

### Phase 2
- richer classification and summarization
- search-heavy tool interception
- repeated-output dedup heuristics
- config knobs and allowlists

## Success criteria

- large exec outputs no longer flood prompt context
- exact code review/edit flows are not degraded
- stored artifacts are searchable and retrievable by slice
- no hidden network behavior
