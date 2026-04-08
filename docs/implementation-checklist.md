# Implementation checklist

## Plugin / hook layer
- [x] Verify exact OpenClaw plugin API for post-tool-result mutation
- [x] Confirm `tool_result_persist` is the v0.1 mutation hook
- [ ] Inspect actual `AgentMessage` tool-result shape in runtime
- [x] Implement plugin skeleton
- [x] Handle `exec` result inspection
- [x] Replace bulky output with compact payload
- [x] Fail open on plugin errors

## Storage
- [x] Implement SQLite connection/bootstrap
- [x] Create schema + indexes
- [x] Implement artifact insert
- [x] Implement prune expired artifacts
- [x] Implement workspace/session scoping helpers

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
- [x] Test small exec output pass-through
- [x] Test bulky exec output interception
- [ ] Test storage/retrieval roundtrip
- [x] Test exclusion/fail-open behavior
- [x] Confirm no network behavior
