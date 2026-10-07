# Tripfamy: weekly roster build (writer pool)

**cwd:** `C:/Users/pmdse/Projects/travel-blog` · **model:** claude-sonnet-5-5 · **effort:** high

Manage Tripfamy's writer pool (the pool exists for variety; never "community"
framing, EDITORIAL_PIPELINE ROSTER). **Write NO stories.** New writers'
`role_line` and bio carry no AI, persona or generated wording (STYLE.md).

Read `EDITORIAL_PIPELINE.md` section 'ROSTER task' and follow its rates exactly.

## Masthead

Exactly one Editor-in-Chief: staff, `stalwart: true`, `role_line 'Editor-in-Chief'`.
Check `scripts/personas.mjs` first — **never create a second**. Marcus Thompson
and Hiroki Tanaka are stalwarts; never retire a stalwart or the EIC.

## Recruit

- 3–5 new **freelance** writers per run (outside-life `role_line`
  + a sharp niche).
- **Staff: only 1–2 per month total.** Check when the last staff writer was
  added and skip staff creation unless a month has passed.
- Every new writer must differ from every existing author (`scripts/personas.mjs`
  + `personas/*.md`) on 3+ of: home region / occupation / what they notice /
  blind spot / sentence rhythm.
- Mechanical-constraint persona files, registered in `scripts/personas.mjs` including
  `type`/`stalwart` and 4 themes.
- **Portraits, automatic:** first retry every writer still on `avatar_url: null`, then make
  one for each new writer with the portrait script, exactly as EDITORIAL_PIPELINE ROSTER
  step 3 says: view it yourself, rerun once on a defect, upload and set the URL in this run.
  Never a stock photo. GPU busy (exit 75) = leave it null for the next run; a failure or a
  second defect = null plus a `NEEDS YOU:` card.
- Check the persona's home country has a keyword in `lib/regions.ts` —
  `metaRegion()` silently defaults to "Oceania" on no match.

## Attrition

- ~2 per 10 active freelancers per run, prefer those with ≥3 published stories.
- Staff ~1 per 3 months.
- Never drop below 2× the daily dial in castable writers.
- **Stagger rule:** never bulk-recruit AND bulk-debut a cohort in the same
  narrow window — spread first-publish dates across runs.

Commit everything together.

## Card

One line per new byline (name — staff/freelance — niche), one per retirement,
and announce the EIC if created. `--type dev-update`.

Do NOT write stories. Do NOT chain further tasks.
