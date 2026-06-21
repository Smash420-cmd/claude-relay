# Claude Code Scheduler — Build Outline

> Status: **design outline, not started.** A personal/in-house tool, separate from Sojournly.
> Working title: **"Relay"** (it relays queued work into Claude Code sessions). Rename freely.

---

## 1. What it is

A small, **Linear-style task app** that schedules prompts to fire into **local Claude Code sessions** at set times — and, crucially, **auto-resumes work that got stopped by a usage/session limit, at the moment the limit resets.**

It's the productised version of the manual trick discussed earlier: an OS scheduler firing the Claude Code CLI (`claude --resume <session> -p "…"`) into a specific conversation at a set time. This app gives that a real UI, a queue, and the stopped-task-resume loop.

**Not** the same as the existing `/schedule` cloud feature: that spawns *cloud* agents on Anthropic infra from a GitHub repo. This is **local** — it fires into *your* sessions on *your* machine, with your local files and context. Different tool, different purpose.

---

## 2. Core user stories

1. *"Queue a task to run at 2:20 am when my limit resets."* — create a task with a prompt + target session + time; it fires automatically.
2. *"My session hit the usage limit mid-task — pick it up automatically when the limit resets."* — the app detects the stop, captures the session + intent, and schedules a resume at the reset time.
3. ***"Claude, schedule this for me."*** — the **Claude Code session itself queues work into Relay** (via a `relay` CLI call), either because I ask it to now or at an agreed time. Relay is the persistence layer the ephemeral session can hand work to.
4. ***"Run the long test-bench overnight and keep going after my limit resets."*** — the flagship: a long bench run that exceeds one session's limit is **carried across reset windows unattended.** Relay re-launches a fresh session each reset to continue from the checkpoint. **This is the killer feature.**
5. *"Re-run this every weekday morning."* — recurring schedules.
6. *"Show me what's queued, running, done, and failed."* — a clean board/list with status.
7. *"Retry that failed one."* — one-key retry.

---

## 3. Desktop app vs VS Code extension — **recommend: Desktop app**

**Recommendation: a system-tray desktop app with OS autostart — NOT a VS Code extension.**

The decisive reason is the **killer feature's timing**: resuming stopped tasks at session-reset time means firing **when you're likely away and VS Code is likely closed** (overnight, mid-morning resets, etc.). A **VS Code extension only runs while VS Code is open** — it is deactivated the moment the window closes, so it *cannot reliably fire a 2:20 am task*. A tray app with autostart is always alive. That alone settles it.

Secondary reasons:
- **UI freedom.** A genuinely Linear-style app (dark, keyboard-driven, fast) is far easier in a real window than inside a constrained VS Code webview/panel.
- **It doesn't need VS Code anyway.** Execution is via the **Claude Code CLI** (headless) — `claude --resume <session>` runs in a subprocess. VS Code being open is irrelevant to firing a task.

**What the extension would be good at** (and why a *thin optional companion* could come later): it lives where the work is, so a one-click *"schedule this session"* button from inside VS Code is a nice convenience. But that's a **bridge**, not the core. Build the desktop app first; add a tiny companion extension only if the convenience proves worth it.

> Honest caveat (same as before): a scheduler-fired task runs as a **headless CLI invocation against the session**, not as typing into the live VS Code chat panel. The conversation continues, output is captured to a log, and you review it after — it's not a live takeover of the editor's chat UI.

---

## 4. The killer feature — stopped-task capture & resume-at-reset

Two ways a task gets "stopped," both handled:

**A. A task the scheduler fired** hits the limit → the executor parses the CLI's limit message (reset time included), marks the task `stopped`, and **auto-creates a follow-up task scheduled for the reset time** to resume/retry.

**B. An interactive session *you* were running** in VS Code hits the limit → the app **watches the Claude Code session transcripts** (`~/.claude/projects/**/*.jsonl`) for the limit-reached marker, captures that session + its last intent, and offers (or auto-creates) a **"resume at reset"** task.

Mechanics:
- **Detection:** parse limit-reached signals from (a) CLI exit output for scheduler runs, and (b) a file-watcher on the session `.jsonl` files for interactive runs.
- **Reset time:** read it from the limit message if present; otherwise fall back to a user-configured reset schedule (the rolling window / fixed daily reset).
- **Resume:** `claude --resume <session> -p "<continue/retry prompt>"` at the reset time. The "continue" prompt can be as simple as `continue` (Claude Code resumes the session's own context) or a captured restatement of the unfinished task.

This is the whole reason to build it: **work never silently dies at a limit — it gets picked back up the instant capacity returns.**

---

## 4b. Claude-connected scheduling & long-run continuity (the bench use case)

The most important capability, and the reason Relay matters beyond "a nicer cron": **the Claude Code session can hand work to Relay, and Relay carries it across limit boundaries the session can't cross itself.**

**Why it's needed:** a Claude Code session is *ephemeral* — it stops at the usage/session limit and cannot schedule its own future execution. Relay is the *always-on* daemon. So the session **enqueues a continuation into Relay** (a plain `relay schedule …` Bash call), then when it's cut off, **Relay re-launches a fresh session after the reset** to carry on. Relay is the bridge across the limit boundary.

**The continuity loop (flagship: long autonomous test-bench runs):**
1. The session starts a long run (e.g. the timing-realism bench loop) and **checkpoints progress to a state file** as it goes (`bench/state/<run>.json`: scenarios done, knob settings, results, stop condition, `done` flag).
2. It enqueues a Relay task: *"at next reset, resume `<run>`."*
3. It hits the limit / ends.
4. Relay fires at reset → launches a **fresh** `claude -p "resume bench run <run> from bench/state/<run>.json"`.
5. The fresh session reads the **state file (ground truth, not the lost conversation)**, continues, re-checkpoints, re-enqueues the next continuation, and so on — until the state file says `done`.

**Hard preconditions / guardrails (these are load-bearing, not optional):**
- **Resumable-from-disk.** The work MUST checkpoint its state to disk; a resumed session relies on the state file, never on conversation memory. This is the "work from ground truth, not memory" rule applied *across* sessions. Work that isn't checkpoint-resumable can't be auto-continued.
- **Fresh session > `--resume`.** Resume by launching a fresh session pointed at the compact state file, NOT `claude --resume` of the giant old transcript (which is expensive to re-read and would re-hit the limit fast).
- **Bounded loop / stop condition.** A self-continuing loop (enqueue → relaunch → enqueue → …) needs a hard stop: max iterations / token budget / `done` flag — so it converges, never runs forever. The bench already has this shape (bounded iterations, human ratifies).
- **Sandbox-only autonomy.** Relay may auto-run **non-destructive, sandboxed** work unattended (the bench). It must **never auto-schedule production changes** (deploys, prod DB writes) without explicit sign-off — per the bench-first rule. Scheduled tasks are visible/approvable in the Relay UI before they fire.
- **No double-drive.** If the run finishes before the limit, the queued resume must no-op (the state file's `done` flag) or be cancelled.

**Connection interface:** Relay ships a `relay` CLI (`relay schedule --at next-reset --mode <fresh|resume-compact|resume-full> --session <id?> --prompt "…"`) backed by a watched queue dir / local store. Because it's just a CLI/file write, the Claude Code session can enqueue work with a normal Bash tool call — no special integration needed.

---

## 4c. Session-limit tracking & resume modes

**Session-limit tracker — "prime, don't scramble."** Relay should track *how much session budget / time-to-reset is left*, so it can **stage the handoff before the hard stop** rather than only reacting after it. Without a tracker the only signal is the stop itself — and a reactive resume then waits for the *next* reset (possibly hours of dead time). With it, the running session checkpoints + enqueues its continuation *early*, keeps working while budget remains, and the handoff is already staged when the limit lands. Keep the **limit-watcher as the reliable backstop** in case the estimate is off.
- *How:* read Claude Code's usage/limit/reset if exposed (CLI/metadata — VERIFY in §9); else approximate from transcript token counts + the known reset window.

**Resume modes — the specific-vs-any-session decision.** The clean rule: **does the task's full state live on disk, or in the conversation?**

| Mode | When | Cost |
|------|------|------|
| **`fresh`** — any session, reads a state file | Work is **designed checkpoint-resumable**: the bench, "build the next day" (reads `trip_context`), anything whose ground truth is on disk / DB / git. **Default for autonomous long runs.** | Cheapest — no transcript replay |
| **`resume-compact`** — specific session, `/compact` then `--resume` | Continuation needs the conversation's gist but not every token; cost matters | Moderate |
| **`resume-full`** — specific session, verbatim `--resume` | High-fidelity continuation of an un-checkpointed interactive thread | Most expensive (re-reads the whole transcript; can re-hit the limit fast) |

**Design implication:** make work checkpoint-resumable so it qualifies for **`fresh`** — the cheap, robust, indefinitely-continuable mode. Reserve `resume-*` for genuinely conversation-bound tasks. The bench is `fresh`.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Tray Desktop App (always on, autostart)                 │
│                                                           │
│  ┌────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  UI (React) │──│  Scheduler    │──│   Executor      │  │
│  │  Linear-    │   │  engine       │   │  spawns         │  │
│  │  style board│   │  (due-task    │   │  `claude` CLI   │  │
│  └────────────┘   │   timer loop) │   │  subprocess     │  │
│         │          └──────────────┘   └────────────────┘  │
│         │                 │                   │           │
│  ┌──────▼─────┐   ┌───────▼──────┐   ┌────────▼────────┐  │
│  │  SQLite     │   │ Session      │   │ Limit watcher   │  │
│  │  (tasks,    │   │ linker       │   │ (.jsonl tail +  │  │
│  │   runs,logs)│   │ (~/.claude/  │   │  CLI output     │  │
│  └────────────┘   │  projects)   │   │  parse)         │  │
│                   └──────────────┘   └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **Scheduler engine:** internal timer loop (checks due tasks every ~30s) — because the app is always-on via autostart, an internal scheduler is enough (no need to also register OS cron). Optionally back it with the OS scheduler as a belt-and-braces wake.
- **Executor:** spawns the `claude` CLI, streams output to a per-run log, parses exit state.
- **Session linker:** discovers sessions by reading `~/.claude/projects/<project>/<session>.jsonl` (shows project + last message so you can pick the right conversation).
- **Limit watcher:** tails session transcripts + reads CLI output to detect limit-reached and reset times.

---

## 6. Data model (SQLite)

- **task**: `id, title, prompt, mode` (`fresh` | `resume-compact` | `resume-full`), `session_id` (null for `fresh`), `state_file` (for `fresh` resumable work), `project_path, schedule` (`once:<datetime>` | `cron:<expr>` | `at-next-reset`), `status` (`scheduled | running | succeeded | failed | stopped | cancelled`), `retry_policy, created_at`.
- **run**: `id, task_id, started_at, ended_at, exit_state, log_path, stopped_reason, reset_time` (if limit-stopped).
- **session** (cached index): `session_id, project_path, title, last_activity` — refreshed from `~/.claude/projects`.
- **settings**: reset-window config, autostart, default project, notification prefs.

---

## 7. Tech stack

| Layer | Recommendation | Why |
|-------|----------------|-----|
| Shell | **Tauri** (Rust core + web UI) | Lean always-on tray app, small memory footprint (it runs 24/7), native tray/autostart. **Electron** is the faster-to-ship fallback given existing React/JS skills — pick Electron if speed > footprint. |
| UI | **React + a Linear-style design system** | Dark, keyboard-first, command palette, fast list. Reuses Sojournly front-end skills. |
| Storage | **SQLite** | Local, queryable, durable across reboots. |
| Scheduling | Internal timer loop + OS autostart | Always-on; optional OS-scheduler backup wake. |
| Execution | Spawn **`claude` CLI** subprocess | Headless `--resume` / `-p` / `--continue`. |

---

## 8. Build phases

- **Phase 0 — Spike (verify the unknowns in §9).** Confirm the exact CLI flags for headless resume + how limit-reached/reset surfaces. Nothing else is worth building until this is proven.
- **Phase 1 — MVP:** tray app + task list + "fire prompt into session at time" via CLI + run logs. One-time schedules only.
- **Phase 2 — Session linking:** browse/pick a Claude Code session to target; recurring schedules.
- **Phase 3 — The killer feature:** limit-watcher (CLI + `.jsonl`), reset-time detection, auto "resume at reset" tasks. Covers both scheduler-fired and interactive stops.
- **Phase 4 — Polish:** Linear-style board, command palette, keyboard shortcuts, desktop notifications on done/failed/resumed, retry-one-key.

---

## 9. Open questions to verify FIRST (Phase 0 spike)

1. **Headless resume + prompt injection:** exact Claude Code CLI invocation to resume a specific session non-interactively and inject a prompt (`claude --resume <id> -p "…"` / `--continue` / print mode). Does it fully restore the session's context?
2. **Limit signalling:** how does a usage/session limit surface — CLI exit code/message? A marker in the session `.jsonl`? Does it include the reset time, or must we infer it?
3. **Reset cadence:** fixed daily reset vs rolling 5-hour window — how to compute "next reset" reliably.
4. **Concurrency/locking:** is it safe to resume a session the user might also have open in VS Code? Need a guard against double-driving one session.
5. **Auth:** the CLI uses the user's existing Claude Code auth — confirm a scheduled/headless run picks it up without an interactive login prompt.
6. **Usage/limit visibility (for the tracker):** does Claude Code expose current usage vs limit and the next reset time programmatically (CLI flag / metadata / session file)? If yes, the session-limit tracker reads it directly; if no, approximate from transcript token counts + the known reset window.
7. **Compaction control:** can `/compact` be driven non-interactively for the `resume-compact` mode (compact a session before resuming to cut re-read cost)?

---

## 10. Relationship to Sojournly

None functionally — it's a **separate tool** that happens to be born from the Sojournly workflow. It could live in its own repo. Long-term it's a candidate for the same "prove it for myself, then maybe share it" path as the test-bench idea — but that's far future; first it just needs to make *this* workflow not lose work at a limit.
