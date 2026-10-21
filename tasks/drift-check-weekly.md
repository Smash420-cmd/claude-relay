# Drift check, weekly: deployed vs merged source

**cwd:** `C:/Users/pmdse/Projects/sojournly-v1` · **model:** claude-sonnet-5-5 · **effort:** medium · **cadence:** Monday 09:30 AEDT, after the 09:00 Lambda usage report · **Browser:** not needed

Oracle 12484 item 6 and 12504 (21 Oct 2026): an edge function sat undeployed for two days and the Lambda worker ran a
month-old bundle while 47 commits merged, and nothing said so. `scripts/drift-check.mjs` (merged in #572) compares what
is live with `origin/main`. This job runs it and tells the Oracle. It fixes nothing and deploys nothing.

## Steps

1. `git fetch origin` (do not check anything out; the checkout may be on another branch and may have local changes).
2. Run, from the repo root: `npm run check:drift -- --ref origin/main`. Let it finish (about 3 minutes: it downloads
   every edge function from Supabase into a scratch tree and rebuilds the Lambda bundle). Keep the full output.
3. Read the result lines (`<name>: SAME` / `<name>: DRIFT ...` / `lambda: SAME|DRIFT` / `RESULT:`).
   - Known, expected while `feat/home-v2` is unmerged (Oracle 12504): claude-proxy, init-trip-context, request-access,
     send-feedback-email and the Lambda live ahead of main. Say "expected (home-v2)" for those, not "drift".
   - `play-rtdn: DRIFT not live: SETUP.md` is noise (a doc, not deployable). Ignore it.
   - Anything else that says DRIFT, NOT DOWNLOADED, or a failed Lambda build is NEW and is the point of the report.
4. Report to the Oracle on the agents' group, one message:
   `python scripts/tg.py --agents send "@Agentic_Oracle_bot drift check <date>: <N> SAME, <list of expected home-v2 items>, NEW: <list or none>. Lambda: <SAME|expected (home-v2)|DRIFT: first differing lines>. RESULT line: <...>"`
   Keep it under 12 lines. If the run itself failed (no RESULT line), send the last 10 lines of output instead and say so.
5. If NEW drift exists, also append one row to `E:/sojournly-shared/agent-feedback/feedback.jsonl` as the CLAUDE.md
   asks (severity "bug", agent "relay/drift-check-weekly"); for an all-expected run, no feedback row.

## Never
Deploy, redeploy, `supabase functions deploy`, `lam.mjs deploy`, check out a branch, edit the repo, or touch the
Supabase project. Delete nothing. Post to Ops (Patrick's channel): this report is for the Oracle only.
