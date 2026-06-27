# /relay

A lightweight Windows tray app that schedules prompts into local Claude Code sessions and auto-resumes work when usage limits reset.

---

## Install

1. Go to [Releases](https://github.com/Smash420-cmd/claude-relay/releases)
2. Download `Relay Setup x.x.x.exe`
3. Run the installer — /relay starts immediately and lives in your system tray

**Requirements:** [Claude Code](https://claude.ai/code) must be installed and logged in.

---

## What it does

- **Schedule tasks** — write a prompt, pick a project folder, choose when to run (`now` / `at next reset` / a specific time)
- **Auto-resume on limit** — when a running task is stopped by a session or weekly usage limit, /relay automatically re-schedules it to resume at the exact moment that limit resets
- **Live usage bars** — session (5h) and weekly (7d) usage pulled directly from Claude.ai, with reset countdowns
- **Per-task model + effort** — choose the Claude model and effort level per task, or set a default in Settings
- **Stays alive in the tray** — close the window and the scheduler keeps running
- **View logs** — every run saves a full output log, viewable in one click

---

## Setup

### 1. Log in to Claude
Open /relay → the usage panel will prompt you to **Log in to Claude** if you haven't already. This lets /relay read your exact usage from Claude.ai.

### 2. Set up the /relay skill (optional but recommended)
In Settings, click **Set up /relay skill**. This:
- Adds the `relay` command to your PATH
- Installs the `/relay` Claude Code skill so you can schedule tasks from inside any Claude session
- Configures your Claude Code status line to show `5h 74% · 7d 45%` after every turn

### 3. Disable Extended usage (important)
In your Claude.ai account settings, turn off **Extended usage** — otherwise Claude will spend credits past the free limit even when /relay is waiting to pause.

---

## /relay Claude Code skill

After running Setup, type `/relay` inside any Claude Code session to schedule tasks with natural language:

```
/relay build the payment flow at 9am tomorrow
/relay run the test suite in 30 minutes using Opus 4.8
/relay continue this at next reset
```

To schedule a follow-up that resumes the current session:

```bash
relay schedule --prompt "continue" --resume current --at next-reset --cwd "C:\my\project"
```

---

## Settings

| Setting | Default | What it does |
|---------|---------|--------------|
| Claude CLI command | `claude` | Path to the Claude Code binary if it's not on PATH |
| Default project path | — | Fallback cwd for tasks that don't set their own |
| Default model | — | Model used when a task has no model set (Sonnet 4.6) |
| Default effort | — | Effort level used when a task has no effort set |
| Daily reset time | `02:20` | Fallback reset time used when the API is unreachable |
| Auto-resume on limit | On | Re-schedule stopped tasks at the exact reset moment |
| Allow extended usage | Off | Let tasks run past the free limit (spends credits) |
| Skip permissions | On | Run tasks unattended without permission prompts |
| Launch at login | Off | Start /relay automatically when Windows starts |

---

## Queue work from a terminal

Any script or Claude Code session can enqueue tasks directly:

```bash
relay schedule --prompt "continue the bench run" --resume current --at next-reset
relay schedule --prompt "build day 7" --at +30m
relay schedule --prompt "run tests" --model claude-opus-4-8 --effort high --at +1h
relay list
relay cancel <id>
relay log <id>    # print the task log; last line "# session: <uuid>" is the resume target
relay restart     # signal the tray app to relaunch
```

**Key flags:**
- `--resume current` — auto-detects the live Claude Code session
- `--resume <uuid>` — resume a specific session (get the UUID from `relay log <id>`)
- `--at next-reset | +30m | +2h | <ISO datetime>`
- `--mode fresh | resume-full`
- `--model` — one of `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-5-20250929`
- `--effort low | medium | high | xhigh | max` — `xhigh` only on Opus 4.8/4.7; not supported on Haiku

### Chaining tasks across sessions

When a relay task completes, `/relay` records the Claude session UUID in the task log. To resume it in a follow-up:

```bash
relay log <task-id>        # last line: "# session: 550e8400-e29b-41d4-a716-..."
relay schedule --prompt "next step" --resume 550e8400-e29b-... --mode resume-full --cwd "C:\my\project" --at +1h
```

---

## Build from source

```bash
git clone https://github.com/Smash420-cmd/claude-relay.git
cd claude-relay
npm install
npm start              # run in dev mode
npm run build          # build the Windows installer to dist/
npm run publish-retry  # build + upload to GitHub Releases (retries past Windows Defender EPERM)
npm run check          # syntax-check all source files
```

Data and logs live under Electron's userData directory — **Settings → Open logs folder** will take you there.

---

## License

MIT — see [LICENSE](LICENSE)
