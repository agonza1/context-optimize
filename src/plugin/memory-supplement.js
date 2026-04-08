import {
  searchArtifacts,
  latestArtifacts,
  fetchArtifact,
  fetchSlice,
} from '../retrieval.js';

const CORPUS_NAME = 'artifacts';

/**
 * Maps a DB artifact row to a MemoryCorpusSearchResult.
 * Score is derived from recency (newer = higher).
 */
function toSearchResult(row, index) {
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  const recencyScore = Math.max(0.1, 1 - ageMs / (24 * 60 * 60 * 1000));

  return {
    corpus: CORPUS_NAME,
    path: row.id,
    title: `exec artifact ${row.id}`,
    kind: 'artifact',
    score: recencyScore - index * 0.001,
    snippet: row.summary || `${row.tool_name} output (${row.bytes} bytes, ${row.lines} lines)`,
    id: row.id,
    source: 'context-optimize',
    provenanceLabel: 'context-optimize',
    sourceType: 'artifact',
    updatedAt: row.created_at,
  };
}

export function createArtifactCorpusSupplement(store) {
  return {
    async search({ query, maxResults = 10, agentSessionKey }) {
      const rows = searchArtifacts(store.db, query, {
        sessionKey: agentSessionKey,
        limit: maxResults,
      });

      return rows.map(toSearchResult);
    },

    async get({ lookup, fromLine, lineCount = 80, agentSessionKey }) {
      if (fromLine != null) {
        const lineRange = `${fromLine}-${fromLine + lineCount - 1}`;
        const slice = fetchSlice(store.db, lookup, { lines: lineRange, lineCount });
        if (!slice) return null;

        return {
          corpus: CORPUS_NAME,
          path: lookup,
          title: `exec artifact ${lookup}`,
          kind: 'artifact',
          content: slice.slice,
          fromLine,
          lineCount: slice.sliceLineCount,
          id: lookup,
          provenanceLabel: 'context-optimize',
          sourceType: 'artifact',
        };
      }

      const artifact = fetchArtifact(store.db, lookup);
      if (!artifact) return null;

      const contentLines = artifact.content.split(/\r?\n/);
      const effectiveCount = Math.min(lineCount, contentLines.length);
      const content = contentLines.slice(0, effectiveCount).join('\n');

      return {
        corpus: CORPUS_NAME,
        path: artifact.id,
        title: `exec artifact ${artifact.id}`,
        kind: 'artifact',
        content,
        fromLine: 1,
        lineCount: effectiveCount,
        id: artifact.id,
        provenanceLabel: 'context-optimize',
        sourceType: 'artifact',
        updatedAt: artifact.created_at,
      };
    },
  };
}

export function createArtifactPromptSupplement(store) {
  return ({ availableTools }) => {
    if (!availableTools.has('memory_search') && !availableTools.has('memory_get')) {
      return [];
    }

    const recent = latestArtifacts(store.db, { limit: 1 });
    if (!recent.length) return [];

    return [
      'Intercepted tool outputs are stored as artifacts by context-optimize.',
      'Use memory_search with corpus="artifacts" to find them by content.',
      'Use memory_get with corpus="artifacts" and lookup="<artifactId>" to fetch raw output.',
    ];
  };
}
