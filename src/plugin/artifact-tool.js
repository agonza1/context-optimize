import {
  fetchSlice,
  searchArtifacts,
  latestArtifacts,
  artifactPreview,
} from '../retrieval.js';

export function createArtifactRetrieveTool(store) {
  return {
    name: 'artifact_retrieve',
    label: 'Retrieve intercepted artifact',
    description:
      'Retrieve raw content from a tool output that was intercepted by context-optimize. ' +
      'Use when you see a placeholder with an artifactId and need the actual output. ' +
      'Pass artifactId to fetch a specific artifact (with optional keyword/line focus), ' +
      'or pass search to find artifacts by content.',
    parameters: {
      type: 'object',
      properties: {
        artifactId: {
          type: 'string',
          description: 'The artifact ID from the interception placeholder (e.g. art_m1abc_x9z)',
        },
        keyword: {
          type: 'string',
          description: 'Return lines centered around the first occurrence of this keyword',
        },
        lines: {
          type: 'string',
          description: 'Line range to retrieve (e.g. "1-50", "100-150")',
        },
        lineCount: {
          type: 'number',
          description: 'Max lines to return (default 80). Use to control response size.',
        },
        search: {
          type: 'string',
          description: 'Full-text search query across all stored artifacts in the current session',
        },
      },
    },

    async execute(_toolCallId, params, _signal) {
      const { artifactId, keyword, lines, lineCount = 80, search } = params;

      if (search) {
        return executeSearch(store.db, search);
      }

      if (artifactId) {
        return executeFetch(store.db, artifactId, { keyword, lines, lineCount });
      }

      return executeLatest(store.db);
    },
  };
}

function executeSearch(db, query) {
  const results = searchArtifacts(db, query, { limit: 5 });

  if (!results.length) {
    return {
      content: [{ type: 'text', text: 'No artifacts matched the search query.' }],
      details: { matchCount: 0 },
    };
  }

  const lines = results.map(
    (r) =>
      `- ${r.id} | ${r.tool_name} | ${r.lines} lines, ${r.bytes} bytes | ${r.summary || '(no summary)'}`,
  );

  return {
    content: [
      {
        type: 'text',
        text: `Found ${results.length} artifact(s):\n${lines.join('\n')}\n\nUse artifact_retrieve with artifactId to fetch content.`,
      },
    ],
    details: { matchCount: results.length },
  };
}

function executeFetch(db, artifactId, options) {
  const result = fetchSlice(db, artifactId, {
    keyword: options.keyword,
    lines: options.lines,
    lineCount: options.lineCount,
  });

  if (!result) {
    return {
      content: [{ type: 'text', text: `Artifact ${artifactId} not found (may have expired).` }],
      details: { found: false },
    };
  }

  const header = [
    `artifact: ${result.artifactId}`,
    `source: ${result.source}`,
    `total: ${result.lines} lines, ${result.bytes} bytes`,
    `showing: ${result.sliceLineCount} lines`,
    options.keyword ? `focus: keyword "${options.keyword}"` : null,
    options.lines ? `focus: lines ${options.lines}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    content: [{ type: 'text', text: `${header}\n---\n${result.slice}` }],
    details: { found: true, sliceLineCount: result.sliceLineCount },
  };
}

function executeLatest(db) {
  const recent = latestArtifacts(db, { limit: 5 });

  if (!recent.length) {
    return {
      content: [{ type: 'text', text: 'No artifacts stored in the current session.' }],
      details: { count: 0 },
    };
  }

  const lines = recent.map(
    (r) =>
      `- ${r.id} | ${r.tool_name} | ${r.lines} lines, ${r.bytes} bytes | ${r.summary || '(no summary)'}`,
  );

  return {
    content: [
      {
        type: 'text',
        text: `Recent artifacts:\n${lines.join('\n')}\n\nUse artifact_retrieve with artifactId to fetch content.`,
      },
    ],
    details: { count: recent.length },
  };
}
