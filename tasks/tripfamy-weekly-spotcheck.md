# Tripfamy: weekly spot check (replaces the nightly QA sweep, Oracle 6777)

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** claude-sonnet-5-5 · **effort:** medium

1. `node scripts/generate-stories.mjs check-images`: every dead image URL on a live story (Pexels hotlinks can die after insert). Exit 1 = dead links listed.
2. Pick 3 random stories published in the last 7 days (service-role query, `.env.local`). None → skip to the card.
3. For each, follow `EDITORIAL_PIPELINE.md` box 6 (LOOK) deep pass, including server hygiene (reuse a healthy :3000, never run two): screenshot and look at every spread. Check each figure against its chapter's text and the country (legible text, logos, flags).
4. Fix **data only**: a dead or wrong photo is swapped by re-inserting the whole story through `generate-stories.mjs insert` (src, alt and caption together), never a partial SQL patch. **Never edit or commit code**; a renderer bug goes on the card as `NEEDS YOU: @Tripfamy_bot <story> <what>` with a screenshot path.

## Card

`--type dev-update`, archaic-hybrid, verdict-first: dead images found/fixed, 3 stories checked, defects found/fixed, `NEEDS YOU:` only if blocked. Clean week with no dead images → one line.

Do not chain further tasks.
