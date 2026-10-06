# Tripfamy: weekly Story of the Week

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** claude-sonnet-5-5 · **effort:** medium

Run `node scripts/story-of-week.mjs` in the Tripfamy repo (travel-blog) — it crowns the
top-engagement published post as this week's accolade.

Read its output, then send one short card naming the winning story, its author,
and the score:

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
  --type dev-update --title "Story of the Week: <title>" --body "..."
```

`--type story-of-week` is rendered by the phone app but the CLI's `TYPES` array
doesn't accept it yet (as of 2026-07-20) — use `dev-update` until the CLI is patched.

One card, then stop.
