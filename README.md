# context-optimize

OpenClaw-native pre-injection interception for bulky tool outputs.

## What it is

`context-optimize` is a local-first project focused on one problem:

- intercept large **tool call outputs** before they are injected into model context
- store raw bulky output locally
- pass only compact summaries and retrieval handles to the model

## What it is not

- not a clone of context-mode
- not a durable memory system
- not a replacement for OpenClaw session continuity
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

Planning locked around pre-injection tool-call interception.
