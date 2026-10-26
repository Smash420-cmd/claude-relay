# Interlinked: weekly review

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** high · **Browser:** R2 (`r2-browser` MCP, profile `social`)

Patrick's Sunday weekly review. ONE card. Do not edit files.

## Gather

1. **Shipped** — `git -C <path> log --oneline --since='7 days ago'` for:
   - `C:/Users/pmdse/Projects/sojournly-v1` (live Sojournly)
   - `C:/Users/pmdse/Projects/sojournly-social` (social agent — own repo since 2026-08-01)
   - `C:/Users/pmdse/Projects/sojournly-v2` (skunkworks)
   - `C:/Users/pmdse/Projects/relay`
   - `C:/Users/pmdse/Projects/interlinked`
2. **Sojournly week** — Supabase MCP, project `qiwxsetlndsqnypmxgcu`: week totals
   for signups, sales count + AUD sum (`sum(amount_total)/100.0`, cents), errors.
3. **Queued** — `node C:/Users/pmdse/Projects/relay/scripts/relay.js list`,
   summarise what's scheduled.
4. **Instagram week** - on R2 (`mcp__r2-browser__browser_*`, profile `social`; since 27 Oct 2026, the desk
   Chrome extension was not reliable). If the R2 tools are absent, or `browser_open` shows no **Edit profile** after
   one `browser_signin` (`site: "instagram"`, `profile: "social"`), write `IG: no browser access` in the card and
   move on. Read only: never click Follow, Like, Share or anything that posts. Then:
   - `https://www.instagram.com/sojournly.au/` → current **followers** total
     (delta vs the number in last week's card is the follows-per-week trend).
   - For each post dated in the last 7 days in
     `C:/Users/pmdse/Projects/sojournly-social/.claude/context/instagram-log.md`
     (moved from sojournly-v1 on 2026-08-01; the v1 copy is stale):
     open it from the profile grid → View insights → **views, non-follower %,
     saves, follows**. Saves are the number that matters; likes are noise.
   - `browser_stop` when done.

## Body

Four tight markdown sections:

```
## Shipped        — one line per meaningful theme, not per commit
## Sojournly week — the numbers
## Instagram week — followers total, then per-post: views / non-follower % / saves
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
