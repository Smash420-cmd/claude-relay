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

## Video pick (pick days only, after the 2 stories; Oracle 6910/6941/6947)

A pick is 2-3 paragraphs reviewing one YouTube travel video, like a short promo
review: never a first-person trip. All commands run in the travel-blog repo.

P0. `node scripts/video-pick.mjs pick-day`: `no` = skip this whole section.
P1. `node scripts/video-pick.mjs find 14` lists recent uploads from the vetted
    channels (`scripts/video-channels.json`), already-picked videos removed.
    Choose one that is about a place in a country on the COUNTRIES list, is
    upbeat, and isn't about crime, accidents, warnings, politics or deals.
    Never search YouTube any other way, and never use yt-dlp.
P2. `node scripts/video-pick.mjs check <id>`: not embeddable = choose another.
    Its `hero` is the card and hero image; never save it to the photo pool.
P3. `node scripts/video-pick.mjs notes <id> <workdir>/facts.json`: Gemini
    watches the video (free tier). Zero facts or an error = skip the pick and
    say so on the card. Never print or copy the key.
P4. WRITE: one fresh `model: "sonnet"` subagent with `STYLE.md` and that
    facts.json only. blocks = the video block `{type:"video", id, title,
    channel, channel_url}` from P2, then 2-3 paragraphs. dek is ONE sentence:
    `Video by <channel, full stops removed>: <blurb>.`, 90-160 chars.
    `persona_username: "tripfamy-picks"`, `hero` from P2, the country as
    `region`. No first person, nothing disparaging about the creator or any
    business, no scores; the people rule applies.
P5. EDITOR: fresh `model: "opus"` subagent cuts every claim it can't tie to
    a timestamp in facts.json, fixes the prose itself, then runs
    `node scripts/generate-stories.mjs lint <file>` until it passes (max 3
    passes, then skip).
P6. `node scripts/generate-stories.mjs insert <file>`. Log the video id, the
    channel and the Gemini token count in NOTES.md.

## News (every weekday run, after the 2 stories and any pick; NEWS-DESIGN.md, Oracle 6950)

One short upbeat news item in our own words: a new route, an opening, a reopening, a
festival. Nothing about crime, deaths, disasters, warnings, politics or deals. All
commands run in the travel-blog repo.

N1. `node scripts/news.mjs find 72` lists filtered items from the vetted outlets
    (`scripts/news-feeds.json`) plus `pairs`: the same event in two outlets. Choose
    one event reported on 2+ different domains, about one country on the COUNTRIES
    list. Nothing fits = skip news and say so in NOTES.md (no card). Never use Google
    News, the Guardian or a paywalled outlet.
N2. `node scripts/news.mjs page <url>` for each source: exit 1 (a wall, an error) =
    drop that source. Fewer than 2 left = choose another event.
N3. facts.json: `{claim, source_url, quote}` per fact, the quote copied exactly from
    the page text. No quote, no claim.
N4. Hero: `photos <query>` as in box 2 (our licensed pool), never the source's image.
N5. WRITE: one fresh `model: "sonnet"` subagent with `STYLE.md` and that facts.json
    only. blocks = `{type:"news", sources:[{name, url}, ...]}` (each outlet named as it
    names itself), then 3-4 paragraphs. dek is ONE sentence, 90-160 chars.
    `persona_username: "tripfamy-news"`, the country as `region`. No first person,
    nothing copied: our own words.
N6. EDITOR: fresh `model: "opus"` subagent cuts every claim it can't match to a
    quote, checks every date against today (the Time rule), applies the people rule,
    fixes the prose itself, then runs `node scripts/generate-stories.mjs lint <file>`
    and `node scripts/news.mjs copy <file> <facts.json>` until both pass (max 3
    passes, then skip).
N7. `node scripts/generate-stories.mjs insert <file>`. Log the source URLs and the
    token count in NOTES.md.

## Cards

No card for clean runs. Card with `NEEDS YOU:` for unfixable defects.

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send --type dev-update ...
```

Never commit `.env.local`. Do not chain further tasks.
