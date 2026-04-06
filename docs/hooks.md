# OpenClaw hook plan

## Confirmed mutation path

OpenClaw's plugin SDK exposes:

- `after_tool_call`: observe-only
- `tool_result_persist`: **mutable**

This means the correct v0.1 interception strategy is:

1. use `after_tool_call` for optional metrics/debug capture if useful
2. use `tool_result_persist` to replace the tool-result message before it is persisted into the transcript / session history

That is the critical hook for token-saving interception.

## Relevant SDK semantics

### `after_tool_call`
Signature:
- receives tool name, params, result, error, duration
- returns `void`

Use for:
- diagnostics
- metrics
- optional side capture

Do not rely on it for output mutation.

### `tool_result_persist`
Signature:
- receives the `AgentMessage` that is about to be written
- may return `{ message?: AgentMessage }`

This is the required mutation point for v0.1.

## v0.1 interception flow

### Step 1
Inspect tool result via `tool_result_persist`.

### Step 2
If tool is not `exec`, pass through unchanged.

### Step 3
Extract text payload from the pending tool-result message.

### Step 4
If payload is below threshold, pass through unchanged.

### Step 5
If payload is bulky and interceptable:
- persist raw content to local artifact store
- build compact replacement payload
- return a modified `AgentMessage` containing the compact payload instead of raw output

## Why this is the right hook

This happens before the bulky raw output becomes durable session transcript content and before it can continue bloating later context assembly.

## v0.1 non-goals

- blocking or rewriting tool inputs
- intercepting user text
- intercepting assistant freeform replies
- broad source-code read rewriting

## Implementation note

We need to inspect actual `AgentMessage` tool-result shape in OpenClaw runtime to implement the message rewrite safely.

That becomes the next code-level validation step.
