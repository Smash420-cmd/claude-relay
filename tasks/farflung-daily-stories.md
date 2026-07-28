# Farflung: daily AI stories

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** sonnet · **effort:** high

Farflung AI story engine daily run. Full protocol in `EDITORIAL_PIPELINE.md`
(seven boxes) — read it first, and note the token-economy rules in PHOTOS and LOOK.

## Boxes

1. **PREMISE** — `node scripts/generate-stories.mjs assignment`
2. **PHOTOS** — `src.medium` only, sequential, first plausible wins, max 3 views per beat
3. **STORY** — one persona subagent each, pinned model sonnet, `personas/<username>.md`
   only, `STYLE.md` rules
3b. **SUBEDIT** — `card_title` ≤ 6 words / 40 chars — the insert REQUIRES it
4. **GATE** — reader-sim, max 3 attempts then skip
5. **INSERT** — `insert <tempfile>`
6. **LOOK** — own-run smoke ONLY (one screenshot per story; the nightly sweep
   does the deep pass)

## Cards

No card for clean runs. Card with `NEEDS YOU:` for unfixable defects.

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send --type dev-update ...
```

Never commit `.env.local`. Do not chain further tasks.
