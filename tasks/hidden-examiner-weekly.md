# Hidden Examiner weekly test (CLI, on Max)

**cwd:** `C:/Users/pmdse/Projects/Find-me-harness-GUI` · **model:** opus · **effort:** high

Autonomous weekly test for the Find-me-harness Hidden Examiner.
Branch `006-hidden-examiner`. Run `npm run build` first.

## STEP 0 — you have a 45-minute wall clock. Budget for it.

Relay kills any task at **45 minutes**, hard, from `src/executor.js`. It is not
configurable per task, auto-resume does **not** cover it (that only fires on usage
limits), and the kill is silent — no card is sent, and the task re-arms for next
week looking healthy.

This is what killed the 2026-07-29 run: 40 minutes of real work on T3, one banked
submission, no commit, nothing reported. Verified from the transcript — it was
working, not hung, right up to the kill.

So:

- **Check the clock as you go.** Note your start time and treat 35 minutes as the
  point where you stop starting new work.
- **Commit incrementally.** Never hold a batch of results uncommitted while a long
  exam runs — a kill takes all of it. Commit each episode batch or each finished
  step as you get it.
- **Land a card before the cap**, even mid-test: what ran, what banked, what's left.
  A partial report beats silence.
- **Size the run to fit.** `scripts/exam-cli.mjs --episodes N` — each episode is its
  own `claude -p` call, so N drives the wall clock more than anything else. If the
  first unchecked test can't fit, run a smaller `--episodes` slice, commit it, and
  say plainly in the card how many remain. Do not start an 8-episode batch at
  minute 30.
- **Do not cascade** into a second test unless the first finished with 15+ minutes
  spare. The cascade permission below is subordinate to this rule.

## STEP 0b — prime Relay auto-resume

It only bounces when primed. Arm it so that if this run hits the 5-hour OR
weekly Max limit mid-test, it resumes at the next reset and continues until the
test finishes. (`~/.claude/commands/relay-autoresume.md`)

Note what this does and doesn't buy you: it covers **usage limits only**. The
45-minute wall clock above is a different failure and auto-resume will not save
you from it.

## Then

Read `specs/006-hidden-examiner/TEST-PLAN.md` and FOLLOW IT EXACTLY: do only the
**first unchecked test**, obey every iron rule, then stop.

**Preferred path** is the CLI student (`scripts/exam-cli.mjs`), which runs on the
Max plan for free: each episode is one `claude -p` whose only tools are the world
MCP server.

**Student model is `claude-opus-5`** (Patrick, 2026-07-29 — was sonnet; the default
in `exam-cli.mjs` is now pinned to the full ID). Two consequences:

- **The ~3.1 min/episode baseline is void.** It was measured on sonnet and is what
  produced the "6 episodes safe, 8 the ceiling" rule for the 45-minute cap. On the
  first Opus 5 run, **time a single episode before launching a batch**, then size
  the batch from that number and record it in NOTES.md.
- **Scores before and after are not comparable.** T1–T3 were sonnet. Any Opus 5
  result is a new curve, not a continuation — say so in the card rather than
  reading it as compounding. On the first live run, confirm the claude flags actually restrict to
the 7 world tools (built-ins hidden) and that scores land in
`students/<id>/submissions.jsonl`. If a flag is wrong, FIX `scripts/exam-cli.mjs`
and note it — that is expected shakedown, not failure.

## BLOCKED — do not start T4 until Patrick rules

T3's run raised two things that make T4 meaningless if ignored. Both need Patrick,
not you. If T4 is the first unchecked test and these are still open, **do not run
it** — send a card asking for the rulings and stop.

1. **`worlds/books-v1` is signed but was never reviewed.** `key.json` carries
   `certifiedBy: Patrick, certifiedAt: 2026-07-04`, yet every checkbox in
   `REVIEW-KEY.md` is unticked — all 5 truths and all 8 traps. The file's own
   instruction is to open each screenshot, tick, *then* sign. Consequence:
   `booksamillion` and `thirdplacebooks` are truths that `search` never returns
   (their pages exist in `capture/` and `fetch/` — reachable only if you already
   know the URL). A student that cannot discover them cannot submit them, so the
   `passMark: 0.9` may be unreachable by construction. Whether that is a world bug
   or the actual test is Patrick's call.
2. **Four open rulings sit unresolved** at the bottom of `REVIEW-KEY.md`: whether
   used hardcovers (HPB, ThriftBooks) count as truths given the request says "buy
   NEW"; whether `jamesclear.com` is a category-page trap; whether the B&N URL is
   really the hardcover in stock; and whether mcnallyrobinson is genuinely a
   ghost. Each changes the truth set, and therefore every score.

Until these land, T3's 0.6667 is a score against an uncertified key.

## Hard rules

- Never use the business `ANTHROPIC_API_KEY`.
- Never pass a Pro/Max OAuth token to the SDK — `studentClient` refuses it; that
  pattern gets accounts suspended. The CLI path uses the official `claude`
  binary directly, which is permitted.
- Never commit `students/` or `worlds/` (gitignored scraped content).

## Measure the burn

Report it prominently at the top of the results file and in the Log: total
tokens/turns, wall-clock, and especially **what fraction of the weekly Max quota
one test consumed** — that governs future scaling.

If a test is cheap and **15+ minutes of the 45-minute wall clock remain**, cascade to
the next unchecked test. Otherwise stop and report — see STEP 0.

## Record

Results → `specs/006-hidden-examiner/results/<test>.md`, tick the box in
`TEST-PLAN.md`, append a one-line Log finding, commit and push.

When all tests are ticked, note completion at the top of `TEST-PLAN.md` so
Patrick can cancel this recurrence.
