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

**Live-version policy (Patrick, 2026-07-10): Relay only ever runs as the published
release — never a locally side-loaded build.** Every repair, however small, ends with
this publish flow; the installed app picks it up via electron-updater. A local
`npm run build` + manual install is for testing the installer only, never the fix
delivery path. Repair sequence: fix → `node test/run.js` green → bump + commit →
build → publish (steps below) → verify `latest.yml` on the release shows the new version.

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
   # ⚠ CLAUDE CODE SESSIONS: if EPERM repeats past 3 attempts it is NOT Defender —
   #   the sandbox blocks node's directory rename. Run the build unsandboxed
   #   (dangerouslyDisableSandbox) and it succeeds first try (verified 2026-07-10,
   #   5 sandboxed failures → 1 unsandboxed success). Also never pipe the build
   #   through `| head` — SIGPIPE kills NSIS mid-write and leaves a ~600KB stub exe.
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

### Available models (as of 2026-10-01)

| Model ID | Label | Group | Effort support |
|----------|-------|-------|---------------|
| *(empty)* | Default · no `--model` (CLI decides) | — | low / medium / high / max |
| `claude-opus-5-5` | Opus 5.5 | Current | low / **medium** (default) / high — **capped at high** |
| `claude-sonnet-5-5` | Sonnet 5.5 | Current | low / medium / high / **xhigh** / max |
| `claude-haiku-4-5-20251001` | Haiku 4.5 | Current | **none** — effort flag must be omitted |
| `claude-fable-5-1` | Fable 5.1 (Max plan only) | Max plan | low / medium / high — **capped at high** |
| `claude-fable-5` | Fable 5 (Max plan only) | Max plan | low / medium / high — **capped at high** |
| `gpt-6.1-sol` | GPT-6.1 Sol | Codex (OpenAI) | low … max / **ultra** |
| `gpt-6-astra` / `gpt-6-sol` | GPT-6 Astra / Sol | Codex (OpenAI) | low … max / **ultra** |
| `gpt-6-luna` | GPT-6 Luna | Codex (OpenAI) | low … max |
| `gpt-5.6-sol` / `gpt-5.6-terra` | GPT-5.6 Sol / Terra | Codex (OpenAI) | low … max / **ultra** |
| `gpt-5.6-luna` | GPT-5.6 Luna | Codex (OpenAI) | low … max |
| `gpt-5.5` | GPT-5.5 | Codex (OpenAI) | low … xhigh |
| `claude-opus-5` | Opus 5 | Legacy | low / medium / high — **capped at high** |
| `claude-sonnet-5` | Sonnet 5 | Legacy | low / medium / high / **xhigh** / max |
| `claude-opus-4-8` | Opus 4.8 | Legacy | low / medium / high — **capped at high** |
| `claude-opus-4-7` | Opus 4.7 | Legacy | low / medium / high — **capped at high** |
| `claude-opus-4-6` | Opus 4.6 | Legacy | low / medium / high — **capped at high** |
| `claude-sonnet-4-6` | Sonnet 4.6 | Legacy | low / medium / high / max |
| `claude-sonnet-4-5-20250929` | Sonnet 4.5 | Legacy | low / medium / high / max |

**Codex routing** (2026-09-26): any model id matching `/^(gpt-|codex-|o\d)/` (`isCodexModel` in
`src/executor.js`) runs via `codex exec` instead of `claude` — effort becomes
`-c model_reasoning_effort="…"`, skip-permissions becomes `--dangerously-bypass-approvals-and-sandbox`,
the session id is read back from codex's `session id:` header, and resume uses `codex exec resume <id>`.
Codex list comes from `~/.codex/models_cache.json` (visibility `list`). `OPENAI_API_KEY` is scrubbed
like every `*_KEY`, so Codex runs on the ChatGPT login. A Codex limit stop is not auto-resumed.

**Opus + Fable effort cap** (Patrick, 2026-09-26): every model matching `/opus|fable/` runs at most
`high`; Opus 5.5 with unset effort = `medium`. `effortPolicy` in `src/executor.js` clamps every run;
`scripts/relay.js` rejects xhigh/max for them so scheduling agents can't set it.

`xhigh` is valid on the 5-family and on Opus 4.8 / 4.7 only. Sending it elsewhere causes a CLI error.
An empty model means no `--model` flag at all — the Claude CLI picks, and that pick changes between
CLI releases. Don't label it with a model name; the CLI `schedule` command requires `--model`/`--effort`
explicitly for exactly this reason.
On Opus 5, disabling thinking is rejected above `high` effort.

Every model × effort combination is smoke-tested by `scripts/test-models.js` — run it before bumping a version if model/effort code changes. It spawns real CLI runs and spends allowance, so it is not part of `npm run check`.

### Rules when adding/removing models

1. Update `MODELS` array in `renderer/app.js` (UI dropdowns)
2. Update the `writeRelaySkill()` function in `main.js` (skill text lists valid model IDs)
3. Update `~/.claude/commands/relay.md` locally (your own skill — overwritten at next app launch anyway)
4. Update the model table above in this file
5. Run `node scripts/test-models.js` to verify all combinations pass

### Model Availability Notes

- **claude-fable-5 is back in the list, gated** (Patrick, 2026-07-28 — supersedes the earlier "excluded, US Government security concerns" note). It sits in its own **Max plan** optgroup, labelled "Fable 5 (Max plan only)", never the default and never at the top of Current. Relay tasks run on the claude.ai subscription (`ANTHROPIC_API_KEY` is scrubbed before spawn), so the plan tier is what gates it — and it eats the premium weekly allowance fast.
- **Premium usage tracking is a name-pattern match** — `src/tracker.js` tests `/opus|fable|mythos/i` against the turn's model. Any new premium family whose name isn't in that regex is invisible to the Weekly · Opus gauge. Update the regex when a family is added.

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
