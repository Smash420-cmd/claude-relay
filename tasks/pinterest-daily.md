# Pinterest daily pin — sojournly.au

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** opus · **effort:** high
**Browser:** required — this task must run with browser access enabled.

Publish one pin per day to Pinterest from Patrick's pre-approved photo pool.

## Read first, follow exactly

`.claude/context/pinterest.md` is authoritative. It carries the account details,
the image pool and its ratio table, the title/description rules, the board
mapping, the link, and the Never list. Read it before doing anything, and follow
it over anything summarised here.

Also read:
- `.claude/context/social-voice.md` — the writing voice. The description obeys it.
- `.claude/context/instagram-log.md` — the state file. Grep it for repeats,
  append to it at the end.

## Independent of Instagram (decoupled 2026-07-31)

This used to run inside the Instagram session, pinning whatever Instagram had
just posted, and skipping entirely whenever the Instagram post failed. That is
no longer true and must not be reintroduced:

- **Pick your own frame** from `D:/2026/pinterest-ready/lr-export/`. Do not wait
  for, read, or depend on the day's Instagram post.
- **An Instagram failure is irrelevant here.** Pin anyway.
- The same frame may appear on both platforms. The no-repeat rule is per
  platform — grep `pin:<filename>` only. An `own:<filename>` token means
  Instagram used it, which does not block you.

## The run

1. **List the pool.** `ls "D:/2026/pinterest-ready/lr-export/"` — the filename is
   the subject label. Patrick adds and labels new exports over time, so list it
   fresh every run; never trust a remembered inventory.
2. **Compute each candidate's ratio** (width ÷ height) and apply the ratio table
   in `pinterest.md`. Portrait lane only: **0.667–0.80 pins as-is**. Landscape
   belongs to Instagram; panoramas are never pinned.
3. **Reject repeats** — grep `instagram-log.md` for `pin:<filename>`.
4. **Open the image and describe it to yourself before writing a word.** Not a
   safety glance — this is the writing step. Name out loud what is actually in
   the frame: time of day, weather, what's lit, who's in it, what the road or
   sky is doing. The filename gives you the subject; only the picture gives you
   the caption. It also tells you whether a person is identifiable — still check
   that.
5. **Write title and description** per `pinterest.md`, obeying
   `social-voice.md` §"Write from the frame". The description is **anchored to
   this photograph but never describes it** — the reader is looking at the image,
   so naming what's in it is wasted. Take a visible thing and hang a fact on it
   that the eye can't supply. If the fact you want can't be reached from
   something in the picture, it's the wrong fact for this photo. Keyword-first
   title ≤100 chars aimed at what a trip planner would search; description ≤500
   chars, no hashtags. Run the read-back checklist — questions 1 and 2 are the
   ones that fail.
6. **Pin it** via the Claude-in-Chrome extension in Claude's own tab group. Never
   chrome-devtools. Never log in. Board by destination per `pinterest.md`.
   Link is always `https://sojournly.au/?utm_source=pinterest`.
7. **Log one `P` line** in `instagram-log.md`:
   `DATE | P | pin:<filename> | <board> | <title> | frame:<what you opened on> | link:ok`
   `frame:` is the visible thing the description hangs a fact on — a few words,
   e.g. `frame:pilings -> why rorbuer sit over water`. Not what the description
   describes; it never describes the image. It exists so the next run (and
   Patrick) can see at a glance whether the writing came from the photograph.
8. **Keep the last five descriptions** in this task's `NOTES.md` under
   `## Last five descriptions`, newest first, trimming to five. Read them before
   writing — they are the only way to notice your captions converging on one
   shape. The log line records that a pin happened; only this records how it
   read.

## When the lane is empty

If every portrait frame in the pool already carries a `pin:` token, **skip the
day**. Do not pin a landscape, do not re-pin, do not go to the raws. Send a card:

    node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
      --type note --title "Pinterest: out of portrait frames" \
      --body "Every portrait export in lr-export has been pinned. Nothing posted today. Label more portrait exports to resume." \
      --priority low

and append `DATE | P | pin:FAIL NEEDS-NEW-LABELS` to the log.

## Failure

Fail loudly, once. If the pin can't be published after a genuine attempt, append
`DATE | P | pin:FAIL <reason>` and send a `--type alert` card naming what broke.
Do not retry into a loop, do not post a substitute image, do not silently skip.

## Never

- Pin without the `sojournly.au` link.
- Create boards, change account settings, follow, or comment. Pinning only.
- Enter credentials or create accounts. If logged out, fail and say so.
- Touch `ANTHROPIC_API_KEY`.
