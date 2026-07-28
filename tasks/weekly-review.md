# Interlinked: weekly review

**cwd:** `C:/Users/pmdse/Projects/sojournly-v1` · **model:** sonnet · **effort:** high

Patrick's Sunday weekly review. ONE card. Do not edit files.

## Gather

1. **Shipped** — `git -C <path> log --oneline --since='7 days ago'` for:
   - `C:/Users/pmdse/Projects/sojournly-v1` (live Sojournly)
   - `C:/Users/pmdse/Projects/sojournly-v2` (skunkworks)
   - `C:/Users/pmdse/Projects/relay`
   - `C:/Users/pmdse/Projects/interlinked`
2. **Sojournly week** — Supabase MCP, project `qiwxsetlndsqnypmxgcu`: week totals
   for signups, sales count + AUD sum (`sum(amount_total)/100.0`, cents), errors.
3. **Queued** — `node C:/Users/pmdse/Projects/relay/scripts/relay.js list`,
   summarise what's scheduled.

## Body

Three tight markdown sections:

```
## Shipped        — one line per meaningful theme, not per commit
## Sojournly week — the numbers
## Queued         — what's scheduled
```

## Send

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
  --type note --title "Weekly review" --body-file <tempfile> --priority normal
```

`--type weekly-review` is rendered by the phone app but the CLI's `TYPES` array
doesn't accept it yet (as of 2026-07-20) — use `note` until the CLI is patched.

CARD STYLE: archaic-hybrid (`~/.claude/skills/archaic-hybrid/SKILL.md`) —
verdict-first title ≤8 words, ≤10 bullets / ≤120 words, keep every
number/name/date/amount, no process narration.

Would a sharp assistant text this from a train platform? One card, then stop.
