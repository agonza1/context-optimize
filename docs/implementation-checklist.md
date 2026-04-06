# Implementation checklist

## Plugin / hook layer
- [x] Verify exact OpenClaw plugin API for post-tool-result mutation
- [x] Confirm `tool_result_persist` is the v0.1 mutation hook
- [ ] Inspect actual `AgentMessage` tool-result shape in runtime
- [ ] Implement plugin skeleton
- [ ] Handle `exec` result inspection
- [ ] Replace bulky output with compact payload
- [ ] Fail open on plugin errors

## Storage
- [ ] Implement SQLite connection/bootstrap
- [ ] Create schema + indexes
- [ ] Implement artifact insert
- [ ] Implement prune expired artifacts
- [ ] Implement workspace/session scoping helpers

## Classification / summarization
- [ ] Implement `exec` thresholds
- [ ] Implement line/byte counting
- [ ] Implement lightweight error/warning/test-summary extraction
- [ ] Implement compact payload builder

## Retrieval
- [ ] Implement search by artifact/query
- [ ] Implement fetch-slice helpers
- [ ] Implement latest-artifacts query

## Validation
- [ ] Test small exec output pass-through
- [ ] Test bulky exec output interception
- [ ] Test storage/retrieval roundtrip
- [ ] Test exclusion/fail-open behavior
- [ ] Confirm no network behavior
