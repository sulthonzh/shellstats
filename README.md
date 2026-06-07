# shellstats

Analyze your shell history — most used commands, time patterns, command sequences, and habits you didn't know you had.

## Why?

Your shell history is a goldmine of data. You run hundreds of commands a day but never look back. `shellstats` turns that history into something useful: which commands you actually use, what time of day you're most productive, and what command sequences keep repeating.

No config. No setup. Just run it.

## Install

```bash
npm install -g shellstats
```

Or run it directly:

```bash
npx shellstats
```

## Quick Start

```bash
# Analyze your default shell history
shellstats

# Force a specific shell
shellstats --shell zsh

# Top 10 commands, JSON output
shellstats --top 10 --format json

# Everything — sequences, time patterns, length stats
shellstats --all

# Analyze a specific history file
shellstats ~/.bash_history --shell bash
```

## What It Shows

### Top Commands

```
Top Commands:
  git       142  (28.4%)  ██████████████
  cd         89  (17.8%)  █████████
  npm        45   (9.0%)  ████
  ls         34   (6.8%)  ███
  docker     28   (5.6%)  ██
```

### Command Sequences

Patterns you repeat without thinking:

```
Command Sequences:
  git → git   (47x)
  cd → ls     (31x)
  npm → npm   (18x)
  git → cd    (15x)
```

### Time Patterns

When you actually type commands (zsh/fish only — bash doesn't store timestamps):

```
Peak hour: 14:00 | Peak day: Tue
Hourly distribution:
  00:00  ▓ 1.2%
  01:00  ▓ 0.4%
  ...
  14:00  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 15.3%
```

### Command Length Stats

```
Command Lengths: avg 18.4 chars, median 15, p95 42, range 2-187
```

### Uniqueness

```
Unique Commands: 312/500 (62.4% unique)
```

## CLI Options

```
shellstats [options] [history-file]

Options:
  --shell <bash|zsh|fish>   Shell type (default: auto-detect from $SHELL)
  --top <n>                 Top N commands to show (default: 20)
  --format <text|json|md>   Output format (default: text)
  --sequences               Show command sequences
  --times                   Show time patterns
  --lengths                 Show command length stats
  --all                     Show all sections
  -h, --help                Show help
```

## Output Formats

### Text (default)

Human-readable with unicode bars. Good for terminals.

### JSON

Machine-readable. Pipe it into `jq`, use it in scripts.

```bash
shellstats --format json | jq '.frequency[0]'
```

### Markdown

Nice for sharing. Tables work in GitHub, Notion, etc.

```bash
shellstats --format md > my-shell-report.md
```

## Supported Shells

| Shell | History File | Timestamps |
|-------|-------------|------------|
| bash  | `~/.bash_history` | No |
| zsh   | `~/.zsh_history` | Yes |
| fish  | `~/.local/share/fish/fish_history` | No |

Auto-detects your shell from `$SHELL`. Pass `--shell` to override.

## Smart Command Extraction

`shellstats` doesn't just count raw strings. It extracts the *base command*:

- `sudo apt update` → `apt`
- `git log --oneline` → `git`
- `cat file.txt | grep foo` → `cat` (takes first command in pipe)
- `make && make install` → `make` (takes first in chain)
- `/usr/bin/node server.js` → `node` (strips path)
- `doas vim /etc/rc.conf` → `vim`

This means `git status`, `git add .`, and `git push` all count as `git` — which is usually what you want.

## Programmatic API

```javascript
const { analyze, formatText, formatJSON, formatMarkdown } = require('shellstats');

const result = analyze(null, { shell: 'zsh', top: 15 });
console.log(formatText(result));

// Or access raw data
console.log(result.frequency);     // [{ command, count, pct }, ...]
console.log(result.sequences);     // [{ sequence, count }, ...]
console.log(result.timePatterns);  // { hourly, daily, peakHour, peakDay }
console.log(result.lengths);       // { avg, min, max, median, p95 }
console.log(result.duplicates);    // { total, unique, duplicate, uniquePct }
```

## Use Cases

- **Curious about your habits?** Run `shellstats` and see what you actually type all day.
- **Cleaning up aliases?** Find your most-used commands and alias the long ones.
- **Team insights?** Compare shell stats across your team (share the markdown output).
- **Scripting?** Use JSON output to build dashboards or trigger alerts.
- **Onboarding?** See what commands a new team member is using most.

## Zero Dependencies

No dependencies. Just Node.js >= 16.

## License

MIT
