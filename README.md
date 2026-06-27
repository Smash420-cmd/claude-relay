# /relay

Claude Code's usage limits reset every 5 hours. /relay turns that constraint into a workflow: queue the work, walk away, and come back to it done — even if it takes multiple sessions to finish.

It runs as a Windows tray app. You write a prompt, point it at a project folder, and set a time. /relay spawns a headless Claude Code session at that moment, streams the output to a log, and if the session hits a limit mid-task it automatically re-arms the resume for the exact moment that limit clears. No babysitting, no lost work.

Claude Code sessions can also schedule their own follow-up tasks via the `/relay` skill — so a session that runs out of context or hits a limit can hand off to a future session without you doing anything.

---

## Install

1. Go to [Releases](https://github.com/Smash420-cmd/claude-relay/releases)
2. Download `Relay Setup x.x.x.exe`
3. Run the installer — /relay starts immediately and lives in your system tray

**Requirements:** [Claude Code](https://claude.ai/code) must be installed and logged in.

---

## What it does

- **Schedule tasks** — write a prompt, pick a project folder, set a time (`now` / `at next reset` / specific time). /relay fires a headless Claude Code session and streams output to a log
- **Auto-resume on limit** — if a session hits the 5h or 7d usage limit mid-task, /relay fetches the exact reset time from Claude.ai and re-schedules the resume automatically
- **Self-scheduling sessions** — via the `/relay` Claude Code skill, a running session can queue its own follow-up before it exits, passing the session UUID so the next run resumes exactly where it left off
- **Live usage bars** — session and weekly usage pulled from Claude.ai in real time, with reset countdowns
- **Per-task model + effort** — Opus, Sonnet, or Haiku; low through max effort — set per task or as a default
- **Stays alive in the tray** — close the window, the scheduler keeps running

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

The skill works across all Claude Code clients — CLI, browser (claude.ai/code), Windows desktop app, and IDE extensions (VS Code, JetBrains). They all share the same `~/.claude/commands/` directory.

To schedule a follow-up that resumes the current session:

```bash
relay schedule --prompt "continue" --resume current --at next-reset --cwd "C:\my\project"
```

### /relay-autoresume

Type `/relay-autoresume` at the start of any session to arm it for automatic relay when a usage limit is hit. If the session hits the 5h or 7d limit, Claude will automatically schedule a resume at next reset — no manual action needed.

Requires **"/relay-autoresume — self-schedule on session limit"** to be enabled in Settings.

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
