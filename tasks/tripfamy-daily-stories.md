# Tripfamy: daily stories

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** claude-sonnet-5-5 · **effort:** high

Tripfamy daily story run. Full protocol in `EDITORIAL_PIPELINE.md` — read it
first, and note the token-economy rules in PHOTOS and LOOK. The site is live:
an insert is public within 5 minutes and flows into the Sojournly app via RSS.

## STEP 000 — weekdays only (Oracle 6910)

Relay has no weekday schedule, so this task fires daily. If today in
Australia/Sydney is Saturday or Sunday, stop now: no card, no NOTES.md edit,
no other tool call.

## STEP 00 — check the rules haven't changed under you

```bash
cd C:/Users/pmdse/Projects/travel-blog
md5sum STYLE.md EDITORIAL_PIPELINE.md personas/*.md | awk '{printf "%.8s  %s
", $1, $2}'
```

Compare against the RULES STAMP in NOTES.md, read every changed file in full,
say which changed, write the new stamp. No stamp yet → read `STYLE.md` and
`EDITORIAL_PIPELINE.md` in full. Then load the `unslop` skill (STYLE.md says
so; it binds every writer and the editor).

## Boxes

1. **PREMISE** — `node scripts/generate-stories.mjs assignment 2` (two stories a weekday, Patrick 6907 / Oracle 6910); each story runs boxes 1c to 6 on its own
1c. **RESEARCH** — 5-10 sourced facts per story into its `facts.json`; no source, no claim
2. **PHOTOS** — `src.medium` only, sequential, first plausible wins, max 3 views per beat
3. **STORY** — one persona subagent each, pinned `model: "sonnet"`,
   `personas/<username>.md` + that story's `facts.json` only, `STYLE.md` rules
   (its believability section is absolute: invented characters may have names
   and dialogue but are never tied to a real business, nothing disparaging
   about a real business, no unsourced facts, nothing after the publish date,
   no AI wording)
3b. **SUBEDIT** — `card_title` ≤ 6 words / 40 chars — the insert REQUIRES it
4. **GATE** — reader-sim, max 3 attempts then skip
4a. **EDITOR** — fresh `model: "opus"` subagent; it fixes every problem it
   lists itself (no hand-back to the writer), views every figure against its
   text and the country (photo pass), then re-reads until a pass finds
   nothing (max 3, then skip); every pass goes in NOTES.md
5. **INSERT** — `insert <tempfile>`; a `lintStory` failure means fix the prose
   (rewrite, never just delete a dash), not the validator. A `region` failure: set the
   country the story is set in, or skip that story with `NEEDS YOU:` on the card.
   **Never edit `generate-stories.mjs`** or any other code
6. **LOOK** — own-run smoke ONLY (one screenshot per story; the nightly sweep
   does the deep pass)

## Cards

No card for clean runs. Card with `NEEDS YOU:` for unfixable defects.

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send --type dev-update ...
```

Never commit `.env.local`. Do not chain further tasks.
