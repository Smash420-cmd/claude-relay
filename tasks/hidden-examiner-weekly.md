# Hidden Examiner weekly test (CLI, on Max)

**cwd:** `C:/Users/pmdse/Projects/Find-me-harness-GUI` · **model:** opus · **effort:** high

Autonomous weekly test for the Find-me-harness Hidden Examiner.
Branch `006-hidden-examiner`. Run `npm run build` first.

## STEP 0 — prime Relay auto-resume immediately

It only bounces when primed. Arm it so that if this run hits the 5-hour OR
weekly Max limit mid-test, it resumes at the next reset and continues until the
test finishes. (`~/.claude/commands/relay-autoresume.md`)

## Then

Read `specs/006-hidden-examiner/TEST-PLAN.md` and FOLLOW IT EXACTLY: do only the
**first unchecked test**, obey every iron rule, then stop.

**Preferred path** is the CLI student (`scripts/exam-cli.mjs`), which runs on the
Max plan for free: each episode is one `claude -p` whose only tools are the world
MCP server. On the first live run, confirm the claude flags actually restrict to
the 7 world tools (built-ins hidden) and that scores land in
`students/<id>/submissions.jsonl`. If a flag is wrong, FIX `scripts/exam-cli.mjs`
and note it — that is expected shakedown, not failure.

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

If a test is cheap and window headroom remains, cascade to the next unchecked test.

## Record

Results → `specs/006-hidden-examiner/results/<test>.md`, tick the box in
`TEST-PLAN.md`, append a one-line Log finding, commit and push.

When all tests are ticked, note completion at the top of `TEST-PLAN.md` so
Patrick can cancel this recurrence.
