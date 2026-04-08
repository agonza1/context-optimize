export function searchArtifacts(db, query, options = {}) {
  const { workspaceId, sessionKey, toolName, limit = 10 } = options;

  let sql = 'SELECT a.* FROM artifacts a';
  const params = [];

  if (workspaceId || sessionKey || toolName) {
    sql += ' WHERE ';
    const conditions = [];

    if (workspaceId) {
      conditions.push('a.workspace_id = ?');
      params.push(workspaceId);
    }

    if (sessionKey) {
      conditions.push('a.session_key = ?');
      params.push(sessionKey);
    }

    if (toolName) {
      conditions.push('a.tool_name = ?');
      params.push(toolName);
    }

    sql += conditions.join(' AND ');
  }

  if (query) {
    sql += workspaceId || sessionKey || toolName ? ' AND ' : ' WHERE ';
    sql += 'a.id IN (SELECT id FROM artifacts_fts WHERE artifacts_fts MATCH ?)';
    params.push(query);
  }

  sql += ` ORDER BY a.created_at DESC LIMIT ${limit}`;

  return db.prepare(sql).all(...params);
}

export function latestArtifacts(db, options = {}) {
  const { workspaceId, sessionKey, toolName = 'exec', limit = 5 } = options;

  const results = searchArtifacts(db, null, { workspaceId, sessionKey, toolName, limit });
  return results.reverse();
}

export function fetchArtifact(db, artifactId) {
  return db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId);
}

export function fetchSlice(db, artifactId, options = {}) {
  const { lines: lineRange, lineCount = 50, keyword } = options;

  const artifact = fetchArtifact(db, artifactId);
  if (!artifact) {
    return null;
  }

  const content = artifact.content;
  const contentLines = content.split(/\r?\n/);

  let slice = null;

  if (keyword) {
    const keywordIdx = contentLines.findIndex((line) => line.includes(keyword));
    if (keywordIdx >= 0) {
      const start = Math.max(0, keywordIdx - Math.floor(lineCount / 2));
      const end = Math.min(contentLines.length, start + lineCount);
      slice = contentLines.slice(start, end).join('\n');
    }
  } else if (lineRange) {
    const [start, end] = lineRange.split('-').map(Number);
    slice = contentLines.slice(start - 1, end).join('\n');
  } else {
    slice = contentLines.slice(0, lineCount).join('\n');
  }

  return {
    artifactId,
    source: artifact.source_label,
    bytes: artifact.bytes,
    lines: artifact.lines,
    slice: slice || 'No matching content found.',
    sliceLineCount: slice ? slice.split(/\r?\n/).length : 0,
  };
}

export function artifactPreview(db, artifactId, previewLines = 10) {
  const artifact = fetchArtifact(db, artifactId);
  if (!artifact) {
    return null;
  }

  const lines = artifact.content.split(/\r?\n/);
  const preview = lines.slice(0, previewLines).join('\n');

  return {
    artifactId,
    source: artifact.source_label,
    createdAt: artifact.created_at,
    bytes: artifact.bytes,
    lines: artifact.lines,
    summary: artifact.summary,
    preview,
  };
}
