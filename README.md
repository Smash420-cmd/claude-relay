# Claude Relay

A lightweight Windows tray app that schedules prompts into local Claude Code sessions and auto-resumes work when usage limits reset.

---

## Install

1. Go to [Releases](https://github.com/Smash420-cmd/claude-relay/releases)
2. Download `Claude Relay Setup x.x.x.exe`
3. Run the installer — Claude Relay starts immediately and lives in your system tray

**Requirements:** [Claude Code](https://claude.ai/code) must be installed and logged in.

---

## What it does

- **Schedule tasks** — write a prompt, pick a project folder, choose when to run (`now` / `at next reset` / a specific time)
- **Auto-resume on limit** — when a running task is stopped by a session or weekly usage limit, Claude Relay automatically re-schedules it to resume at the exact moment that limit resets
- **Live usage bars** — session (5h) and weekly (7d) usage pulled directly from Claude.ai, with reset countdowns
- **Stays alive in the tray** — close the window and the scheduler keeps running
- **View logs** — every run saves a full output log, viewable in one click

---

## Setup

### 1. Log in to Claude
Open Claude Relay → the usage panel will prompt you to **Log in to Claude** if you haven't already. This lets Claude Relay read your exact usage from Claude.ai.

### 2. Live usage (optional but recommended)
For real-time usage tracking inside Claude Code sessions, add one line to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "node \"C:/path/to/claude-relay/scripts/relay-statusline.js\""
}
```

Replace the path with wherever you installed Claude Relay. Your Claude Code status line will show `5h 74% · 7d 45%` after every turn.

### 3. Disable Extended usage (important)
In your Claude.ai account settings, turn off **Extended usage** — otherwise Claude will spend credits past the free limit even when Claude Relay is waiting to pause. Claude Relay cannot enforce this on its own.

---

## Settings

| Setting | Default | What it does |
|---------|---------|--------------|
| Claude CLI command | `claude` | Path to the Claude Code binary if it's not on PATH |
| Default project path | — | Fallback cwd for tasks that don't set their own |
| Daily reset time | `02:20` | Fallback reset time used when the API is unreachable |
| Auto-resume on limit | On | Re-schedule stopped tasks at the exact reset moment |
| Allow extended usage | Off | Let tasks run past the free limit (spends credits) |
| Skip permissions | On | Run tasks unattended without permission prompts |

---

## Queue work from a terminal

Any script or Claude session can enqueue tasks directly:

```bash
node scripts/relay.js schedule --prompt "continue the bench run" --resume current --at next-reset
node scripts/relay.js schedule --prompt "build day 7" --at +30m
node scripts/relay.js list
node scripts/relay.js cancel <id>
```

- `--resume current` — auto-detects the live Claude Code session
- `--at next-reset` — fires at the real 5h reset time; also accepts `+30m`, `+2h`, or an ISO timestamp
- `--mode fresh|resume-full` — default `fresh`, or `resume-full` if `--resume` is given

---

## Build from source

```bash
git clone https://github.com/Smash420-cmd/claude-relay.git
cd claude-relay
npm install
npm start        # run in dev mode
npm run build    # build the Windows installer to dist/
npm run check    # syntax-check all source files
```

Data and logs live under Electron's userData directory — **Settings → Open logs folder** will take you there.

---

## License

MIT — see [LICENSE](LICENSE)
