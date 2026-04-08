# Roadmap

## v0.1
- Tool-result interception only
- OpenClaw plugin skeleton
- SQLite + FTS5 scratch store
- `exec` bulky-output interception
- local artifact search/fetch path
- 24h pruning

## v0.2
- search-heavy tool interception
- better summarization/classification
- repeated-output dedup
- configurable thresholds and allowlists
- retrieval-first handling for bulky search results

## v0.3
- selective read/search interception beyond `exec`
- explicit exact-fidelity exclusions for code-edit/review flows
- targeted source retrieval instead of broad replay where safe
- initial "think on code" support as a separate lane

## Think on code lane
This should be treated as a parallel product lane, not accidental compression of source reads.

Goals:
- keep exact code-editing and review fidelity intact
- allow code-aware summaries, structure extraction, and targeted recall when the task is understanding code rather than blindly replaying full files every turn
- make it easy to retrieve exact source slices on demand

Guardrails:
- do not compress diffs/patches under review
- do not hide exact source text when an edit depends on precise lines
- prefer code-structure summaries and targeted retrieval for exploration, not for final editing steps

## Explicitly not in scope for now
- user/assistant text interception
- duplicate work-state snapshot system
- telemetry, version checks, auto-update
- broad source-code read interception without explicit fidelity rules
