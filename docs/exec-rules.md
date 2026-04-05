# `exec` interception rules

## v0.1 target

Intercept only bulky `exec` outputs.

## Pass-through rules

Pass through unchanged when any of these is true:
- output bytes < 32768
- output lines < 800
- output is empty or trivial
- command appears to return a compact direct answer
- command is part of a code-review / exact-fidelity workflow (future explicit allowlist/denylist)

## Intercept rules

Intercept when:
- tool is `exec`
- output bytes >= 32768 OR lines >= 800
- output is plain text / shell output suitable for summarization

## Summary heuristics

Extract lightweight signals:
- count of lines containing `error`, `ERROR`, `failed`, `FAIL`
- count of lines containing `warning`, `WARN`
- detect test summary patterns
- detect stack traces
- detect repeated line patterns

## v0.1 exclusions

Do not try to semantically compress:
- patches/diffs emitted via shell
- exact source code emitted via shell for review
- binary-looking output

If exclusion is ambiguous, fail open and pass through.

## Output stats

Always store:
- byte count
- line count
- tool name
- command text if available
- created time
- TTL expiry
