---
name: context-optimize
description: Reduce prompt-context waste during coding and analysis by preferring code-first analysis, batching noisy work, and storing bulky transient artifacts locally instead of repeatedly pulling raw output into the conversation. Use when command output, logs, large scans, repeated grep/read results, or transient technical artifacts are bloating context.
---

# context-optimize

Prefer code-first analysis over dragging raw output into the model.

## Default approach

1. If output is bulky, summarize first.
2. If the data is transient but may be needed again, store it in a local scratch index.
3. Keep working-state snapshots small and task-focused.
4. Avoid duplicating durable memory with temporary scratch data.

## Good fits

- Logs
- Large grep/search outputs
- Codebase inventories
- Repeated command outputs
- Temporary documentation extracts

## Avoid

- Storing personal durable memory here
- Fetching remote data unless explicitly requested
- Dumping large raw blobs back into the conversation when a summary or targeted retrieval is enough
