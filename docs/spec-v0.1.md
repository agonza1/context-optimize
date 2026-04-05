# context-optimize v0.1

## Problem

OpenClaw already provides memory, sessions, skills, and orchestration, but it does not yet provide a focused local layer for transient high-volume artifacts such as logs, large command output, codebase scans, and bulky fetched content. These artifacts can waste prompt budget without belonging in durable memory.

## Non-goals

- Do not clone context-mode feature-for-feature
- Do not add telemetry or version phone-home behavior
- Do not create a parallel durable memory system
- Do not introduce broad hard-blocking shell interception in v0.1

## Product shape

OpenClaw-native private project that adds:

1. Scratch index
2. Working-state snapshots
3. Context-pressure heuristics
4. Skill/policy guidance for code-first analysis

## Phase 1 features

### 1. Scratch index
Local SQLite database with FTS for transient artifacts:
- command output
- log excerpts
- scan summaries
- ad hoc documentation extracts

Core operations:
- store artifact with source label, type, tags, timestamp
- search artifacts by keyword/fts
- prune old artifacts by TTL or size budget

### 2. Working-state snapshot
Small structured state for current coding flow:
- current task
- active files
- recent decisions
- blockers
- next step
- optional session key / workspace

Core operations:
- write/update snapshot
- fetch latest snapshot
- compact render for reinjection/use after compaction

### 3. Helper utilities
Utilities for:
- store bulky text into scratch index
- search scratch index
- summarize text before storage
- extract only relevant fragments back into context

### 4. Skill/policy layer
A skill that nudges toward:
- analyze with code first
- prefer batching to repeated raw reads
- store bulky temporary output locally
- keep summaries concise

## Phase 2 features

### 1. Context-pressure heuristics
Heuristics to detect likely context waste:
- large stdout/stderr
- huge grep/read results
- repeated scans with overlapping content

### 2. Lightweight wrappers
Convenience wrappers for noisy workflows:
- logs
- grep/search results
- codebase inventory/scans

Wrappers should summarize first and offer storage in the scratch index.

## Privacy constraints

- All state local-only
- No outbound network for version checks, telemetry, analytics, or upgrades
- No remote APIs unless explicitly triggered by the user via existing OpenClaw tools

## Suggested repo structure

```text
context-optimize/
  README.md
  docs/
    spec-v0.1.md
    roadmap.md
  src/
    scratch/
    snapshot/
    heuristics/
    utils/
  skills/
    context-optimize/
  tests/
```

## Rough implementation order

1. Spec + roadmap
2. Scratch DB module
3. Snapshot module
4. CLI/helpers or OpenClaw-facing integration layer
5. Skill authoring
6. Phase 2 heuristics

## Success criteria

- Can store and retrieve transient bulky artifacts locally
- Can render a small useful working-state snapshot
- Can reduce repeated raw-output handling in coding sessions
- No hidden network behavior
