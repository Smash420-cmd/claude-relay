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

## THE JOB THIS WEEK: re-record books-v1, then re-run T4

T1–T4 are all ticked. T4 passed 1.0000 on 2026-08-07 — but it passed for the
wrong reason, and Patrick ruled the same day to fix depth rather than accept it.
That fix is this week's work. **Do not treat the ticked T4 as the end of the
test plan.** Read `specs/006-hidden-examiner/results/t4-deeper-run.md` first.

### Why

`submit_answer` returns the numeric score on a miss, so a student can add one URL
per attempt and read off which ones belonged. With 3 truths and `MAX_SUBMISSIONS:
3`, that solves the board by enumeration with no domain knowledge and no learning
— two independent students did exactly that, one on its first ever episode
(`students/books-t4b/submissions.jsonl`: 0.5 → 0.75 → 1.0 in one episode). The
board got that narrow because the 2026-08-07 key ruling demoted two undiscoverable
truths, correctly, leaving only three.

Two guards are already committed (`6304aad`) — you do not need to write them:

- **`world-mcp` now refuses to start when `MAX_SUBMISSIONS >= truths`.** With
  `exam-cli.mjs` pinned at 3, the re-recorded world needs **at least 4 truths** or
  every episode dies at startup. That error is the guard working, not a bug —
  fix the world, do not lower the guard.
- **`recordingFetch` now falls back to the Playwright-rendered DOM** when plain
  HTTP fails, and `record-urls.mjs` warns by name when a truth ends up bodyless.

### Do this

1. **Read `worlds/books-v1/urls.json`** (13 items). Note that `booksamillion` and
   `thirdplacebooks` are now `trap:bot-wall`, matching the signed key.
2. **Add reachable NEW-hardcover sellers as `truth` items** until there are **5–6
   truths**, so the board is wider than the submission budget with margin.

   **Spread them across markets on purpose.** Spec 005: *"The harness engine is
   domain-free and region-free — it has no opinion on geography"*, with `region`
   ("AU" / "US" / "UK" / "global") a first-class spec field. Robustness in any
   market is the goal, so a truth set that spans US, UK, AU and CA tests more than
   a single-market one. books-v1 is currently US-heavy (amazon.com, christianbook,
   B&N) with one CA and one UK seller — widen the spread, do not narrow it.
   Candidates: **UK** Waterstones, Blackwell's, Foyles · **AU** Booktopia, Dymocks,
   QBD, Angus & Robertson · **CA** Indigo · **US** Bookshop.org, Powell's.

   Mixed currencies cost nothing in scoring — the judge reads only the URL set
   (`judge.ts` declares `priceAud` but never reads it). Verify each URL is the
   **HARDCOVER of ISBN 9780735211292**, not the paperback and not a bundle. A
   wrong-format URL added as a truth is the same class of error this whole
   exercise is fixing.

   Which sellers survive recording is an empirical question, not a guess — pick a
   spread, record, and let the bodyless-truth warning in step 3 tell you which ones
   are real. Over-supply the list so there are replacements when some wall.

3. **Re-record:** `node scripts/record-urls.mjs worlds/books-v1` (run `npm run
   build` first — the script reads `dist/`). Watch for the bodyless-truth warning.
   Any truth it names is undiscoverable: replace that seller or demote it. Do not
   sign a key over one.
4. **Review the key for real.** Open EVERY screenshot and confirm what it shows
   before ticking `worlds/books-v1/REVIEW-KEY.md`. The 2026-07-04 key was signed
   with every box unticked and notes written from URLs — that single shortcut cost
   this project three test runs. Then update `key.json` and re-sign
   `certifiedBy: Patrick`, `certifiedAt: <today>`.
5. **Re-run T4** against the rebuilt world. Record it as a NEW result file
   (`results/t4-rerun-<date>.md`), do not overwrite `t4-deeper-run.md`. Report the
   curve, whether the pass survives a wider board, and — the actual question —
   **whether the strategy is still in-episode hill climbing or something that
   compounds across episodes.**

### Budget honestly

Step 3 is live network capture and can eat 10+ minutes on its own. If the
45-minute cap is going to bite, **stop after step 4, commit the rebuilt world and
the reviewed key, and card what remains.** A correctly re-recorded world with no
T4 re-run is real progress; a rushed key is not. `worlds/` is gitignored, so say
explicitly in the card what exists only on the machine.

### Do not

- Do not lower `MAX_SUBMISSIONS` or raise/lower `passMark` to make a number move.
  Patrick chose re-recording over the cheap levers deliberately.
- Do not compare any result to T1–T3. Different truth set, different denominator,
  Opus 5 rather than sonnet — a fresh curve every time the key changes.

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
