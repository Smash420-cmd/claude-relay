# Tripfamy: nightly visual QA sweep (new content)

**RETIRED (Oracle 6777).** Replaced by `tripfamy-weekly-spotcheck.md`; its guards moved into the validator and the box-4a editor. Do not reschedule.

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** claude-sonnet-5-5 · **effort:** high

NEW content only, deep pass. Read `EDITORIAL_PIPELINE.md` box 6 (LOOK),
including server hygiene — reuse a healthy server on 3000, **never run two**.

## Sweep

1. Query posts published in the last 24 hours (service-role creds in `.env.local`).
2. Open each of those story pages plus the feed, scroll top to bottom.
3. Screenshot and LOOK at every spread with vision.
4. Fix **data** defects per box 6: wrong-subject photos via the PHOTOS box +
   SQL, data-shape bugs via SQL. **Never edit or commit code**: the repo feeds
   the live site, which deploys from a clean clone. A renderer bug goes on the
   card as `NEEDS YOU: @Tripfamy_bot <story> <what>` with a screenshot path.

If no new stories in the window → exit quietly, no card.

## Gate calibration

Additionally pick ONE random story from the window and re-run the box-4
reader-sim gate on it as an independent judge. Report agree/disagree with the
original pass in the card — this measures whether the gate discriminates or
rubber-stamps.

## Card

`--type dev-update`, archaic-hybrid, verdict-first: stories checked, defects
found + fixed, calibration verdict, lint failures and editor passes from the
daily run's NOTES (count per story), `NEEDS YOU:` only if blocked.

Do not chain further tasks.
