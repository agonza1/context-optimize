# context-optimize

Local-first context pressure reduction for OpenClaw.

## Goals

- Keep bulky transient outputs out of prompt context when possible
- Store/search large temporary artifacts locally
- Preserve compact working-state snapshots across compaction
- Encourage code-first analysis instead of raw-output reasoning

## Principles

- Local-first
- No telemetry
- No auto-update
- No external fetch unless explicitly invoked
- OpenClaw-native, not a clone of upstream tools

## Initial Scope

### Phase 1
- Scratch SQLite/FTS store for transient artifacts
- Working-state snapshot store
- Helper utilities for store/search/summarize
- Skill guidance for code-first analysis

### Phase 2
- Context-pressure heuristics
- Lightweight wrappers for noisy workflows

## Status

Scaffolding in progress.
