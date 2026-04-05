# Replacement payload contract

## Objective

When a bulky tool result is intercepted, the model should receive a compact payload that preserves usefulness while avoiding raw blob injection.

## v0.1 payload fields

- `intercepted`: boolean
- `artifactId`: string
- `tool`: string
- `source`: string
- `stats.bytes`: number
- `stats.lines`: number
- `summary`: string
- `highlights`: string[]
- `retrievalHint`: string

## Example object

```json
{
  "intercepted": true,
  "artifactId": "art_01HXYZ...",
  "tool": "exec",
  "source": "npm test",
  "stats": {
    "bytes": 81234,
    "lines": 1542
  },
  "summary": "Large exec output stored locally. Test run completed with 3 failures and 12 warnings.",
  "highlights": [
    "3 failing tests detected",
    "12 warning lines detected",
    "JUnit summary present"
  ],
  "retrievalHint": "Use context-optimize retrieval to search or fetch relevant slices by artifactId."
}
```

## Rendering guidance

For v0.1, output can be injected either as:
- compact JSON string, or
- concise plain-text structured block

Prefer the format that best fits OpenClaw tool-result injection semantics.

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
