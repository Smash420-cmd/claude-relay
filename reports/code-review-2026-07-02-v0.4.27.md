# /relay full app & code review — v0.4.27 (2026-07-02)

> **Status:** fixed in v0.4.28 (commit 68a8c22) — H1, H2, H3, M1–M5, L1, L3, L4, L7, L8.
> Deliberately not fixed: L2 (multi-org picker — needs a product decision), L5 (store-level `at`
> validation — renderer and CLI already validate; external writers are on their own),
> L6 (kept as intended behavior, documented in code).

Scope: main.js, preload.js, src/* (store, scheduler, executor, tracker, sessions, usage, paths),
renderer/app.js, scripts/relay.js, scripts/relay-statusline.js. Ranked most-severe first.

---

## High

### H1 — UI-created tasks silently lose their model/effort selection
`main.js:470-480` — the `relay:create` IPC handler builds the task object without `model` or
`effort`, but the renderer sends both in the payload (`renderer/app.js:458-467`). Every task
created through the **New task modal** runs on the CLI default model regardless of what the user
picked in the dropdown (including the settings default, which the renderer pre-fills into the
dropdown — it never survives create).
- Editing a task works (goes through `relay:update`, which patches wholesale), and the CLI works
  (`scripts/relay.js` sets `model`/`effort` directly) — which is why `test-models.js` never caught it.
- **Failure scenario:** user picks Opus 4.8 / xhigh in the New task modal → task runs on Sonnet
  default at default effort. Silent — the task row's Model/Effort info even shows "Default".
- **Fix:** add `model: input.model || null, effort: input.effort || null` to the task object in
  `relay:create`.

### H2 — Cancelling a running repeat task does not stop it
`main.js:486-491` + `main.js:198-231` — `relay:cancel` kills the child and sets status
`cancelled`, but the killed child's `close` event resolves `executor.runTask`, and `runDueTask`
then (a) overwrites status with the exit result and (b) hits the repeat re-arm block, which forces
`status: 'scheduled'` with the next occurrence.
- **Failure scenario:** user cancels a running daily task → seconds later it's back to `scheduled`
  and fires again tomorrow. The cancel appears to work in the UI, then quietly undoes itself.
- Pre-existing lesser version for `once` tasks: cancel-while-running shows `failed` instead of
  `cancelled` (cosmetic only — no re-fire).
- Related staleness: the re-arm writes the **closure** copy of `task.schedule`, so an interval
  edit made while the task was running is also overwritten.
- **Fix:** in `runDueTask`, re-read the task from the store after the run; skip the status
  overwrite and the re-arm if the stored status is `cancelled` (or the task was deleted), and
  re-arm from the stored schedule, not the closure.

### H3 — `child.kill()` doesn't kill the Claude process on Windows (shell:true)
`src/executor.js:120-125` spawns with `shell: ComSpec` — the child Relay holds is **cmd.exe**, and
`child.kill()` terminates only the shell; the `claude` node process underneath usually survives as
an orphan. This affects every kill path: task **Cancel** (`main.js:487`), **Delete**
(`main.js:494`), app **quit** (`main.js:696`), and the 45-min **timeout** (`executor.js:149`).
- **Failure scenario:** user cancels a runaway task → the UI says cancelled but claude keeps
  running headless with `--dangerously-skip-permissions`, editing files and burning session usage
  until it finishes on its own. Directly undermines the cost-guard promise.
- **Fix:** on win32 kill the tree: `execFile('taskkill', ['/pid', child.pid, '/T', '/F'])`.

---

## Medium

### M1 — Renderer polls the Claude.ai API every 5 seconds
`renderer/app.js:760` — `setInterval(refreshUsage, 5000)`, and each `refreshUsage` →
`fetchClaudeUsage` issues **two** HTTP requests (`/api/organizations` + `/usage`). That's ~35k
requests/day against claude.ai for one idle tray app, plus the welcome poller at 2s while open.
Risk: rate-limiting or account flagging; also wasteful (orgId is re-fetched on every call).
- **Fix:** cache the orgId after first success; poll 30–60s (the statusLine bridge already gives
  sub-minute freshness when Claude Code is active); keep 5s only while a countdown is on screen if
  you care.

### M2 — "Run now" button does nothing for `succeeded` / `interrupted` tasks
`renderer/app.js:228` shows Run now whenever status ≠ `running`, but the IPC guard
(`main.js:511-514`) only accepts `scheduled | failed | stopped | cancelled`. Clicking Run now on a
succeeded or interrupted task is a silent no-op (same mismatch in the tray context menu,
`main.js:147`).
- **Fix:** align the two lists (probably add `succeeded` and `interrupted` to the IPC guard).

### M3 — A crash during a repeat run kills the recurrence permanently
`main.js:650-654` — startup `cleanupOrphanedTasks` marks any `running` task `interrupted`. For a
repeat task that means the schedule never re-arms; the daily job silently stops until the user
notices and re-arms manually. Contradicts the fire-and-forget positioning.
- **Fix:** in `cleanupOrphanedTasks`, if `t.schedule?.kind === 'repeat'`, set status `scheduled`
  with `at = nextRepeat(t.schedule)` instead of `interrupted`.

### M4 — Executor `error` path leaks the 45-min timeout → write-after-end crash risk
`src/executor.js:140-144` — the child `error` handler resolves and ends the log stream but never
`clearTimeout(timeout)`. 45 minutes later the timeout fires and writes to the ended stream;
`ERR_STREAM_WRITE_AFTER_END` is emitted on a stream with no `error` listener → uncaught exception
in the **main process** (scheduler dies / app crash). Rare trigger (spawn-level error), trivial fix.
- **Fix:** `clearTimeout(timeout)` in the `error` handler; guard timeout's write with
  `writableEnded` like the close handler does.

### M5 — Store read-modify-write race between app and CLI
`src/store.js` and `scripts/relay.js` both do load → mutate → save on the same
`relay-data.json`. The tmp+rename keeps the file un-corrupted, but concurrent writers lose
updates: if the CLI enqueues a task in the window between the app's `load()` and `save()` (e.g.
during a scheduler tick's `updateTask`), the CLI's task vanishes.
- Low probability per write, but the scheduler writes on every state change, and `/relay` skill
  usage makes external writes routine. A simple lockfile (or single-writer via IPC) closes it.

---

## Low

### L1 — `setup-skill` PATH rewrite interpolates PATH into a PowerShell string
`main.js:596-605` — the new PATH is embedded in a double-quoted PowerShell command string. A PATH
entry containing `"`, `$`, or a backtick breaks the command (or executes as PowerShell). It also
rewrites the entire user PATH from split/trimmed/filtered parts, normalizing entries as a side
effect. Pass the value via env var (`$env:RELAY_NEXT_PATH`) or use `-EncodedCommand`.

### L2 — Multi-org accounts read the wrong org's usage
`main.js:31` — `orgs[0]` picks the first organization blindly. Users in >1 org (e.g. a team plan)
can get gauges/reset times from the wrong org, which then drive auto-resume timing.

### L3 — Executor buffers the full child output in memory
`src/executor.js:137-138` — `output += s` grows unbounded; a chatty 45-min run can accumulate
hundreds of MB. `detectLimit` only needs the tail — keep e.g. the last 64 KB
(`output = (output + s).slice(-65536)`).

### L4 — `relay:logs:get` reads any path the renderer asks for
`main.js:581-583` — takes an arbitrary absolute path. The renderer is trusted local code, but as
defense-in-depth resolve against `logsDir()` and reject paths outside it.

### L5 — Repeat schedule with an unparseable `at` fires every ~60s forever
`src/scheduler.js` `nextRepeat` returns `from + 60s` for an invalid date — safe against
throw/loop, but a corrupted `at` (hand-edited store, buggy external writer) turns a weekly task
into a once-a-minute task and the re-arm never repairs it. Consider marking the task `failed`
instead when `at` is invalid. Related: `relay:create` (`main.js:457`) does not validate
`schedule.at` at all — garbage produces a task that never fires and renders "Invalid Date".

### L6 — "Run now" on a cancelled repeat task resurrects the recurrence
The manual run reaches the repeat re-arm block, flipping `cancelled` → `scheduled`. Arguably
intended ("run it now" restarts it) — decide and either document or guard. (Fixing H2 by checking
stored status would also change this path; make the choice explicit.)

### L7 — One long task delays all other due tasks
`src/scheduler.js:48-53` — due tasks are awaited sequentially inside one tick, and the `ticking`
guard skips further ticks. A 45-min task pushes every other due task (and repeat re-arms) back by
its full duration. Likely intentional (serializes claude runs, avoids parallel session-limit
churn) — noting it because with repeat tasks in the mix, queue delay is now recurring behavior
worth a comment in the code.

### L8 — `/relay-autoresume` skill never explicitly says to substitute RESUME_PROMPT
`main.js:370-380` — the embedded `node -e` writes `prompt:'RESUME_PROMPT'` and the surrounding
text implies the model should replace it with the step-3a summary, but never says so. A literal
"RESUME_PROMPT" arm file produces a useless resume prompt. One sentence fixes it.

---

## What looked solid (checked, no issue)

- **Security invariant** — `scrubSecrets` always deletes `ANTHROPIC_API_KEY` before spawn, plus the
  pattern blacklist; prompt goes via stdin (no shell arg-splitting/injection); renderer is fully
  `esc()`-escaped (titles, prompts, session previews, log viewer), contextIsolation on,
  nodeIntegration off, narrow preload surface.
- **Reset math** — `nextSessionReset` / `nextWeeklyReset` / `nextRepeat` covered by the 87-test
  suite; repeat re-arm is DST-safe for day/week units.
- **Auto-resume chain** — bounded (`resumeCount > 10`), false-positive veto asymmetry is correctly
  conservative, two-tick confirmation on the arm file, resume de-dup in `resume-at-reset`.
- **Single-instance lock**, orphan cleanup, log rotation, atomic store writes all present.

## Suggested fix order

1. H1 (one-line, user-visible feature silently broken)
2. H2 + L6 together (same code path — re-read task before overwrite/re-arm)
3. H3 (taskkill tree — makes Cancel real on Windows)
4. M2, M4 (small guards)
5. M3 (repeat crash recovery)
6. M1 (polling budget), then the rest opportunistically.
