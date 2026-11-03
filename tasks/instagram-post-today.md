# Instagram — finish today's story and post it on R2

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** high · **Browser:** R2 (`r2-browser` MCP, profile `social`)

From Wednesday 28 Oct 2026 (Patrick 24 Oct, Oracle 13495): the Monday session prepared today's folder; you pick up
Patrick's picks, edit the caption to them and post. Read, this session: `.claude/context/social-voice.md`,
`.claude/context/instagram.md` §3a, §4, §7 and §9, and today's folder. Nothing from any other day, except an APPROVED
pick's photo for the pin (below).

## The folder
`social-assets/queue/<today>/instagram/`, `<today>` = `date +%F`: `day.json`, `candidates/` (+ `numbers.json`,
optional `graded/`), `research.md`, `caption-draft.txt`, or on a reel day `reel.mp4`.

## Stop rules: post nothing, send ONE line, end
- `.claude/context/instagram.md` opens with a STAND-DOWN note → post nothing, send `python scripts/tg.py send "Instagram: stood down, nothing posted."` and end. Check this first, before reading the day folder.
- No folder or no `day.json` → `python scripts/tg.py send "Instagram: nothing prepared for <today>, nothing posted."`
- Photo day (`own`/`pexels`) with no APPROVED line for `<today>` in `.claude/context/photo-approvals.md` →
  `python scripts/tg.py send "Instagram: no picks for <today> (<place>), nothing posted."`
- Reel day with `day.json` `blocked` → `python scripts/tg.py send "Instagram: <today> reel blocked: <reason>, nothing posted."`
- `browser_open` fails or the profile shows no **Edit profile** → `browser_signin` with `site: "instagram"`, `profile: "social"`
  once; anything but signed-in → `python scripts/tg.py send "Instagram: signed out on R2, nothing posted."`
- A step refused, or the dialog goes wrong → close the dialog (its X, then Discard), `browser_stop`,
  `python scripts/tg.py send "Instagram: <what failed>, nothing posted."`. Never press Escape, never retry the Share.

## Finish the story (photo day)
**Already built?** If `manifest.json` exists with `"status": "ready"`, the day was finished in session with Patrick
(slides `01`-`04`, `caption.txt`, `review.md`, `log-line.txt`). Open every slide and look at it, then go straight to
Post with those files. Do not rebuild a slide or touch `caption.txt`.

1. His picks are the APPROVED line's numbers, in his order. For each, `candidates/graded/NN.jpg` if it exists, else
   `candidates/NN.jpg`. Never a swap, never a number he did not pick.
2. Build `01.jpg`-`03.jpg` from them and the app slide `04` exactly as instagram.md §3a says (`scripts/carousel_slide.py`).
   Open every slide and look at it.
3. Edit `caption-draft.txt` into `caption.txt`: resolve every `[PHOTO: …]` against the frames he picked (social-voice.md:
   the photo is the scene; only what these photos show), keep every fact to `research.md`, credits by slide number
   from `numbers.json`. Write the review passes into `review.md` until a pass finds nothing.
   No `caption-draft.txt` (the 28 Oct week was laid out before drafts existed): research the place (instagram.md §3,
   social-voice.md) and write the caption from scratch, sources in `research.md`.
4. Write `log-line.txt` (§7) and `manifest.json` (§9) with `"status": "ready"`.
Reel day: `caption-draft.txt` becomes `caption.txt` after one review pass against the video (§2); slides = `reel.mp4`.
No `caption-draft.txt` on a reel day: write it from scratch per instagram.md §2.

## Post (job `daily-post` on every click)
1. `browser_open` `https://www.instagram.com/sojournly.au/` with `profile: "social"`; `browser_read`; note the post count.
   **Already posted?** Open the newest post. If its caption begins with the first line of `caption.txt`, a run before this
   one posted it: skip to Record with that URL, post nothing (a crash between Share and Record must not post twice).
2. `browser_click` **Create** (New post), then **Post**.
3. `browser_upload` with the dialog's file-input ref, `files` = the manifest's slides (or the reel) in order, full paths.
4. Crop: the expand icon → the manifest's `crop` (**4:5** or **Original**); `browser_screenshot`: nothing cut.
5. **Next**, **Next**, reading after each so the header shows the new step.
6. `browser_type` the whole of `caption.txt` into the caption field, unchanged.
7. `browser_screenshot` with `fullPage`: slides in order, crop, caption.
7b. **Before Share: Share to Facebook OFF.** On the caption screen Instagram web shows a "Share to Facebook" toggle and
   turns it ON by default, which cross-posts to the linked personal Facebook profile as Public. Switch it OFF and take a
   screenshot that shows it off, then Share. Can't find the toggle: stop, post nothing, and report
   `stopped: share-to-facebook toggle not found` with the screenshot.
8. `browser_click` **Share**. Read until "Your post has been shared"; click **Done**.
9. `browser_open` the profile again: count up by one, newest post first; open it, read the URL and check the slide order
   and the caption. Different order or missing text → send the line `Instagram: posted but <what differs>: <url>`.
10. `browser_stop`.

## Record
- `manifest.json`: `"status": "posted"`, `"posted_url"`, `"posted_at"` (ISO, local).
- Append `log-line.txt` to `.claude/context/instagram-log.md` with `<url>` filled in.
- Append to `.claude/context/photo-approvals.md`: `<today> | POSTED | instagram | <slides> | <url> | <folder>`.
- `python scripts/tg.py send "Instagram posted: <url>"`.

## Pinterest is not yours
From 3 Nov 2026 the whole week's pins are built in one session (social-weekly-candidates.md §2c) and the 14:00 poster
uploads them. Never write, edit or delete anything under `social-assets/queue/<date>/pinterest/`.

Never type a password or a code, touch `ANTHROPIC_API_KEY`, change `caption.txt` after its last review pass, use a
photo he did not pick, or post from any other day's folder.
