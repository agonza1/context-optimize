# Replacement payload contract

## Objective

When a bulky tool result is intercepted, the model should receive a compact payload that preserves usefulness while avoiding raw blob injection.

## Runtime-informed constraint

OpenClaw appears to derive tool-result text from text-bearing entries in `message.content`.

So the safest v0.1 replacement strategy is:
- keep the tool-result message envelope
- replace bulky raw text in `content` with one compact text block
- preserve existing IDs / role / error metadata where possible

## v0.1 payload fields

Represent these fields inside the compact replacement text:
- interception marker
- `artifactId`
- `tool`
- `source`
- `bytes`
- `lines`
- `summary`
- `highlights`
- retrieval hint

## Example text payload

```text
[context-optimize intercepted tool output]
artifactId: art_01HXYZ...
tool: exec
source: npm test
bytes: 81234
lines: 1542
summary: Large exec output stored locally. Test run completed with 3 failures and 12 warnings.
highlights:
- 3 failing tests detected
- 12 warning lines detected
- JUnit summary present
retrieval: Use context-optimize retrieval to search or fetch relevant slices by artifactId.
```

## Why plain text first

For v0.1, compact text content is the lowest-risk replacement because OpenClaw already extracts tool-result text from content blocks. This avoids depending on any deeper structured-content assumptions before we test a live plugin fixture.

## Summary constraints

- summary <= ~400 chars target
- highlights <= 5 items
- never inline the full raw output
- avoid pretending to be exhaustive

## Fallback

If summary generation fails:
- keep the payload minimal
- include counts/stats and retrieval hint
- do not block tool flow
