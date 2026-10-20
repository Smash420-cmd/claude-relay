# Social weekly candidates — the week's photos, numbered, to Patrick

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** high · **Browser:** not needed
**When:** Monday 18:00 (Patrick 12233: Monday to Tuesday to pick and grade in Lightroom); the batch
(`social-weekly-batch.md`) runs Wednesday 09:00, before the Wednesday post. The week is **Wednesday to Tuesday**
(Patrick 12223/12229, Oracle 12231/12234). **First cycle only:** Wednesday 21 Oct 2026 09:00, for Thursday 22 to
Tuesday 27 (Wed 21 is Ha Long Bay under the old task). The regular cycle starts Monday 26 Oct 18:00, for Wed 28 Oct to
Tue 3 Nov.

Patrick, 2026-10-20 (wires 12209/12211 via Oracle 12213): "create a full weeks posts all at once and then an agent just
uploads them daily from a folder". Photos still need his approval first (wire 12062): one numbered set for the week,
and silence is not consent. This task picks and sends; it writes no posts.

## Read, in full, this session
`.claude/context/instagram.md` (§1 chooser, §3 sourcing, §3a carousel), `.claude/context/pinterest.md` (§1 sources),
`.claude/context/photo-approvals.md`, `.claude/context/instagram-log.md`. Playbooks win over this file.

## 1. Plan the week: Wednesday to Tuesday (the first week: Thu 22 to Tue 27)
Run the instagram.md §1 ladder day by day for the dates, each day as if the earlier planned days were already in the
log (1 A reel, 1 `own:`, Pexels the rest; a country never two posts running). Run the pinterest.md §1 alternation the
same way for the pins (own frame / Pexels, from the last `P` line). Write the plan as
`social-assets/queue/<week-start>/plan.json` (week-start = the Wednesday; the first week is `2026-10-22`): `{ "days": [{ "date", "instagram": { "type": "reel|own|pexels", "place" }, "pinterest": { "type": "own|pexels", "place" } }] }`.
The reel day needs no photos: name the next unposted short from instagram.md §2.

## 2. Candidates, one numbered set for the whole week
Numbers run `01`, `02`, … across the week and never restart, so his reply is one list. **No separate pin candidates**
(Oracle 12230): each pin reuses a photo he picked for Instagram that week (the batch crops it portrait), so his picks
cover both platforms.
- `own:` Instagram day: 8 to 10 frames of one place from `D:/2026/pinterest-ready/lr-export/` (and its RAW day under
  `D:/2026/`), focus checked at 100% (instagram.md §3 Step 1), no family, none with an `own:` token in the log.
- each `pexels:` Instagram day: 4 photos of that day's place to pick 3 from (Patrick 12223: "about 3 per day"; the fourth
  is so one can be dropped and the carousel still has its 3), every ID unused in the log, 4:5-friendly, sharp at 1:1,
  photographer recorded (instagram.md §3, the API; never the website).
Export plain photos, no overlay, long edge 1600, as `NN.jpg` into
`social-assets/approvals/<week-start>-week/candidates/`, with `numbers.json` mapping each number to
`{ day, platform, source file or pexels id, photographer, photographer_url }`.

## 3. Send and record
Send the album to Ops with curl `sendMediaGroup` in groups of 10 (token `C:/Users/pmdse/keys/telegram-win11.token`,
chat -5179787047, never print it), each photo captioned with its number, then one `sendMessage`:
`@patrick the week's posts, Thu 22 to Tue 27: Thu Hoi An 01-04 pick 3 in slide order; Fri Osaka (own) 05-14 pick 3; … The pins reuse your picks. Graded versions go in social-assets/approvals/<week-start>-week/graded/ as the same number. Reply to the Oracle.`
Append to `photo-approvals.md`, one line per Instagram day:
`<date> | PENDING | instagram | candidates 01-04 | social-assets/approvals/<week-start>-week/candidates/`.
The Oracle writes his numbers back as APPROVED lines. A day he does not answer stays PENDING and gets no post, and no
pin from it either.

## Never
Send a photo you have not opened at 100%. Send a family frame. Post anything. Write to `instagram-log.md`.
Touch `ANTHROPIC_API_KEY`.
