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
- **Per-task model + effort** — each task (and the settings default) carries an optional `model` and `effort`; executor passes `--model` / `--effort` to Claude CLI when set
- **`/relay` Claude Code skill** — `~/.claude/commands/relay.md` lets users type `/relay do X at 4pm` inside any Claude Code session; written on every app startup so it self-updates silently when the app ships a new version

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

### Every time — exact steps in order

1. **Bump version** in `package.json` (e.g. `"version": "0.4.9"`)
2. **Commit it** — `git add package.json && git commit -m "chore: bump version to X.Y.Z"`
   - electron-updater compares installed version against the GitHub Release tag; if `package.json` isn't bumped and committed the update will never be detected
3. **Build** (electron-builder 26.x always re-extracts — keep retrying until Defender clears):
   ```powershell
   # Clean slate
   Remove-Item -Recurse -Force dist\win-unpacked -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force dist\win-unpacked.tmp -ErrorAction SilentlyContinue
   Remove-Item -Force "dist\Relay Setup X.Y.Z.exe" -ErrorAction SilentlyContinue
   $env:GH_TOKEN = [System.Environment]::GetEnvironmentVariable('GH_TOKEN','User')

   # Run repeatedly until the rename succeeds and NSIS fires.
   # First run always EPERM (Defender scans new Electron binary ~30s).
   # Second run usually succeeds — Defender scans the same files faster.
   # Third run always succeeds if second didn't.
   # DO NOT use --prepackaged — it bypasses app.asar packing and ships bare Electron.
   npm run publish   # run this 2-3 times, removing the .exe between attempts:
   Remove-Item -Force "dist\Relay Setup X.Y.Z.exe" -ErrorAction SilentlyContinue
   npm run publish   # usually succeeds here — creates a DRAFT release (expected)
   ```
4. **Publish via GitHub API** — `npm run publish` consistently creates draft releases in this environment; publish the real release manually:

```powershell
$token = $env:GH_TOKEN  # or paste directly
$headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json" }

# Delete the draft(s) electron-builder created and their tag
$releases = Invoke-RestMethod "https://api.github.com/repos/Smash420-cmd/claude-relay/releases" -Headers $headers
$releases | Where-Object { $_.tag_name -eq "vX.Y.Z" } | ForEach-Object {
  Invoke-RestMethod "https://api.github.com/repos/Smash420-cmd/claude-relay/releases/$($_.id)" -Method Delete -Headers $headers
}
try { Invoke-RestMethod "https://api.github.com/repos/Smash420-cmd/claude-relay/git/refs/tags/vX.Y.Z" -Method Delete -Headers $headers } catch {}

# Create a real published release and upload the three files
$body = @{ tag_name = "vX.Y.Z"; name = "vX.Y.Z"; draft = $false; prerelease = $false } | ConvertTo-Json
$release = Invoke-RestMethod "https://api.github.com/repos/Smash420-cmd/claude-relay/releases" -Method Post -Headers $headers -Body $body -ContentType "application/json"
$up = "https://uploads.github.com/repos/Smash420-cmd/claude-relay/releases/$($release.id)/assets"
@(
  @{ path = "dist\Relay Setup X.Y.Z.exe";          name = "Relay-Setup-X.Y.Z.exe" },
  @{ path = "dist\Relay Setup X.Y.Z.exe.blockmap"; name = "Relay-Setup-X.Y.Z.exe.blockmap" },
  @{ path = "dist\latest.yml";                     name = "latest.yml" }
) | ForEach-Object {
  Invoke-RestMethod "$up`?name=$($_.name)" -Method Post -Headers $headers -Body ([System.IO.File]::ReadAllBytes($_.path)) -ContentType "application/octet-stream" | Out-Null
  "uploaded $($_.name)"
}
```

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `EPERM: rename dist\win-unpacked.tmp -> dist\win-unpacked` | Windows Defender scans the extracted Electron binary and holds a lock briefly | Just re-run `npm run publish` (remove the .exe first). Second/third run succeeds when Defender finishes. **Never use `--prepackaged`** — it ships bare Electron with no app code. |
| `GitHub Personal Access Token is not set` | `GH_TOKEN` not inherited by the npm cmd.exe subprocess | Set `$env:GH_TOKEN` explicitly before running |
| `Can't open output file` (NSIS) | Previous `Relay Setup X.Y.Z.exe` still in dist | `Remove-Item -Force "dist\Relay Setup X.Y.Z.exe"` and retry |
| Release created as draft, update not detected | `npm run publish` always creates drafts in this environment | Use the GitHub API publish script above (step 4) |
| Update not detected by running app | `package.json` version wasn't bumped/committed before publish | Bump + commit (steps 1–2), republish |

```bash
npm run build     # local build only, no upload — useful for testing the installer
```

### Legacy note: why not just `npm run publish` end-to-end?

`npm run publish` creates GitHub releases as **drafts** in this environment (root cause unknown — likely a GH_TOKEN scoping issue in the cmd.exe subprocess electron-builder spawns). The API upload in step 4 is the reliable path and should be used every time.

### Old fallback script (kept for reference)

```powershell
$token = $env:GH_TOKEN
$headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json" }

# 1. Create the release
$body = @{ tag_name = "vX.Y.Z"; name = "vX.Y.Z"; draft = $false; prerelease = $false } | ConvertTo-Json
$release = Invoke-RestMethod "https://api.github.com/repos/Smash420-cmd/claude-relay/releases" -Method Post -Headers $headers -Body $body -ContentType "application/json"

# 2. Upload the three required files
$uploadBase = $release.upload_url -replace '\{.*\}', ''
$distDir = "C:\Users\pmdse\Documents\relay\dist"
@(
  @{ path = "$distDir\Relay Setup X.Y.Z.exe";          name = "Relay-Setup-X.Y.Z.exe" },
  @{ path = "$distDir\Relay Setup X.Y.Z.exe.blockmap"; name = "Relay-Setup-X.Y.Z.exe.blockmap" },
  @{ path = "$distDir\latest.yml";                     name = "latest.yml" }
) | ForEach-Object {
  Invoke-RestMethod "$uploadBase`?name=$($_.name)" -Method Post -Headers $headers -Body ([System.IO.File]::ReadAllBytes($_.path)) -ContentType "application/octet-stream" | Out-Null
  "uploaded $($_.name)"
}
```

## Model + Effort

### Available models (as of 0.4.11)

| Model ID | Label | Effort support |
|----------|-------|---------------|
| *(empty)* | Default · Sonnet 4.6 | low / medium / high / max |
| `claude-opus-4-8` | Opus 4.8 | low / medium / high / **xhigh** / max |
| `claude-sonnet-4-6` | Sonnet 4.6 | low / medium / high / max |
| `claude-haiku-4-5-20251001` | Haiku 4.5 | **none** — effort flag must be omitted |
| `claude-opus-4-7` | Opus 4.7 (Legacy) | low / medium / high / **xhigh** / max |
| `claude-opus-4-6` | Opus 4.6 (Legacy) | low / medium / high / max |
| `claude-sonnet-4-5-20250929` | Sonnet 4.5 (Legacy) | low / medium / high / max |

`xhigh` is only valid on Opus 4.8 and Opus 4.7. Sending it to other models causes a CLI error.

All 33 model × effort combinations are smoke-tested by `scripts/test-models.js` — run it before bumping a version if model/effort code changes.

### Rules when adding/removing models

1. Update `MODELS` array in `renderer/app.js` (UI dropdowns)
2. Update the `writeRelaySkill()` function in `main.js` (skill text lists valid model IDs)
3. Update `~/.claude/commands/relay.md` locally (your own skill — overwritten at next app launch anyway)
4. Update the model table above in this file
5. Run `node scripts/test-models.js` to verify all combinations pass

### Model Availability Notes

- **claude-fable-5 is excluded** from the model list — unavailable due to US Government security concerns. Do not add it back until Patrick confirms it's cleared.

## `/relay` Claude Code Skill

The skill (`~/.claude/commands/relay.md`) is what lets users type `/relay build feature X at 9am` inside any Claude Code session. Key facts:

- **Single source of truth**: the skill content lives in `writeRelaySkill()` in `main.js`. The file at `~/.claude/commands/relay.md` (your local dev copy) is overwritten on every app launch — editing it directly is fine for testing but changes must also be made in `main.js` to persist.
- **Auto-updates silently**: `writeRelaySkill()` is called at startup before `registerIpc()`. Every time the user launches Relay, the skill is overwritten with the current version. No user action needed when the skill changes — just ship an app update.
- **Setup button still needed for PATH**: the "Set up /relay skill" button in Settings / Welcome also adds the `scripts/` dir to the user's PATH so `relay` works as a bare command. This is not done at startup (no admin risk). The skill write in the button handler now just calls `writeRelaySkill()` — same content, single source.
- **When you change the skill**: update `writeRelaySkill()` in `main.js`. The local `~/.claude/commands/relay.md` will sync itself at next launch.

## Security Rules (do not remove or work around)

- **ANTHROPIC_API_KEY must always be stripped** before spawning Claude — `src/executor.js` does `delete spawnEnv.ANTHROPIC_API_KEY` on the copied env before every `spawn()` call. This is intentional: relay must use the user's claude.ai subscription, never an API key that could incur charges. Do not restore this key, pass it through, or forward it to any child process.

## Settings Defaults (do not change defaults without good reason)

- `autoResumeOnLimit: true` — re-schedule stopped tasks at exact reset time
- `allowExtendedUsage: false` — don't auto-run past the free limit
- `skipPermissions: true` — unattended execution via `--dangerously-skip-permissions`
