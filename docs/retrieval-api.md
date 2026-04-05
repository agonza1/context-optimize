# Retrieval API shape

## Goal

After interception, the agent needs a way to get back only the useful parts of stored artifacts.

## v0.1 operations

### 1. search
Search artifacts by:
- artifact id
- workspace
- session
- tool name
- query string

Example intent:
- find failing tests in a stored exec output
- find stack trace snippets
- find warnings from the most recent artifact

### 2. fetch-slice
Fetch only a targeted slice from one artifact.

Possible selectors:
- line range
- keyword-centered snippet
- first/last N lines

### 3. latest
Get the latest intercepted artifacts for current workspace/session.

## v0.1 response shape

### search result
- artifactId
- source
- createdAt
- preview
- stats

### fetch-slice result
- artifactId
- selector description
- snippet text
- omitted counts if applicable

## Design rule

Retrieval should bring back only what is needed for the next reasoning step, not the entire original blob by default.
