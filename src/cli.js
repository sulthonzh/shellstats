#!/usr/bin/env node
'use strict';

const { analyze, formatText, formatJSON, formatMarkdown } = require('./index');

const args = process.argv.slice(2);

function usage() {
  console.log(`shellstats — analyze your shell history

Usage:
  shellstats [options] [history-file]

Options:
  --shell <bash|zsh|fish>   Shell type (default: auto-detect)
  --top <n>                 Top N commands to show (default: 20)
  --format <text|json|md>   Output format (default: text)
  --sequences               Show command sequences
  --times                   Show time patterns
  --lengths                 Show command length stats
  --all                     Show all sections
  -h, --help                Show this help

Examples:
  shellstats                        # analyze default shell history
  shellstats --shell zsh            # force zsh mode
  shellstats --top 10 --format json # top 10 as JSON
  shellstats ~/.bash_history --all  # everything
`);
}

if (args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

let shell = null;
let top = 20;
let format = 'text';
let filePath = null;
let showSequences = false;
let showTimes = false;
let showLengths = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--shell': shell = args[++i]; break;
    case '--top': top = parseInt(args[++i], 10); break;
    case '--format': format = args[++i]; break;
    case '--sequences': showSequences = true; break;
    case '--times': showTimes = true; break;
    case '--lengths': showLengths = true; break;
    case '--all': showSequences = showTimes = showLengths = true; break;
    default:
      if (!args[i].startsWith('-')) filePath = args[i];
      break;
  }
}

const result = analyze(filePath, { shell, top });

switch (format) {
  case 'json': console.log(formatJSON(result)); break;
  case 'md':
  case 'markdown': console.log(formatMarkdown(result)); break;
  default: console.log(formatText(result)); break;
}
