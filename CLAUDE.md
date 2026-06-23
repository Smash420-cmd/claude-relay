# /relay — Project Context

## Naming Convention (locked — do not change without Patrick's instruction)

| Layer | Name |
|-------|------|
| GitHub repo | `claude-relay` (Smash420-cmd/claude-relay) |
| Installer / exe / shortcut / Start menu | `Relay` (`productName` in package.json) |
| App UI — topbar, window title, tray tooltip | `/relay` |
| Brand (public-facing) | `/relay` |

Slashes are invalid in Windows file/shortcut names, so the productName is `Relay`. The public brand shown inside the app is `/relay`. The GitHub repo stays `claude-relay` as the internal name. These are intentionally different.

---

## What This Is

`/relay` is a Windows Electron tray app that schedules prompts into local Claude Code sessions and auto-resumes work when Claude.ai usage limits reset.

- **Tray app** — stays alive when the window is closed so the scheduler keeps running
- **Task scheduler** — `once`, `at-next-reset`, or a specific time
- **Auto-resume** — when a task is stopped by a session/weekly limit, fetches the exact reset time from the Claude.ai API and re-schedules automatically
- **Live usage bars** — session (5h) + weekly (7d) pulled from Claude.ai API via sessionKey cookie
- **`/relay` CLI** — `node scripts/relay.js schedule …` lets any process (Claude, scripts) enqueue tasks

## Stack

- **Electron** + vanilla renderer (no bundler) + JSON store
- **electron-builder** for packaging (Windows NSIS installer)
- **electron-updater** for auto-updates via GitHub Releases

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main: window, tray, IPC, scheduler, executor |
| `preload.js` | Secure IPC bridge (`window.relay`) |
| `src/store.js` | Task + settings persistence (JSON) |
| `src/executor.js` | Spawns Claude CLI, logs output, detects limits |
| `src/scheduler.js` | Due-task loop + next-reset calc |
| `src/tracker.js` | Usage snapshot from statusLine bridge |
| `renderer/app.js` | UI logic |
| `renderer/styles.css` | Dark UI design system |
| `scripts/relay.js` | CLI for queuing tasks from the terminal |
| `scripts/relay-statusline.js` | Claude Code statusLine bridge → `~/.relay/usage.json` |

## Publish Flow

```bash
npm run build     # local build only (no upload)
npm run publish   # build + upload to GitHub Releases as new version
```

Before publishing: bump `"version"` in `package.json`. Set `GH_TOKEN` env var (or add permanently to Windows user environment variables) — token lives at github.com/settings/tokens, needs `repo` scope, no expiration.

## Settings Defaults (do not change defaults without good reason)

- `autoResumeOnLimit: true` — re-schedule stopped tasks at exact reset time
- `allowExtendedUsage: false` — don't auto-run past the free limit
- `skipPermissions: true` — unattended execution via `--dangerously-skip-permissions`
