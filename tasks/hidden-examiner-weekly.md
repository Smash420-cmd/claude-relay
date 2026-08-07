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

**All four tests in `specs/006-hidden-examiner/TEST-PLAN.md` are ticked.** The
"do the first unchecked test" rule no longer applies — the job is the section
below. Read the TEST-PLAN's iron rules anyway; they still bind.

**Preferred path** is the CLI student (`scripts/exam-cli.mjs`), which runs on the
Max plan for free: each episode is one `claude -p` whose only tools are the world
MCP server.

**Student model is `claude-opus-5`** (Patrick, 2026-07-29; the default in
`exam-cli.mjs` is pinned to the full ID).

- **Opus was timed on 2026-08-07: ~3.5 min/episode** — 3.9 for the first (cold
  start), ~3.3 after. The old sonnet "~3.1 min, 6 safe / 8 ceiling" rule is dead.
  Current rule for a 45-minute run: **6 episodes safe, 7 the ceiling**. Size from
  3.9 for episode one and 3.4 for the rest. If a run re-records the world first,
  subtract that time before sizing anything.
- **Scores are not comparable across key changes or across models.** T1–T3 were
  sonnet on a 5-truth key; T4 was Opus on a 3-truth key. Every key edit resets the
  curve. Say so in the card rather than reading any of it as compounding.

## THE JOB THIS WEEK: re-run RAM (exam #1) against the newly certified key

**Read `specs/006-hidden-examiner/TEST-PLAN.md` T6 first, then this.** The books-v1
re-record (T5) is NOT this week's job — it has been deferred behind this.

### Why this and not books

`worlds/ram-v1` is **exam #1, the graduation gate**: Spec 007 C8 says passing it is
what graduates the protocol, and generality (books) is only claimed afterwards.
**It has never been passed** — best ever is 0.6087 by `cc-01` over 5 episodes,
on sonnet, in a curve that got *worse* (0.6087 → 0.5652 → 0.5652 → 0.3913 → 0.5652).

Until 2026-08-07 that number was untrustworthy: `REVIEW-KEY.md` had 129 boxes and
zero ticked while `key.json` was signed `2026-07-04`. All 83 proof shots have now
been opened and the key re-signed `certifiedAt: 2026-08-07` (commit `24379e7`).
Two truths were demoted — both had been penalising a *correct* student. So a RAM
run now is the first trustworthy learning signal this project will have had.

### Current bars (recomputed after certification)

| exam | truths | scale | must show |
|---|---|---|---|
| `ddr4-open` | 34 | 35 | 31 of 34, zero traps |
| `ddr4-gskill` | 22 | 23 | 20 of 22, zero traps |
| `ddr5-6000` | 33 | 34 | 30 of 33, zero traps |

All comfortably above `MAX_SUBMISSIONS: 3`, so the enumeration guard will not trip
and the books-v1 failure mode cannot recur here.

### Do this

1. `npm run build`, then **verify the world before spending anything**: `key.json`
   must read `certifiedAt: 2026-08-07` with 34/22/33 truths. `worlds/` is gitignored,
   so if it has reverted to 35/22/34 and `2026-07-04`, **STOP and card Patrick** —
   do not run against the old key.
2. **Time one episode first.** Opus measured ~3.5 min/episode on books
   (3.9 cold, ~3.3 after), but RAM boards are far larger — do not assume the number
   transfers. Size the batch from what you actually measure.
3. Run `scripts/exam-cli.mjs` against `ram-v1` with a **fresh student id**, one
   `--episodes N` increment per Bash call, committing after each.
4. Record into `specs/006-hidden-examiner/results/t6-ram-recertified.md`. The
   question is not only "does it pass" but **does anything compound across
   episodes** — that is what T2/T3 failed to find and T4 never tested.

### Flag, do not fix

The bar demands showing 31 of 34 truths with zero traps, for a request phrased
"find me a 32GB DDR4 kit ... that I can actually buy right now". That is closer to
"enumerate the catalogue perfectly" than "find me one". **Patrick has not ruled on
whether that is the intended task.** Report what the run implies about it; do not
change `passMark` or the weights to make a number move.

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
