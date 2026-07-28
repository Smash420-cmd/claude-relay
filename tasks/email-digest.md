# Daily email digest + hygiene check

**cwd:** `C:/Users/pmdse/Projects/sidedoor` · **model:** sonnet · **effort:** high

Daily email triage for Patrick. **Read-only** — never reply, archive, delete or
label anything. Read `~/.relay/context/<this task id>/NOTES.md` first, update at
the end.

Use the Gmail MCP tools (ToolSearch for 'gmail' if not loaded). Last 24 hours.

## 1. Important

One line each — sender, subject, why it matters — for anything time-sensitive,
from a key contact, needing a reply/action, or a bill / invoice / travel
confirmation. If nothing matters, say so in one line.

The inbox is mostly noise: Mixcloud upload notifications, retail newsletters,
SEEK/LinkedIn job alerts. Count it, don't list it.

## 2. Hygiene

- unread count
- unread and older than 7 days
- anything in spam that looks legitimate

## Send exactly one card

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
  --type email-digest --title "Email digest - <today's date>" \
  --body "<summary>" --priority normal
```

`--type email-digest`, not `dev-update` — the phone colours the frame by type.

CARD STYLE: archaic-hybrid (`~/.claude/skills/archaic-hybrid/SKILL.md`) —
verdict-first title ≤8 words, ≤10 bullets / ≤120 words, one fact per bullet,
keep every number/name/date/amount, no process narration, one `NEEDS YOU:`
bullet last if Patrick must act. Walls of text are bugs.

Never touch or forward `ANTHROPIC_API_KEY`.
