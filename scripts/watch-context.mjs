#!/usr/bin/env node
/**
 * Real-time context savings monitor.
 * Watches the latest OpenClaw session JSONL and reports token impact per turn.
 *
 * Usage: node scripts/watch-context.mjs [session-file]
 *   If no session file given, picks the most recently modified one.
 */
import fs from 'node:fs';
import path from 'node:path';

const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
const sessionsDir = process.env.OPENCLAW_SESSIONS_DIR
  || path.join(homeDir, '.openclaw', 'agents', 'main', 'sessions');

function findLatestSession() {
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? path.join(sessionsDir, files[0].name) : null;
}

const sessionFile = process.argv[2] || findLatestSession();
if (!sessionFile) { console.error('No session file found'); process.exit(1); }

console.log('Watching:', sessionFile);
console.log('Waiting for new tool results and model turns...\n');
console.log('  TYPE         TOOL / MODEL       SIZE / TOKENS        NOTES');
console.log('  ───────────  ─────────────────  ───────────────────  ──────────────────────────────');

let processedLines = 0;
let cumulativeSaved = 0;
let interceptedCount = 0;
let missedCount = 0;

function processNewLines() {
  const raw = fs.readFileSync(sessionFile, 'utf8');
  const lines = raw.split('\n').filter(Boolean);

  for (let i = processedLines; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]);
      if (msg.type !== 'message') continue;
      const m = msg.message;
      if (!m) continue;

      if (m.role === 'toolResult') {
        const textParts = Array.isArray(m.content)
          ? m.content.filter(p => p.type === 'text').map(p => p.text).join('')
          : '';
        const bytes = Buffer.byteLength(textParts, 'utf8');
        const tokens = Math.ceil(bytes / 4);
        const tool = (m.toolName || '?').padEnd(17);

        if (textParts.includes('context-optimize intercepted')) {
          const match = textParts.match(/bytes:\s*(\d+)/);
          const rawBytes = match ? parseInt(match[1]) : bytes;
          const rawTokens = Math.ceil(rawBytes / 4);
          const saved = rawTokens - tokens;
          cumulativeSaved += saved;
          interceptedCount++;
          console.log(`  ✅ INTERCEPT  ${tool}  ${bytes.toString().padStart(7)}B stub     saved ~${saved} tok (raw was ${rawBytes}B)`);
        } else if (bytes >= 2048) {
          missedCount++;
          console.log(`  ⚠️  RAW LARGE  ${tool}  ${bytes.toString().padStart(7)}B / ~${tokens} tok   NOT intercepted`);
        } else {
          console.log(`  ·  small      ${tool}  ${bytes.toString().padStart(7)}B / ~${tokens} tok`);
        }
      }

      if (m.role === 'assistant' && m.usage) {
        const input = m.usage.input || 0;
        const cache = m.usage.cacheRead || 0;
        const total = input + cache;
        const cost = m.usage.cost?.total || 0;
        console.log(`  📊 MODEL      input=${input.toString().padStart(6)} cache=${cache.toString().padStart(6)}  total_ctx=${total.toString().padStart(6)}  $${cost.toFixed(4)}`);
      }
    } catch {}
  }

  processedLines = lines.length;
}

processNewLines();

fs.watchFile(sessionFile, { interval: 500 }, () => {
  processNewLines();
});

setInterval(() => {
  if (interceptedCount > 0 || missedCount > 0) {
    console.log(`\n  ── Running totals: ${interceptedCount} intercepted, ${missedCount} missed, ~${cumulativeSaved} cumulative tokens saved ──\n`);
  }
}, 30000);

process.on('SIGINT', () => {
  console.log('\n\n=== FINAL REPORT ===');
  console.log(`  Intercepted: ${interceptedCount}`);
  console.log(`  Missed (>2KB, not intercepted): ${missedCount}`);
  console.log(`  Cumulative tokens saved: ~${cumulativeSaved}`);
  fs.unwatchFile(sessionFile);
  process.exit(0);
});
