'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── History parsers ──────────────────────────────────────────────

function detectShell() {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return 'bash';
}

function getHistoryPath(shell) {
  const home = os.homedir();
  switch (shell) {
    case 'zsh': return path.join(home, '.zsh_history');
    case 'bash': return path.join(home, '.bash_history');
    case 'fish': return path.join(home, '.local', 'share', 'fish', 'fish_history');
    default: return path.join(home, '.bash_history');
  }
}

function parseBashHistory(content) {
  return content
    .split('\n')
    .filter(line => line.trim())
    .map((line, i) => ({ command: line.trim(), index: i, timestamp: null }));
}

function parseZshHistory(content) {
  const entries = [];
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(': ')) {
      // Format: ": 1234567890:0;command"
      const match = line.match(/^: (\d+):\d+;(.*)$/);
      if (match) {
        let cmd = match[2];
        // Multi-line commands use backslash continuation
        while (cmd.endsWith('\\') && i + 1 < lines.length) {
          i++;
          cmd = cmd.slice(0, -1) + '\n' + lines[i];
        }
        entries.push({ command: cmd, index: entries.length, timestamp: parseInt(match[1], 10) });
      }
    } else if (line.trim()) {
      entries.push({ command: line.trim(), index: entries.length, timestamp: null });
    }
    i++;
  }
  return entries;
}

function parseFishHistory(content) {
  return content
    .split('\n')
    .filter(line => line.startsWith('- cmd: '))
    .map((line, i) => {
      const cmd = line.replace('- cmd: ', '').trim();
      return { command: cmd, index: i, timestamp: null };
    });
}

function parseHistory(filePath, shell) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  switch (shell) {
    case 'zsh': return parseZshHistory(content);
    case 'fish': return parseFishHistory(content);
    default: return parseBashHistory(content);
  }
}

// ── Command extraction ───────────────────────────────────────────

function extractBaseCommand(entry) {
  let cmd = entry.command.trim();
  // Skip env assignments at the start
  cmd = cmd.replace(/^[A-Z_]+=\S+\s*/, '');
  // Handle pipes — take first command
  cmd = cmd.split(/\s*\|\s*/)[0].trim();
  // Handle && and ||
  cmd = cmd.split(/\s*(?:&&|\|\|)\s*/)[0].trim();
  // Handle redirections
  cmd = cmd.split(/\s*[<>]\s*/)[0].trim();
  // Handle subshells
  if (cmd.startsWith('(')) cmd = cmd.slice(1);
  // Extract the binary/command name
  const parts = cmd.split(/\s+/);
  let base = parts[0] || '';
  // Handle sudo, doas, nice, etc.
  const prefixes = ['sudo', 'doas', 'nice', 'ionice', 'strace', 'ltrace', 'time', 'nocorrect'];
  while (prefixes.includes(base) && parts.length > 1) {
    parts.shift();
    base = parts[0];
  }
  // Strip path prefix
  if (base.includes('/')) base = path.basename(base);
  return base;
}

// ── Analysis ─────────────────────────────────────────────────────

function analyzeFrequency(entries, opts = {}) {
  const top = opts.top || 20;
  const counts = {};
  for (const entry of entries) {
    const base = extractBaseCommand(entry);
    if (!base) continue;
    counts[base] = (counts[base] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([command, count]) => ({ command, count, pct: ((count / entries.length) * 100).toFixed(1) }));
}

function analyzeTimePatterns(entries) {
  const withTs = entries.filter(e => e.timestamp);
  if (withTs.length === 0) return null;

  const hours = new Array(24).fill(0);
  const days = new Array(7).fill(0);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (const entry of withTs) {
    const d = new Date(entry.timestamp * 1000);
    hours[d.getHours()]++;
    days[d.getDay()]++;
  }

  const total = withTs.length;
  return {
    hourly: hours.map((count, h) => ({ hour: h, count, pct: ((count / total) * 100).toFixed(1) })),
    daily: days.map((count, d) => ({ day: dayNames[d], count, pct: ((count / total) * 100).toFixed(1) })),
    peakHour: hours.indexOf(Math.max(...hours)),
    peakDay: dayNames[days.indexOf(Math.max(...days))],
    totalWithTimestamps: total,
  };
}

function analyzeSequences(entries, opts = {}) {
  const top = opts.top || 10;
  const minLen = opts.minLength || 2;
  const pairs = {};

  for (let i = 0; i < entries.length - 1; i++) {
    const a = extractBaseCommand(entries[i]);
    const b = extractBaseCommand(entries[i + 1]);
    if (!a || !b) continue;
    const key = `${a} → ${b}`;
    pairs[key] = (pairs[key] || 0) + 1;
  }

  return Object.entries(pairs)
    .filter(([, count]) => count >= minLen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([sequence, count]) => ({ sequence, count }));
}

function analyzeLengths(entries) {
  const lengths = entries.map(e => e.command.length);
  if (lengths.length === 0) return null;
  lengths.sort((a, b) => a - b);
  const sum = lengths.reduce((a, b) => a + b, 0);
  return {
    avg: (sum / lengths.length).toFixed(1),
    min: lengths[0],
    max: lengths[lengths.length - 1],
    median: lengths[Math.floor(lengths.length / 2)],
    p95: lengths[Math.floor(lengths.length * 0.95)],
  };
}

function analyzeDuplicates(entries) {
  const seen = {};
  let duplicateCount = 0;
  let uniqueCount = 0;
  for (const entry of entries) {
    const cmd = entry.command.trim();
    if (seen[cmd]) {
      duplicateCount++;
    } else {
      seen[cmd] = true;
      uniqueCount++;
    }
  }
  return {
    total: entries.length,
    unique: uniqueCount,
    duplicate: duplicateCount,
    uniquePct: ((uniqueCount / entries.length) * 100).toFixed(1),
  };
}

function analyzeFirstOnCLI(entries) {
  // What commands are typically the first thing typed
  const bases = entries.map(e => extractBaseCommand(e));
  const counts = {};
  for (const b of bases) {
    if (!b) continue;
    counts[b] = (counts[b] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([command, count]) => ({ command, count }));
}

// ── Full analysis ────────────────────────────────────────────────

function analyze(filePath, opts = {}) {
  const shell = opts.shell || detectShell();
  const resolvedPath = filePath || getHistoryPath(shell);
  const entries = parseHistory(resolvedPath, shell);

  if (entries.length === 0) {
    return { error: 'No history entries found', shell, path: resolvedPath };
  }

  return {
    shell,
    path: resolvedPath,
    totalEntries: entries.length,
    frequency: analyzeFrequency(entries, opts),
    sequences: analyzeSequences(entries, opts),
    timePatterns: analyzeTimePatterns(entries),
    lengths: analyzeLengths(entries),
    duplicates: analyzeDuplicates(entries),
    topCommands: analyzeFirstOnCLI(entries),
  };
}

// ── Output formatters ────────────────────────────────────────────

function formatText(result) {
  if (result.error) return `Error: ${result.error}`;

  const lines = [];
  lines.push(`Shell History Analysis: ${result.shell} (${result.totalEntries} commands)`);
  lines.push(`Source: ${result.path}`);
  lines.push('');

  // Top commands
  lines.push('Top Commands:');
  const maxCmd = Math.max(...result.frequency.map(c => c.command.length));
  const maxCount = Math.max(...result.frequency.map(c => String(c.count).length));
  for (const { command, count, pct } of result.frequency) {
    const bar = '█'.repeat(Math.ceil(parseFloat(pct) / 2));
    lines.push(`  ${command.padEnd(maxCmd)}  ${String(count).padStart(maxCount)}  (${pct}%)  ${bar}`);
  }
  lines.push('');

  // Sequences
  if (result.sequences.length > 0) {
    lines.push('Command Sequences:');
    for (const { sequence, count } of result.sequences) {
      lines.push(`  ${sequence}  (${count}x)`);
    }
    lines.push('');
  }

  // Time patterns
  if (result.timePatterns) {
    const tp = result.timePatterns;
    lines.push(`Time Patterns (from ${tp.totalWithTimestamps} entries with timestamps):`);
    lines.push(`  Peak hour: ${tp.peakHour}:00 | Peak day: ${tp.peakDay}`);
    lines.push('');
    const hourBar = tp.hourly.map((h, i) => {
      const bar = '▓'.repeat(Math.ceil(parseFloat(h.pct)));
      return `  ${String(i).padStart(2)}:00  ${bar} ${h.pct}%`;
    });
    lines.push('Hourly distribution:');
    lines.push(hourBar.join('\n'));
    lines.push('');
  }

  // Lengths
  if (result.lengths) {
    const l = result.lengths;
    lines.push(`Command Lengths: avg ${l.avg} chars, median ${l.median}, p95 ${l.p95}, range ${l.min}-${l.max}`);
    lines.push('');
  }

  // Duplicates
  const d = result.duplicates;
  lines.push(`Unique Commands: ${d.unique}/${d.total} (${d.uniquePct}% unique)`);

  return lines.join('\n');
}

function formatJSON(result) {
  return JSON.stringify(result, null, 2);
}

function formatMarkdown(result) {
  if (result.error) return `**Error:** ${result.error}`;

  const lines = [];
  lines.push(`# Shell History Analysis — ${result.shell}`);
  lines.push('');
  lines.push(`**Total commands:** ${result.totalEntries} | **Source:** \`${result.path}\``);
  lines.push('');

  lines.push('## Top Commands');
  lines.push('');
  lines.push('| Command | Count | % |');
  lines.push('|---------|-------:|---:|');
  for (const { command, count, pct } of result.frequency) {
    lines.push(`| \`${command}\` | ${count} | ${pct}% |`);
  }
  lines.push('');

  if (result.sequences.length > 0) {
    lines.push('## Command Sequences');
    lines.push('');
    lines.push('| Sequence | Count |');
    lines.push('|----------|------:|');
    for (const { sequence, count } of result.sequences) {
      lines.push(`| ${sequence} | ${count} |`);
    }
    lines.push('');
  }

  if (result.timePatterns) {
    const tp = result.timePatterns;
    lines.push('## Time Patterns');
    lines.push('');
    lines.push(`- **Peak hour:** ${tp.peakHour}:00`);
    lines.push(`- **Peak day:** ${tp.peakDay}`);
    lines.push('');
  }

  if (result.lengths) {
    const l = result.lengths;
    lines.push('## Command Lengths');
    lines.push('');
    lines.push(`- **Average:** ${l.avg} chars`);
    lines.push(`- **Median:** ${l.median} chars`);
    lines.push(`- **P95:** ${l.p95} chars`);
    lines.push(`- **Range:** ${l.min}–${l.max}`);
    lines.push('');
  }

  const d = result.duplicates;
  lines.push(`## Uniqueness: ${d.unique}/${d.total} (${d.uniquePct}% unique)`);

  return lines.join('\n');
}

module.exports = {
  detectShell,
  getHistoryPath,
  parseHistory,
  parseBashHistory,
  parseZshHistory,
  parseFishHistory,
  extractBaseCommand,
  analyzeFrequency,
  analyzeTimePatterns,
  analyzeSequences,
  analyzeLengths,
  analyzeDuplicates,
  analyze,
  formatText,
  formatJSON,
  formatMarkdown,
};
