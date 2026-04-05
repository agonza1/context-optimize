# OpenClaw hook plan

## Desired interception point

We need interception after tool execution but before the result is assembled into model context.

## Candidate hook strategy

### 1. `after_tool_call`
Use to inspect completed tool results and persist bulky raw output.

Responsibilities:
- inspect tool name
- inspect `result` / `output`
- decide if interceptable
- write artifact to local store
- compute replacement payload

### 2. result replacement mechanism
Implementation detail depends on exact OpenClaw hook semantics available in the current plugin API.

The required capability is:
- replace or mutate tool result before it is added to prompt context

If OpenClaw allows direct after-tool result mutation, use that.
If not, use the nearest supported pre-prompt transformation path for tool result content.

## v0.1 required hook behaviors

- observe tool result
- store raw result
- replace injected result with compact payload
- preserve metadata needed for debugging

## Non-goals for v0.1

- command blocking
- rewriting tool inputs
- generic prompt interception
- message/user text rewriting

## Compatibility note

Implementation should be written against current OpenClaw plugin APIs and verified against the running version in this workspace.
