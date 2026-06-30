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

## ✅ Resolved (0.4.25) — `detectLimit` false positive, via Option A (API veto)

**Was:** `detectLimit` (`src/executor.js`) trips on a bare `"resets at"` anywhere in task output, so a task that prints "the cache resets at 02:00" was marked `stopped` → spurious auto-resume even on a clean exit. Same false-positive class as the phantom Jul-6 task.

**Fix — API as a *veto*, not a gate** (`isLimitFalsePositive` in `src/usage.js`, applied in `runDueTask`):
- **Logged in:** if the usage API is reachable AND **both** windows are clearly below a limit (< 90%), it's a false positive → relabel the run by its exit code, don't resume.
- **Logged out / API blip / incomplete data:** trust the text match (manual mode). A phantom there is harmless and cancelable.

Built as a veto (not "require ≥100% to resume") on purpose: a missed *real* limit means "came back to nothing," which is worse than a cancelable phantom — so the asymmetry always errs toward resuming. Threshold 90, not 100, to tolerate API rounding/lag. 8 assertions covering both-low, either-at-limit, threshold edges, and API-unavailable.

`detectLimit`'s text behavior is unchanged (still the manual-mode signal); the veto sits above it.

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
- ~~**`findResultSession` heuristic** (most-recent `.jsonl`) — can pick the wrong session if two are active at once.~~ **RESOLVED (0.4.26):** fresh runs now pin a session UUID up front via `claude --session-id <uuid>`, so the resume chain always targets the originating conversation. The heuristic is kept only as a last-resort fallback if a run created no session.
- **`tracker.snapshot` blend math** — the live%+token-delta estimate is untested (would need transcript fixtures).

---

## What's in `npm run check` now
Syntax check on all files → then `node test/run.js` (70 checks). One command, fails loudly if any load-bearing or security invariant breaks.
