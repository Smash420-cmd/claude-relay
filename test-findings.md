# Test Suite — Findings & Security Audit (0.4.24)

Added `test/run.js` — 70 assert-based checks, no framework, runs inside `npm run check`. Covers the **load-bearing, unwatched logic**: the math that decides *when* a walked-away job resumes, the detector that decides *whether* it resumes, and the security scrub that decides what a headless task can see.

To make the buried logic testable, `normPct` + `pickResetAt` were extracted from `main.js` into a pure `src/usage.js` (no Electron), and the secret-scrub became exported helpers in `executor.js`. That extraction is *why* these are now testable at all — the `normPct` bug shipped twice because it was unreachable from a test.

---

## 🔴 Real bug the suite caught — FIXED immediately

**Secret leak: `PGPASSWORD` (and concatenated password vars) bypassed the env scrub.**
`src/executor.js` — the old pattern `(^|_)(…PASSWORD…)$` required an underscore *before* `PASSWORD`. `PGPASSWORD` (the standard Postgres password variable) has none, so it would have been handed to a headless task running with `--dangerously-skip-permissions` — exactly the exfiltration path the scrub exists to close.

**Fix applied:** split the patterns —
- **Strong suffixes** (`PASSWORD|PASSWD|SECRET|CREDENTIALS?|TOKEN`) match with no boundary, catching concatenated forms like `PGPASSWORD`.
- **Weak suffixes** (`KEY|PASS|PAT|DSN|AUTH`) still require a start/underscore boundary, so real words (`MONKEY`, `COMPASS`) and the Unix working-dir `PWD` are **not** stripped.
- Added value-shaped secrets: `DATABASE_URL`, `*_CONNECTION_STRING`, `MYSQL_PWD`.

Locked in with 26 strip/keep assertions.

---

## 🟠 Known issue — documented, needs your decision (not auto-fixed)

**`detectLimit` trips on a bare `"resets at"` anywhere in task output.**
`src/executor.js:50` — `LIMIT_RE` includes `resets?\s+at`, so a task whose *own* output contains "the cache resets at 02:00" is marked `stopped` → fires a spurious auto-resume, even on a clean exit. This is the brittleness the magazine review flagged ("string-matching against another vendor's UI copy"), and it's the same false-positive *class* as the phantom Jul-6 task.

I left this for us to discuss because the fix has a real trade-off:
- **Option A — corroborate with the API:** only treat a stop as a limit if `fetchClaudeUsage()` also reports ≥100%. Strongest, kills false positives, but couples detection to a network call.
- **Option B — tighten the regex:** require limit-context words near "resets at" (drop the bare alternative). Cheap, but may miss a reworded real limit.
- **Option C — only check the *last* N lines** of output (limits appear at the end, not mid-run). Cheap, narrows the window.

My lean: **A**, because it's the authoritative signal and we already fetch it for the reset time anyway.

---

## ✅ Security audit — what the suite now proves

| Invariant | Status |
|-----------|--------|
| `ANTHROPIC_API_KEY` always stripped before spawn (cost-safety, CLAUDE.md mandate) | ✅ tested |
| Name-shaped secrets stripped (`*_KEY/_TOKEN/_SECRET/_PASS/_PAT/_DSN`, `PGPASSWORD`, `MYSQL_PWD`) | ✅ tested |
| Value-shaped secrets stripped (`DATABASE_URL`, connection strings) | ✅ tested |
| Benign vars preserved (`PATH`, `PWD`, `HOME`, npm config…) | ✅ tested |
| `scrubSecrets` does not mutate `process.env` | ✅ tested |
| `buildArgs` never injects a key; `--dangerously-skip-permissions` only when opted in | ✅ tested |

Not re-audited in code this pass (covered by the magazine review, no change made): the `sessionKey` cookie lives in Electron's DPAPI-encrypted Chromium store and is sent only to `claude.ai`; no token touches the task store or logs. `skipPermissions` defaults **on** — a deliberate posture required for unattended runs, documented in code + welcome modal.

**Bottom line on your one wish:** no secret-exposure flaw found that the scrub doesn't now close, and the one real gap (PGPASSWORD) is fixed and regression-tested.

---

## Coverage gaps still open (for discussion — none are security flaws)

- **`store.js` migration + concurrent write** — not unit-tested (needs an Electron-path mock). The last-write-wins edge between app + CLI is real but tiny for a single user.
- **`findResultSession` heuristic** (most-recent `.jsonl`) — can pick the wrong session if two are active at once. Affects "resume the right conversation," not security.
- **`tracker.snapshot` blend math** — the live%+token-delta estimate is untested (would need transcript fixtures).

---

## What's in `npm run check` now
Syntax check on all files → then `node test/run.js` (70 checks). One command, fails loudly if any load-bearing or security invariant breaks.
