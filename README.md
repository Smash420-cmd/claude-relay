# Relay

> Schedule prompts into local **Claude Code** sessions, and auto-resume work across session limits.
> Born from the Sojournly workflow; a standalone tool. Full design in **`DESIGN.md`**.

---

## Status — MVP scaffold (built 2026-06-22, overnight)

A working **Electron** desktop app (tray + window), built strictly to the outline — no feature creep.
Stack chosen for reliability: Electron + a vanilla renderer (no bundler) + a JSON store. (Tauri was the
outline's first pick, but **cargo/Rust isn't installed** on this machine, so Electron — the documented
fallback — it is. Footprint > polish can revisit later.)

### ✅ What works in this scaffold (Phase 1 MVP)
- **Tray app that stays alive** when the window is closed, so the scheduler keeps running (autostart-ready).
- **Task list** (Linear-style dark UI): create, run-now, cancel, re-arm, delete, view log.
- **Create task**: title, prompt, **mode** (`fresh` / `resume-full` / `resume-compact`), **session picker**
  (reads your real `~/.claude/projects` sessions), project cwd, and **when** (`at next reset` / `once at a time`).
- **Scheduler engine**: internal timer loop fires due tasks (`once` and `at-next-reset` — reset time
  configurable in Settings, default `02:20`).
- **Executor**: spawns the Claude CLI, streams output to a per-run log, parses exit/limit state.
- **Stopped-task handling**: a run flagged as limit-stopped → status `stopped` + a one-click **Resume at
  reset** (queues a continuation at the next reset). Bounded to ≤8 auto-resumes.
- **Settings**: CLI command, default cwd, daily reset time, scheduler interval, auto-resume toggle.
- **Usage tracker** (`src/tracker.js`): live **session (5h)** + **weekly (7d)** bars with %, token load, and a
  session **reset countdown** — computed the `ccusage` way from your real `~/.claude/projects` transcript
  token counts (load = input + output + cache-creation; cache reads excluded). Limits are calibratable
  estimates. The session gauge has a **Resume at reset** button that queues a resume of that session at
  the computed reset time (the "capture timeout work" path). Verified against real data (2,705 turns).

### ⚠️ Stubbed / needs verification BEFORE trusting (Phase-0 unknowns — `DESIGN.md` §9)
- **Exact Claude CLI flags** for headless resume. Defaults: `claude -p "<prompt>"` (fresh),
  `claude --resume <id> -p "<prompt>"` (resume). Configurable via Settings → "Claude CLI command".
  **VERIFY these run a session non-interactively before relying on scheduled runs.**
- **Limit detection** (`src/executor.js → detectLimit`) is a best-guess regex over CLI output.
  Confirm the real limit message + whether it carries a reset time, then tighten it.
- **`resume-compact`** runs as `resume-full` for now (non-interactive `/compact` unverified).
- **Auto-resume on limit** is **OFF by default** (depends on the unverified limit detection). The manual
  "Resume at reset" button works today regardless.

### 🚫 Deliberately NOT built yet (later phases, per the outline)
- Recurring/cron schedules (MVP does `once` + `at-next-reset`).
- **Auto** detection of an *interactive* session stopping at a limit (the `.jsonl` limit-marker watcher).
  Deferred on purpose: the limit marker is a Phase-0 unknown and this very session's transcript is full of
  the words "usage limit" (we discussed them all day) → a naive scan would false-positive. The tracker
  instead gives the session **reset countdown** + a one-click **Resume at reset** to capture the work safely.
- Authoritative usage via network/proxy interception (the tracker is a transcript-based *estimate*).
- Companion VS Code extension.

---

## Run it

```bash
cd relay
npm install      # pulls electron
npm start        # opens the app (also lives in the tray)
npm run check    # syntax-checks all source files
```

Data + logs live under Electron's userData dir (Settings → "Open logs folder" reveals it).

## First-thing-to-do (the Phase-0 spike)
Before scheduling anything important: open a terminal and confirm how `claude` resumes a session
non-interactively (`claude --resume <id> -p "…"` / `--continue` / print mode) and what a usage-limit
message actually looks like. Plug the real values into Settings + `src/executor.js`. Everything else is
already wired around those two facts.

## Layout
```
main.js            Electron main: window, tray, IPC, wires scheduler+executor+store
preload.js         secure IPC bridge (window.relay)
src/paths.js       data/log/claude-projects locations
src/store.js       task + settings persistence (JSON; swap for SQLite later)
src/sessions.js    discovers ~/.claude/projects sessions
src/executor.js    spawns the claude CLI, logs output, detects limits   ← Phase-0 unknowns live here
src/scheduler.js   due-task loop + next-reset calc
renderer/          vanilla HTML/CSS/JS UI (Linear-style dark)
DESIGN.md          the full design outline
```
