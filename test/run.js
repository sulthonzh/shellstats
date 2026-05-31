'use strict';

const path = require('path');
const fs = require('fs');
const {
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
} = require('../src/index');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

function asserteq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; }
  else { fail++; console.error(`  ✗ ${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
}

// ── Test data ────────────────────────────────────────────────────

const bashHistory = [
  'git status',
  'git add .',
  'git commit -m "fix: bug"',
  'git push',
  'cd src',
  'ls -la',
  'npm install',
  'npm test',
  'git status',
  'git add .',
  'npm run build',
  'docker ps',
  'docker compose up -d',
  'kubectl get pods',
  'git log --oneline',
  'cd ..',
  'ls',
  'npm install',
  'npm install',
  'git status',
].join('\n');

const zshHistory = [
  ': 1700000000:0;git status',
  ': 1700000100:0;git add .',
  ': 1700000200:0;git commit -m "feat: new thing"',
  ': 1700000300:0;git push origin main',
  ': 1700000400:0;cd /tmp',
  ': 1700000500:0;ls -la',
  ': 1700000600:0;npm install',
  ': 1700000700:0;npm test',
  ': 1700000800:0;git status',
  ': 1700000900:0;vim README.md',
  ': 1700001000:0;sudo apt update',
  ': 1700001100:0;docker build -t app .',
].join('\n');

const fishHistory = [
  '- cmd: git status',
  '- cmd: git add .',
  '- cmd: npm install',
  '- cmd: npm test',
  '- cmd: ls -la',
  '- cmd: echo "hello world"',
  '- cmd: git push',
].join('\n');

// ── Tests ────────────────────────────────────────────────────────

console.log('parseBashHistory');
{
  const entries = parseBashHistory(bashHistory);
  asserteq(entries.length, 20, 'parses 20 bash entries');
  asserteq(entries[0].command, 'git status', 'first command');
  asserteq(entries[0].timestamp, null, 'no timestamps in bash');
}

console.log('parseZshHistory');
{
  const entries = parseZshHistory(zshHistory);
  asserteq(entries.length, 12, 'parses 12 zsh entries');
  asserteq(entries[0].command, 'git status', 'first zsh command');
  asserteq(entries[0].timestamp, 1700000000, 'zsh has timestamps');
  asserteq(entries[3].command, 'git push origin main', 'full command preserved');
}

console.log('parseFishHistory');
{
  const entries = parseFishHistory(fishHistory);
  asserteq(entries.length, 7, 'parses 7 fish entries');
  asserteq(entries[0].command, 'git status', 'first fish command');
}

console.log('extractBaseCommand');
{
  asserteq(extractBaseCommand({ command: 'git status' }), 'git', 'simple command');
  asserteq(extractBaseCommand({ command: 'git log --oneline' }), 'git', 'with args');
  asserteq(extractBaseCommand({ command: 'sudo apt update' }), 'apt', 'sudo prefix');
  asserteq(extractBaseCommand({ command: 'cat file.txt | grep foo' }), 'cat', 'pipe');
  asserteq(extractBaseCommand({ command: 'make && make install' }), 'make', '&& chain');
  asserteq(extractBaseCommand({ command: 'echo hi > out.txt' }), 'echo', 'redirect');
  asserteq(extractBaseCommand({ command: '/usr/bin/node server.js' }), 'node', 'full path');
  asserteq(extractBaseCommand({ command: '  ls -la  ' }), 'ls', 'trimmed whitespace');
  asserteq(extractBaseCommand({ command: 'doas vim /etc/rc.conf' }), 'vim', 'doas prefix');
}

console.log('analyzeFrequency');
{
  const entries = parseBashHistory(bashHistory);
  const freq = analyzeFrequency(entries, { top: 5 });
  asserteq(freq[0].command, 'git', 'git is top command');
  assert(freq[0].count >= 5, 'git appears 5+ times');
  assert(parseFloat(freq[0].pct) >= 25, 'git is >= 25%');
}

console.log('analyzeTimePatterns');
{
  const entries = parseZshHistory(zshHistory);
  const tp = analyzeTimePatterns(entries);
  assert(tp !== null, 'has time patterns');
  asserteq(tp.totalWithTimestamps, 12, '12 entries with timestamps');
  assert(typeof tp.peakHour === 'number', 'peak hour is a number');
  assert(typeof tp.peakDay === 'string', 'peak day is string');
  asserteq(tp.hourly.length, 24, '24 hours');
  asserteq(tp.daily.length, 7, '7 days');
}

console.log('analyzeSequences');
{
  const entries = parseBashHistory(bashHistory);
  const seqs = analyzeSequences(entries, { top: 5, minLength: 1 });
  assert(seqs.length > 0, 'has sequences');
  asserteq(seqs[0].sequence, 'git → git', 'most common is git → git');
}

console.log('analyzeLengths');
{
  const entries = parseBashHistory(bashHistory);
  const lens = analyzeLengths(entries);
  assert(lens !== null, 'has length stats');
  assert(parseFloat(lens.avg) > 0, 'avg > 0');
  assert(lens.min < lens.max, 'min < max');
  assert(typeof lens.median === 'number', 'median is number');
}

console.log('analyzeDuplicates');
{
  const entries = parseBashHistory(bashHistory);
  const dups = analyzeDuplicates(entries);
  asserteq(dups.total, 20, 'total 20');
  assert(dups.unique < 20, 'fewer unique than total');
  assert(dups.duplicate > 0, 'has duplicates');
  assert(parseFloat(dups.uniquePct) < 100, 'unique < 100%');
}

console.log('analyze (full)');
{
  const tmp = path.join('/tmp', 'test_bash_hist');
  fs.writeFileSync(tmp, bashHistory);
  const result = analyze(tmp, { shell: 'bash', top: 5 });
  asserteq(result.totalEntries, 20, '20 total');
  assert(result.frequency.length === 5, 'top 5');
  assert(result.sequences.length > 0, 'has sequences');
  asserteq(result.shell, 'bash', 'shell is bash');
  fs.unlinkSync(tmp);
}

console.log('formatText');
{
  const tmp = path.join('/tmp', 'test_fmt');
  fs.writeFileSync(tmp, bashHistory);
  const result = analyze(tmp, { shell: 'bash' });
  const text = formatText(result);
  assert(text.includes('Top Commands'), 'has top commands');
  assert(text.includes('git'), 'includes git');
  assert(text.includes('20 commands'), 'includes count');
  fs.unlinkSync(tmp);
}

console.log('formatJSON');
{
  const tmp = path.join('/tmp', 'test_json');
  fs.writeFileSync(tmp, bashHistory);
  const result = analyze(tmp, { shell: 'bash' });
  const json = formatJSON(result);
  const parsed = JSON.parse(json);
  asserteq(parsed.totalEntries, 20, 'JSON round-trip');
  fs.unlinkSync(tmp);
}

console.log('formatMarkdown');
{
  const tmp = path.join('/tmp', 'test_md');
  fs.writeFileSync(tmp, bashHistory);
  const result = analyze(tmp, { shell: 'bash' });
  const md = formatMarkdown(result);
  assert(md.includes('# Shell History Analysis'), 'has title');
  assert(md.includes('| Command |'), 'has table header');
  assert(md.includes('`git`'), 'has git in backticks');
  fs.unlinkSync(tmp);
}

console.log('time patterns null for bash');
{
  const entries = parseBashHistory(bashHistory);
  const tp = analyzeTimePatterns(entries);
  asserteq(tp, null, 'null when no timestamps');
}

console.log('analyze error on missing file');
{
  const result = analyze('/tmp/nonexistent_hist_file_xyz', { shell: 'bash' });
  assert(result.error, 'has error for missing file');
}

console.log('empty history');
{
  const tmp = path.join('/tmp', 'test_empty');
  fs.writeFileSync(tmp, '');
  const result = analyze(tmp, { shell: 'bash' });
  assert(result.error, 'has error for empty');
  fs.unlinkSync(tmp);
}

console.log('multiline zsh command');
{
  const multi = ': 1700000000:0;echo "hello \\\nworld"';
  const entries = parseZshHistory(multi);
  asserteq(entries.length, 1, 'one multiline entry');
  assert(entries[0].command.includes('\n'), 'contains newline');
}

console.log('zsh history with plain lines');
{
  const mixed = ': 1700000000:0;git status\nplain command here\n: 1700000100:0;npm test';
  const entries = parseZshHistory(mixed);
  asserteq(entries.length, 3, '3 entries mixed');
  asserteq(entries[1].command, 'plain command here', 'plain line parsed');
  asserteq(entries[1].timestamp, null, 'plain line no timestamp');
}

// ── Summary ──────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
