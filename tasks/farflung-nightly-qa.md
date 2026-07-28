# Farflung: nightly visual QA sweep (new content)

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** sonnet · **effort:** high

NEW content only, deep pass. Read `EDITORIAL_PIPELINE.md` box 6 (LOOK),
including server hygiene — reuse a healthy server on 3000, **never run two**.

## Sweep

1. Query posts published in the last 24 hours (service-role creds in `.env.local`).
2. Open each of those story pages plus the feed, scroll top to bottom.
3. Screenshot and LOOK at every spread with vision.
4. Fix defects per box 6: wrong-subject photos via the PHOTOS box + SQL,
   data-shape bugs via SQL, renderer bugs in code — commit code fixes,
   **never** `.env.local`.

If no new stories in the window → exit quietly, no card.

## Gate calibration

Additionally pick ONE random story from the window and re-run the box-4
reader-sim gate on it as an independent judge. Report agree/disagree with the
original pass in the card — this measures whether the gate discriminates or
rubber-stamps.

## Card

`--type dev-update`, archaic-hybrid, verdict-first: stories checked, defects
found + fixed, calibration verdict, `NEEDS YOU:` only if blocked.

Do not chain further tasks.
