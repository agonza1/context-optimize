import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const DEFAULT_TTL_HOURS = 24;

export function getStorageDir(rootDir) {
  return rootDir || path.join(os.homedir(), '.openclaw', 'context-optimize');
}

export function getDatabasePath(rootDir) {
  return path.join(getStorageDir(rootDir), 'artifacts.db');
}

export function ensureStorageDir(rootDir) {
  const dir = getStorageDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function workspaceIdFor(workspacePath = '') {
  return crypto.createHash('sha1').update(String(workspacePath)).digest('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function expiresAtIso(ttlHours = DEFAULT_TTL_HOURS) {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
}

export function openDatabase(rootDir) {
  ensureStorageDir(rootDir);
  const db = new Database(getDatabasePath(rootDir));
  db.pragma('journal_mode = WAL');
  return db;
}

export function initSchema(db) {
  db.exec(`
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

    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
      id,
      source_label,
      command_text,
      content,
      summary,
      tokenize = 'porter unicode61'
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_key);
    CREATE INDEX IF NOT EXISTS idx_artifacts_tool ON artifacts(tool_name);
    CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);
    CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at);
  `);
}

export function pruneExpiredArtifacts(db, now = nowIso()) {
  db.prepare('DELETE FROM artifacts_fts WHERE id IN (SELECT id FROM artifacts WHERE expires_at < ?)').run(now);
  return db.prepare('DELETE FROM artifacts WHERE expires_at < ?').run(now);
}

export function insertArtifact(db, artifact) {
  const createdAt = artifact.createdAt || nowIso();
  const expiresAt = artifact.expiresAt || expiresAtIso(artifact.ttlHours);
  const row = {
    id: artifact.id,
    workspace_id: artifact.workspaceId,
    workspace_path: artifact.workspacePath || null,
    session_key: artifact.sessionKey || null,
    tool_name: artifact.toolName,
    source_label: artifact.sourceLabel || null,
    command_text: artifact.commandText || null,
    content: artifact.content,
    summary: artifact.summary || null,
    bytes: artifact.bytes,
    lines: artifact.lines,
    metadata_json: artifact.metadataJson || null,
    created_at: createdAt,
    expires_at: expiresAt,
  };

  db.prepare(`
    INSERT INTO artifacts (
      id, workspace_id, workspace_path, session_key, tool_name, source_label,
      command_text, content, summary, bytes, lines, metadata_json, created_at, expires_at
    ) VALUES (
      @id, @workspace_id, @workspace_path, @session_key, @tool_name, @source_label,
      @command_text, @content, @summary, @bytes, @lines, @metadata_json, @created_at, @expires_at
    )
  `).run(row);

  db.prepare(`
    INSERT INTO artifacts_fts (id, source_label, command_text, content, summary)
    VALUES (@id, @source_label, @command_text, @content, @summary)
  `).run(row);

  return { ...row };
}
