# Social weekly batch — write the week's posts into the queue

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** high · **Browser:** not needed
**When:** Wednesday 09:00, after Monday evening's candidates and his picks, before the Wednesday post. The week is
Wednesday to Tuesday (Patrick 12229/12233, Oracle 12231/12234). **Late picks:** if his numbers arrive after this run, the
Oracle runs this task by hand; until then the poster finds no folder and says so. **First cycle:** Wed 21 Oct 18:00, or
as soon as the picks are in, for Thu 22 to Tue 27; the regular cycle starts Wed 28 Oct 09:00.

One session writes every Instagram post and Pinterest pin for the week, from the photos he approved, following
the playbooks exactly as a daily run would. Nothing is posted here. The daily posters (`instagram-post-today.md`,
`pinterest-post-today.md`) only upload what this task leaves in the queue.

## Read, in full, this session
`.claude/context/social-voice.md`, `.claude/context/instagram.md`, `.claude/context/pinterest.md`,
`.claude/context/feature-problems.md`, `.claude/context/brand.md`, `.claude/context/photo-approvals.md`,
`.claude/context/instagram-log.md`, and `social-assets/queue/<week-start>/plan.json` (week-start = the Wednesday; the first week is `2026-10-22`). Playbooks win over this file.

## For each day in plan.json, each platform
1. **Approval gate.** A **reel day** (plan.json `type: reel`, the weekly A short) needs no photo pick and has no gate:
   always write its folder, with `approved` = `<date> | REEL | instagram | weekly A reel, no photo pick needed` (23 Oct
   2026: the gate below skipped the Mia reel day, so nothing posted; Oracle 13091). Every other day: find the APPROVED
   line for that date and platform in `photo-approvals.md`. None, or REJECTED: write
   nothing for that day; it is a skip, and the poster will say so. Exactly the approved numbers, in his order; never a swap.
   **His Lightroom grade wins:** if `social-assets/approvals/<week-start>-week/graded/NN.jpg` exists for a picked number,
   use it in place of the candidate (Patrick 12233); otherwise the plain candidate. Say which in `review.md`.
2. **Instagram, `own:` or `pexels:`:** build the 3 photo slides with `scripts/carousel_slide.py` and the app slide per
   instagram.md §3a (rules 1–8: story first, every slide different, pill on slide 1 only, one line of 6–8 words, lead with
   the strongest frame). Research the place, then write the caption per instagram.md §4 and social-voice.md, with the
   review passes written out in `review.md`. Pexels credit by slide number.
   **Reel day:** copy the short from `Completed Ads/` into the folder unchanged (instagram.md §2); watch it; write its caption.
   If the file is over 50 MB, write the folder with `"status": "blocked"` and `"blocked": "reel over the 50 MB upload cap"`.
3. **Pinterest:** the pin's photo is one he picked for Instagram that week (Oracle 12230): an own-frame pin day takes an
   `own:` pick, a Pexels pin day a Pexels pick, preferring that day's place, `pin:` token unused (the rule is per platform,
   so the same photo on both is fine). Crop to portrait with `scripts/smart_crop.py` and open the result; nothing already
   0.667–0.80 is cropped. Keep the full pixels; Pinterest refuses files over 20 MB and a full Lightroom export is 25 MB
   (dry run 21 Oct 2026), so only a `pin.jpg` over 20 MB is touched: re-saved at the same pixels with JPEG quality
   lowered until it is just under 20 MB. Every other file is copied as is (Patrick 21 Oct). No approved photo fits: no pin folder for that day. Title ≤100 chars keyword-first on ONE line (no line break: the title and link fields are single-line), description ≤500 chars ending
   `Plan it. Live it.` (then the Pexels credit), board by destination, link `https://sojournly.au/?utm_source=pinterest`
   (pinterest.md §2). Research first, review passes in `review.md`.
4. **Write the folder** `social-assets/queue/<date>/instagram/` or `/pinterest/`:
   - the slides `01.jpg` … `04.jpg` (or `reel.mp4`), or `pin.jpg`
   - `caption.txt`: the caption exactly as it is to be typed (Instagram: caption + credit line + hashtags;
     Pinterest: the description only)
   - `log-line.txt`: the one `instagram-log.md` line for this post, with `frame:` and the fact, URL left as `<url>`
   - `manifest.json`:
     ```
     { "platform": "instagram", "date": "2026-10-27", "type": "pexels", "place": "Ha Long Bay, Vietnam",
       "approved": "2026-10-27 | APPROVED | instagram | 01, 03, 04 | <folder>", "slides": ["01.jpg","02.jpg","03.jpg","04.jpg"],
       "alt": ["...", "...", "...", "..."], "hashtags": ["#halongbay", "..."], "crop": "4:5",
       "credits": "Photos on Pexels: 1 A · 2 B · 3 C", "status": "ready" }
     { "platform": "pinterest", "date": "2026-10-27", "type": "own", "place": "Osaka, Japan",
       "approved": "<the APPROVED line>", "image": "pin.jpg", "title": "...", "board": "Japan",
       "link": "https://sojournly.au/?utm_source=pinterest", "alt": "...", "status": "ready" }
     ```
   `status` is `ready` only when every file above exists and the review passes are clean.
5. **Check the whole week** at the end: no country two Instagram posts running, every Pexels ID and `pin:` token unused,
   the motto and the two brand lines on every caption, one credit per Pexels slide.

## Report
One line per day: date, platform, type, place, status. Nothing to Patrick: the posters talk to him.
Any Instagram day left without a folder (no APPROVED line yet): also send ONE line to the agents group,
`python C:/Users/pmdse/Projects/sojournly-v1/scripts/tg.py --agents send "Social batch: no Instagram folder for <dates>, waiting on picks"`, so the Oracle
can chase the picks days ahead instead of the poster finding an empty day (23 Oct 2026).

## Never
Post. Write to `instagram-log.md` or mark anything POSTED (the posters do that). Use a photo outside the APPROVED line.
Edit a queue folder dated today or earlier. Touch `ANTHROPIC_API_KEY`.
