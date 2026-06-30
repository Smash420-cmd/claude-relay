# Code Review Follow-ups — 0.4.20

Triaged from `relay-code-review.html` (20 findings). Below: what I fixed, what needs **your decision**, and what I deliberately **ignored** with reasons.

---

## ✅ Fixed this pass

| # | Finding | Fix |
|---|---------|-----|
| 1 | `fetchClaudeUsage` pct on 0–1 scale, compared `>=100` — autoresume could never fire | normalise via `used_percentage ?? utilization*100` (main.js:34–35) |
| — | `relay:capture-session` called removed `scheduler.nextResetDate(settings.dailyResetTime)` — **hard crash** on the live-gauge "Resume at reset" shortcut | rewritten to `pickResetAt(usage)` + `nextSessionReset` fallback |
| 11 | Reset-time resolution copy-pasted in 4 places | extracted `pickResetAt(usage)` helper, all 4 call it |
| 5 | `fs.watch` errors swallowed in `watchStore`/`watchRelayDir` | log via `console.error` |
| 3 | Spawn env leaked every secret except `ANTHROPIC_API_KEY` | name-pattern strip of `*_KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL` before spawn (executor.js) |
| 9 | 3 identical skill-writer functions | one `writeSkill(filename, content)` helper |
| 4 | Task-action handler duplicated (list buttons vs context menu) — already drifted | extracted `handleTaskAction(id, action)`, both use it |
| 17/20 | Settings migration left obsolete `dailyResetTime` key (the thing that crashed capture-session) | `delete db.settings.dailyResetTime` on v3 migration |
| 19 | Scheduler silently drops ticks when a run overruns the interval | `console.warn` on slow tick |

Logic checks for the two non-trivial fixes (secret regex, `pickResetAt`) pass — see commit.

---

## ⏸️ Deferred — needs your decision

### D1. `resume-compact` mode is dead code (finding #14)
`executor.js` logs *"resume-compact not yet wired — running as resume-full"* but it's still selectable nowhere visible... actually it's **not** in the UI dropdown (only `fresh` / `resume-full`), so the branch is unreachable from the app — only reachable via the CLI `--mode resume-compact`.
- **Option A (lazy):** delete the `resume-compact` branch + log line entirely. Nothing uses it.
- **Option B:** actually wire `/compact` before resuming (real feature).
- **My rec:** A. Delete it. You can add real compaction later when there's a reason. Say the word.

### D2. `openNewTask` / `openEditTask` — 245 lines of near-duplicate (finding #10)
Merging into `openTaskModal(task = null)` is the single biggest dedup win (the action-handler drift bug came from exactly this pattern). But it's a large churn in a no-bundler vanilla renderer with **no test harness** — regressions would only surface by clicking through the UI.
- **My rec:** do it as its own focused change so it can be verified live in the app (`/run` after). Didn't bundle it with bug fixes to keep this diff reviewable. Want me to do it now?

---

## 🚫 Ignored — with reason

| # | Finding | Why ignored |
|---|---------|-------------|
| 2 | "Store re-parses JSON every op — perf death spiral" | Store is a few KB read on a 20 s tick — microseconds. The real per-tick cost is `tracker.snapshot` reading transcripts, not `store.load`. Caching adds aliasing risk for **zero measured benefit**. Revisit if task counts hit thousands. |
| 6,7,8,12 | "Consolidate `nextSessionReset`/`currentSessionId`/`findSessionCwd`/`uid`/`userDataDir` into shared `src/utils.js`" | `scripts/relay.js` is **intentionally standalone** — it runs as a bare Node CLI outside Electron (shipped via `asarUnpack`). `src/paths.js` `require('electron')`, so relay.js *can't* import the src modules. The duplicated helpers are 1–3 lines each; a new electron-free shared module is more machinery than the dup costs. (Agent's finding #12 was also just wrong — paths.js is not pure Node.) |
| 9 (med) | "`writeRelayConfig` only syncs one setting" | **Intentional.** `config.json` is the skill-readable surface; only `skillAutoResumeOnLimit` is consumed by skills. Writing all settings (incl. `skipPermissions`) to a world-readable file is *more* exposure, not less. Minimal is correct. |
| 13 | "`RESET_AT_RE` regex too narrow" | The Claude **API** reset timestamp is now authoritative for scheduling. `resetHint` is a logged fallback only — broadening the regex is speculative polish on a non-critical path. |
| 16 | "`collectTurns` loads entire history, no cap" | Already bounded: line 61 skips any file with `mtime < sinceMs`, and callers pass a 5 h / 7 d window. No unbounded scan exists. |
| 17 (low) | "`readMeta` reads whole file" | Agent itself said "no action needed" — the `break` already short-circuits once slug+cwd+preview are found. |
| 18 | "Unsafe `task.schedule` access in handlers" | The one real crash path (`capture-session`) is fixed above. The rest already guard with `task.schedule || {}` (scheduler.dueTime) or run on store-validated data. |

---

*Generated during goal-driven review pass · 0.4.20 → pending 0.4.21*
