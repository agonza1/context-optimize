# Context Optimize execution status — 2026-04-07

## Current state

The project has a solid planning/spec foundation and a git history showing focused design work, but implementation is still at scaffold stage.

### What is already done
- Project scaffold exists under `projects/context-optimize/`
- Scope is narrowed correctly to pre-injection interception of bulky tool outputs
- v0.1 target is clear: intercept `exec` only
- Correct OpenClaw hook has been identified: `tool_result_persist`
- Payload rewrite strategy is defined: replace bulky text-bearing content with compact text summary payload
- Storage direction is defined: local SQLite + FTS5 scratch store with 24h retention
- Retrieval shape is defined: search, fetch-slice, latest
- Failure mode is defined correctly: fail open
- Thresholds are proposed: `> 32KB` or `> 800 lines`

### What is not done yet
- No plugin skeleton in code
- No hook wiring implemented
- No runtime fixture of real `AgentMessage` tool-result payload captured in code/tests
- No SQLite storage bootstrap
- No artifact schema or persistence layer in code
- No summarizer/classifier in code
- No retrieval API/helpers in code
- No tests
- No integration validation against a real OpenClaw run

## Reality check

This means the project is **conceptually well-shaped but functionally not delivering savings yet**.

Right now the context savings are mostly procedural/manual:
- prefer summaries over raw dumps
- avoid large repeated reads
- keep noisy outputs local when possible

The actual automatic pre-injection optimization has **not landed yet**.

## Why this is still promising

The hard conceptual questions appear mostly resolved:
- narrow boundary
- right hook
- safe v0.1 target
- clear exclusions
- local-only privacy posture
- fail-open behavior

That removes a lot of risk. The remaining work is mostly implementation and validation, not product-definition confusion.

## Detailed execution plan

## Phase 1 — prove the hook with a tiny vertical slice

Goal: verify that `tool_result_persist` can safely rewrite a real bulky `exec` result before transcript persistence.

Deliverables:
1. Create plugin skeleton under `src/plugin/`
2. Capture and document one real `tool_result_persist` message fixture
3. Implement text extraction from tool-result content
4. Implement simple threshold check
5. Replace oversized `exec` content with a minimal placeholder payload
6. Confirm small `exec` results pass through unchanged
7. Confirm plugin errors fail open

Exit criterion:
- A live/manual test shows a large `exec` result being replaced before persistence.

Expected impact:
- First real proof that token/context savings are achievable in the actual runtime.

## Phase 2 — local artifact storage

Goal: store intercepted raw output safely and retrieve it later.

Deliverables:
1. Add `src/storage/` module
2. Bootstrap SQLite database under `~/.openclaw/context-optimize/artifacts.db`
3. Create `artifacts` table and FTS5 mirror
4. Add insert path for intercepted outputs
5. Add pruning on startup/write
6. Add workspace/session scoping helpers

Exit criterion:
- Intercepted outputs are persisted with ids and TTL.

Expected impact:
- Automatic optimization becomes usable, not just destructive compression.

## Phase 3 — useful compact summaries

Goal: make replacement payloads informative enough that the model usually does not need the raw blob.

Deliverables:
1. Add `src/classify/` threshold and exclusion logic
2. Add `src/summarize/` heuristics for errors/warnings/test summaries
3. Build compact replacement text payload
4. Add command/source labeling
5. Add stats: bytes, lines, highlights

Exit criterion:
- Replacement payload is compact but actually useful for reasoning.

Expected impact:
- Context pressure falls while preserving enough signal to keep workflows smooth.

## Phase 4 — retrieval helpers

Goal: allow targeted recall of stored artifacts without replaying the whole raw output.

Deliverables:
1. Add `src/retrieval/` helpers
2. Implement `latest`
3. Implement `search`
4. Implement `fetch-slice`
5. Return previews/snippets only by default

Exit criterion:
- Agent can recover only the relevant part of a stored artifact.

Expected impact:
- Large outputs stop being "all or nothing".

## Phase 5 — validation and rollout guardrails

Goal: prove it helps without breaking exact-fidelity workflows.

Deliverables:
1. Test small `exec` pass-through
2. Test bulky `exec` interception
3. Test storage/retrieval roundtrip
4. Test fail-open behavior
5. Test exclusion behavior for ambiguous exact-fidelity output
6. Document config/threshold knobs

Exit criterion:
- Safe enough to use regularly in development sessions.

## Recommended next implementation order

If execution resumes now, the most efficient order is:
1. Plugin skeleton
2. Real fixture capture
3. Minimal rewrite for bulky `exec`
4. SQLite persistence
5. Compact summary builder
6. Retrieval helpers
7. Tests

## What “keep execution moving” should mean from here

Practical near-term milestone plan:
- Milestone A: live hook proof
- Milestone B: storage roundtrip
- Milestone C: useful summary payloads
- Milestone D: retrieval helpers
- Milestone E: test coverage and operational notes

## Honest status summary for Alberto

Short version:
- The strategy is good.
- The architecture is good.
- The correct OpenClaw hook is identified.
- But the project is still pre-implementation.
- The next real move is coding the smallest vertical slice, not more planning.

## Suggested immediate next action

Start Phase 1 and do the thinnest end-to-end implementation possible:
- plugin skeleton
- thresholded `exec` interception
- placeholder replacement payload
- fail-open handling

That is the fastest path from "interesting spec" to "actual context savings."