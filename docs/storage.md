# Storage design

## Location

Store data under OpenClaw state home, not inside the repo.

Suggested root:
- `~/.openclaw/context-optimize/`

Suggested files:
- `~/.openclaw/context-optimize/artifacts.db`

## Rationale

- keeps transient runtime data out of git repos
- matches OpenClaw-local behavior expectations
- easier pruning and operational cleanup

## SQLite schema

### Table: artifacts

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_path TEXT,
  session_key TEXT,
  tool_name TEXT NOT NULL,
  source_label TEXT,
  command_text TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  bytes INTEGER NOT NULL,
  lines INTEGER NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

### Table: artifacts_fts

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
  id,
  source_label,
  command_text,
  content,
  summary,
  tokenize = 'porter unicode61'
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_key);
CREATE INDEX IF NOT EXISTS idx_artifacts_tool ON artifacts(tool_name);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at);
```

## Scoping keys

### workspace_id
Derived from normalized workspace path hash.

### session_key
Use OpenClaw session key when available.

Use both so retrieval can work by:
- workspace-wide context
- session-local context
- intersection of both

## Retention

Default TTL:
- 24 hours

Pruning triggers:
- on startup
- on write
- optional periodic prune later

## v0.1 prune rule

Delete rows where `expires_at < now()`.

Keep pruning simple at first.
