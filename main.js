'use strict'
// Relay — Electron main process. Owns the window, the tray (so the scheduler stays alive when the
// window is closed), the due-task scheduler, the executor, and all IPC.
const { app, BrowserWindow, Tray, Menu, MenuItem, ipcMain, nativeImage, shell, session, dialog } = require('electron')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const { autoUpdater } = require('electron-updater')
const store = require('./src/store')
const sessions = require('./src/sessions')
const executor = require('./src/executor')
const scheduler = require('./src/scheduler')
const tracker = require('./src/tracker')
const { logsDir, dataDir } = require('./src/paths')
const { normPct, pickResetAt, isLimitFalsePositive } = require('./src/usage')

// Shared helper — called by the IPC renderer bridge AND by runDueTask after a limit-stopped run
// to get the exact reset timestamps so auto-resume fires at precisely the right moment.
async function fetchClaudeUsage({ retries = 2, retryDelayMs = 3000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai', name: 'sessionKey' })
      if (!cookies.length) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, retryDelayMs)); continue }
        return { error: 'not_logged_in' }
      }
      const headers = { 'Cookie': `sessionKey=${cookies[0].value}`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Cache-Control': 'no-store' }
      const orgs = await fetch('https://claude.ai/api/organizations', { headers, cache: 'no-store' }).then(r => r.json())
      const orgId = orgs[0] && orgs[0].uuid
      if (!orgId) return { error: 'no_org' }
      const data = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { headers, cache: 'no-store' }).then(r => r.json())
      return {
        sessionPct: normPct(data.five_hour),
        weeklyPct: normPct(data.seven_day),
        sessionResetsAt: data.five_hour && data.five_hour.resets_at ? new Date(data.five_hour.resets_at).getTime() : null,
        weeklyResetsAt: data.seven_day && data.seven_day.resets_at ? new Date(data.seven_day.resets_at).getTime() : null,
      }
    } catch (e) {
      if (attempt < retries) { await new Promise(r => setTimeout(r, retryDelayMs)); continue }
      throw e
    }
  }
}

let win = null
let tray = null
let hasTray = false
let stopScheduler = null
const running = new Map() // taskId -> child process (for cancel)

// Force a stable userData path regardless of productName / Electron default.
// The CLI (scripts/relay.js) writes to %APPDATA%\relay — keep them in sync.
app.setPath('userData', path.join(app.getPath('appData'), 'relay'))

// Single instance: a scheduler running twice would double-fire tasks.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus() } })
  main()
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

function notifyChange() {
  if (win && !win.isDestroyed()) win.webContents.send('relay:changed')
}

// Watch the store file so EXTERNAL writes (Claude/`relay schedule` enqueuing work directly into the
// queue — the whole point of §4b) show up in the UI without a manual reload. Watches the dir
// (atomic tmp+rename replaces the file inode) and debounces.
function watchStore() {
  try {
    let timer = null
    fs.watch(dataDir(), (_event, filename) => {
      if (filename && String(filename).startsWith('relay-data.json')) {
        clearTimeout(timer)
        timer = setTimeout(notifyChange, 300)
      }
    })
  } catch (e) { console.error('[watchStore]', e.message) }
}

// Watch ~/.relay/ for restart signals and usage.json updates.
// - restart.signal: written by `relay restart` — relaunches the app remotely.
// - usage.json: written by the statusLine bridge on every Claude Code response —
//   push a renderer refresh immediately so the usage bar tracks claude.ai in real time.
function watchRelayDir() {
  const relayDir = path.join(os.homedir(), '.relay')
  const signalPath = path.join(relayDir, 'restart.signal')
  try {
    fs.mkdirSync(relayDir, { recursive: true })
    fs.watch(relayDir, (_event, filename) => {
      if (filename === 'restart.signal' && fs.existsSync(signalPath)) {
        try { fs.unlinkSync(signalPath) } catch {}
        app.relaunch()
        app.exit(0)
      }
      if (filename === 'usage.json') notifyChange()
    })
  } catch (e) { console.error('[watchRelayDir]', e.message) }
}

function createWindow() {
  win = new BrowserWindow({
    width: 900, height: 700, minWidth: 660, minHeight: 480,
    backgroundColor: '#0d1117',
    title: '/relay',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.removeMenu()
  // Keep reload working even with the menu stripped (Ctrl/Cmd+R, F5).
  win.webContents.on('before-input-event', (e, input) => {
    const k = (input.key || '').toLowerCase()
    if (((input.control || input.meta) && k === 'r') || input.key === 'F5') win.webContents.reload()
    if ((input.control || input.meta) && input.shift && k === 'i') win.webContents.openDevTools()
  })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.webContents.on('context-menu', async (_e, params) => {
    const menu = new Menu()
    const ef = params.editFlags
    if (ef.canCut || ef.canCopy || ef.canPaste || ef.canSelectAll) {
      if (params.dictionarySuggestions?.length) {
        for (const s of params.dictionarySuggestions)
          menu.append(new MenuItem({ label: s, click: () => win.webContents.replaceMisspelling(s) }))
        menu.append(new MenuItem({ type: 'separator' }))
      }
      menu.append(new MenuItem({ role: 'cut',       enabled: ef.canCut }))
      menu.append(new MenuItem({ role: 'copy',      enabled: ef.canCopy }))
      menu.append(new MenuItem({ role: 'paste',     enabled: ef.canPaste }))
      menu.append(new MenuItem({ role: 'selectAll', enabled: ef.canSelectAll }))
      menu.popup()
      return
    }
    const taskId = await win.webContents.executeJavaScript('window.__ctxTaskId ?? null').catch(() => null)
    if (!taskId) return
    const t = store.getTasks().find(x => x.id === taskId)
    if (!t) return
    const send = (action) => win.webContents.send('relay:ctx-action', taskId, action)
    const canRunNow = t.status !== 'running'
    const canCancel = t.status === 'scheduled' || t.status === 'running'
    const canRetry  = ['failed','stopped','cancelled','interrupted'].includes(t.status)
    const canResume = ['stopped','failed','interrupted'].includes(t.status)
    Menu.buildFromTemplate([
      { label: 'Edit',                             click: () => send('edit') },
      { type: 'separator' },
      ...(canRunNow ? [{ label: 'Run now',         click: () => send('run') }]    : []),
      ...(canResume ? [{ label: 'Resume at reset', click: () => send('resume') }] : []),
      ...(canRetry  ? [{ label: 'Re-arm',          click: () => send('retry') }]  : []),
      ...(canCancel ? [{ label: 'Cancel',          click: () => send('cancel') }] : []),
      ...(t.lastLogPath ? [{ label: 'View log',    click: () => send('log') }]    : []),
      { type: 'separator' },
      { label: 'Delete', click: () => send('delete') },
    ]).popup()
  })
  win.on('close', (e) => {
    // Keep the app (and scheduler) alive in the tray instead of quitting — unless there's no tray.
    if (hasTray && !app.isQuitting) { e.preventDefault(); win.hide() }
  })
}

async function runDueTask(task, opts = {}) {
  const settings = store.getSettings()
  // Cost guard — "extended (paid) usage" off: don't AUTO-run a task while at/over the free session
  // limit (it would spend credits). Leave it scheduled; the scheduler retries each tick and it runs
  // once usage resets. Manual "Run now" bypasses this (you explicitly asked). Only gates on LIVE
  // usage data — never on the rough transcript estimate.
  if (!opts.manual && !settings.allowExtendedUsage && (task.schedule || {}).kind !== 'once') {
    try {
      const snap = tracker.snapshot(settings)
      if (snap.source === 'live' && snap.session && snap.session.pct != null && snap.session.pct >= (settings.pauseAtPct || 100)) {
        return // deferred until usage resets
      }
    } catch {}
  }
  store.updateTask(task.id, { status: 'running', lastRunAt: new Date().toISOString() })
  notifyChange()
  // Resume tasks MUST run in the session's own project dir (sessions are cwd-scoped), or
  // `claude --resume` reports "no conversation found". Fall back to that if no cwd was set.
  let cwd = task.projectPath || settings.defaultProjectPath || undefined
  if (task.mode === 'resume-full' && task.sessionId && !task.projectPath) {
    cwd = sessions.findSessionCwd(task.sessionId) || cwd
  }
  const res = await executor.runTask(task, {
    command: settings.claudeCommand || 'claude',
    cwd,
    skipPermissions: settings.skipPermissions !== false, // user-enabled autonomous execution (default on)
    onStart: (child) => running.set(task.id, child),
  })
  running.delete(task.id)
  store.updateTask(task.id, {
    status: res.status,
    lastLogPath: res.logPath,
    lastExitCode: res.exitCode,
    resetHint: res.resetHint || null,
    resultSessionId: res.resultSessionId || null,
  })
  // Core feature: when a run stops on a session/weekly limit and auto-resume is on, schedule a
  // resume at the exact reset moment. "stopped" comes from text-matching the CLI output, which can
  // false-positive (a task that merely prints "resets at …"). When logged in, corroborate with the
  // usage API as a VETO: if it's reachable AND both windows are clearly below a limit, it's a false
  // positive — relabel the run by its exit code and don't resume. If the API is unavailable (logged
  // out / blip), we're in manual mode and trust the text match (a phantom there is cancelable).
  if (res.status === 'stopped' && settings.autoResumeOnLimit) {
    let usage = null
    try { usage = await fetchClaudeUsage() } catch {}
    if (isLimitFalsePositive(usage)) {
      const realStatus = res.exitCode === 0 ? 'succeeded' : 'failed'
      store.updateTask(task.id, { status: realStatus })
      console.log(`[autoresume] limit text matched but usage is ${usage.sessionPct}%/${usage.weeklyPct}% — false positive, not resuming`)
    } else {
      if (res.resultSessionId && !task.sessionId) task = { ...task, sessionId: res.resultSessionId, mode: 'resume-full' }
      queueResume(task, pickResetAt(usage))
    }
  }
  notifyChange()
}

// resetAt: ISO string from the Claude API (exact moment the 5h or 7d window resets).
// Without API: 3 quick retries every 2 min to catch the reset, then 1h hold with all pending paused.
function queueResume(task, resetAt) {
  const settings = store.getSettings()
  const resumeCount = (task.resumeCount || 0) + 1
  if (resumeCount > 10) return // bounded — never loop forever

  let at
  if (resetAt) {
    at = resetAt
    store.rescheduleAllPending(resetAt)
  } else if (resumeCount <= 3) {
    // Quick retries: 2 min apart — catches the reset the moment it clears
    at = new Date(Date.now() + 2 * 60 * 1000).toISOString()
  } else {
    // 3 quick retries exhausted: wait 1h, hold all pending jobs until then
    at = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    store.rescheduleAllPending(at)
  }

  store.addTask({
    id: uid(),
    title: `Resume: ${task.title}`,
    prompt: task.prompt || 'continue',
    mode: task.mode === 'fresh' ? 'fresh' : (task.mode || 'resume-full'),
    sessionId: task.sessionId || null,
    projectPath: task.projectPath || '',
    model: task.model || null,
    effort: task.effort || null,
    schedule: { kind: 'once', at },
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    resumeOf: task.id,
    resumeCount,
  })
}

// Write a Claude Code skill file (~/.claude/commands/<filename>). Called at startup so skills
// self-update silently when the app ships a new version.
function writeSkill(filename, content) {
  try {
    const skillDir = path.join(os.homedir(), '.claude', 'commands')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, filename), content)
  } catch (e) {
    console.warn(`[skill] could not write ${filename}:`, e.message)
  }
}

function writeRelaySkill() {
  writeSkill('relay.md', `Schedule the described work into the Relay queue for later autonomous Claude Code execution.

Parse the user's message and extract:
- **title**: short label ≤60 chars
- **prompt**: the full task Claude should run — be specific, it runs unattended in a headless session
- **at**: when to run — convert natural language ("4pm tuesday", "tomorrow 9am", "in 2 hours") to ISO 8601 in the user's local timezone
- **model** *(optional)*: one of \`claude-opus-4-8\`, \`claude-sonnet-4-6\`, \`claude-haiku-4-5-20251001\`, \`claude-opus-4-7\`, \`claude-opus-4-6\`, \`claude-sonnet-4-5-20250929\` — omit to use the default (Sonnet 4.6)
- **effort** *(optional)*: \`low\`, \`medium\`, \`high\`, \`xhigh\` (Opus 4.8/4.7 only), or \`max\` — omit to use the model default; not supported on Haiku 4.5

Run via Bash:
\`\`\`bash
relay schedule --title "TITLE" --prompt "PROMPT" --at "ISO_DATETIME"
\`\`\`

Add \`--cwd "PROJECT_PATH"\` if the task is for a specific project directory.
Add \`--model "MODEL_ID"\` if the user specified a model.
Add \`--effort "LEVEL"\` if the user specified an effort level (and the model supports it).

## Resuming a previous Relay session

When a relay task runs, it creates or uses a Claude Code session. Relay records that session's UUID in the task log. To schedule a follow-up that resumes the same session:

\`\`\`bash
# 1. Find the session UUID from the completed task's log
relay log TASK_ID
# Look for the last line: "# session: <uuid>"

# 2. Schedule the follow-up targeting that session
relay schedule --title "TITLE" --prompt "PROMPT" --at "ISO_DATETIME" \\
  --mode resume-full --resume SESSION_UUID --cwd "PROJECT_PATH"
\`\`\`

To resume your *current* session (the one you are running in right now):
\`\`\`bash
relay schedule --title "TITLE" --prompt "PROMPT" --at "ISO_DATETIME" \\
  --mode resume-full --resume current --cwd "PROJECT_PATH"
\`\`\`

Confirm with one line after scheduling: \`✓ "TITLE" → HUMAN_READABLE_TIME\`
`)
}

function writeRelayCmdShim() {
  try {
    const scriptsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts')
      : path.join(app.getAppPath(), 'scripts')
    const shim = path.join(scriptsDir, 'relay.cmd')
    if (!fs.existsSync(shim)) fs.writeFileSync(shim, '@echo off\nnode "%~dp0relay.js" %*\n')
  } catch (e) {
    console.warn('[shim] could not write relay.cmd:', e.message)
  }
}

function writeRelayConfig() {
  try {
    const dir = path.join(os.homedir(), '.relay')
    fs.mkdirSync(dir, { recursive: true })
    const settings = store.getSettings()
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      skillAutoResumeOnLimit: !!settings.skillAutoResumeOnLimit,
    }, null, 2))
  } catch (e) {
    console.warn('[config] could not write ~/.relay/config.json:', e.message)
  }
}

function writeAutoResumeSkill() {
  writeSkill('relay-autoresume.md', `Arm this session for automatic resume via /relay if the usage limit is hit.

## Steps — run these NOW, immediately when /relay-autoresume is invoked

1. Check the setting:
\`\`\`bash
cat ~/.relay/config.json
\`\`\`

2. If \`skillAutoResumeOnLimit\` is \`false\`: tell the user "Auto-resume is off — enable it in /relay Settings." and stop.

3. If \`skillAutoResumeOnLimit\` is \`true\`:

   a. Write a one-sentence summary of what this session is working on.

   b. Write the arm file — /relay monitors this and will schedule a resume automatically when usage hits 100%:
\`\`\`bash
node -e "
const os=require('os'),fs=require('fs'),path=require('path');
// capture current session ID from the most recently modified session file
let sessionId=null;
try{const d=path.join(os.homedir(),'.claude','sessions');const f=fs.readdirSync(d).filter(x=>x.endsWith('.json')).map(x=>({x,m:fs.statSync(path.join(d,x)).mtimeMs})).sort((a,b)=>b.m-a.m)[0];if(f){const o=JSON.parse(fs.readFileSync(path.join(d,f.x),'utf8'));sessionId=o.sessionId||null;}}catch{}
fs.mkdirSync(path.join(os.homedir(),'.relay'),{recursive:true});
fs.writeFileSync(path.join(os.homedir(),'.relay','autoresume.json'),JSON.stringify({prompt:'RESUME_PROMPT',cwd:process.cwd(),sessionId,armedAt:new Date().toISOString()},null,2));
console.log('Armed — session:',sessionId||'(not found)');
"
\`\`\`

   c. Tell the user: "✓ Armed — /relay will auto-schedule a resume if your usage limit is hit. No action needed."

## How it works

The arm file (\`~/.relay/autoresume.json\`) is watched by the /relay app. When /relay detects usage has hit 100% it reads the file, schedules a resume task at the exact reset time, and removes the file. If the session ends normally without hitting a limit, the file expires automatically after 8 hours.
`)
}

// Watch ~/.relay/autoresume.json — written by /relay-autoresume skill.
// When usage hits 100%, schedule a resume and remove the file.
let autoResumeHits = 0 // consecutive ticks observed at >=100% — confirm before acting
async function checkAutoResumeArm() {
  const armFile = path.join(os.homedir(), '.relay', 'autoresume.json')
  let arm
  try {
    const stat = fs.statSync(armFile)
    if (Date.now() - stat.mtimeMs > 8 * 60 * 60 * 1000) { fs.unlinkSync(armFile); return } // expired
    arm = JSON.parse(fs.readFileSync(armFile, 'utf8'))
  } catch { autoResumeHits = 0; return }
  if (!arm || !arm.prompt) return
  try {
    const usage = await fetchClaudeUsage()
    if (usage.error) return
    if (usage.sessionPct < 100 && usage.weeklyPct < 100) { autoResumeHits = 0; return }
    // Require two consecutive readings at >=100% before burning the (single-use) arm — guards
    // against a transient API blip scheduling a spurious resume the user never hit a limit for.
    if (++autoResumeHits < 2) { console.log('[autoresume] usage at 100% — confirming on next tick'); return }
    autoResumeHits = 0
    const settings = store.getSettings()
    const at = pickResetAt(usage) || scheduler.nextSessionReset(settings.sessionStartTime).toISOString()
    store.addTask({
      id: uid(), title: `Auto-resume: ${String(arm.prompt).slice(0, 50)}`,
      prompt: arm.prompt, mode: arm.sessionId ? 'resume-full' : 'fresh', sessionId: arm.sessionId || null,
      projectPath: arm.cwd || '', model: null, effort: null,
      schedule: { kind: 'once', at }, status: 'scheduled',
      createdAt: new Date().toISOString(),
    })
    fs.unlinkSync(armFile)
    notifyChange()
    console.log('[autoresume] usage at 100% — resume scheduled at', at)
  } catch (e) {
    console.warn('[autoresume] check failed:', e.message)
  }
}

function writeRelayListenSkill() {
  writeSkill('relay-listen.md', `Hibernate this session until relay tasks complete, then act on or report the findings.

## Steps

1. Run \`relay list\` — note every task ID currently in \`scheduled\` or \`running\` status
2. If none, tell the user the relay queue is empty and stop
3. Otherwise enter a 2-minute polling loop using \`/loop 120\`:
   - Each wake: run \`relay list\`
   - If all watched tasks are now \`done\`, \`failed\`, or \`cancelled\` → exit the loop, go to step 4
   - Otherwise: show how many tasks remain and wait for the next tick
4. For each finished task run \`relay log <id>\` to read its output
5. Act on the results:
   - If outputs contain actionable findings (code to integrate, errors to fix, a plan to execute) → do the work now
   - If outputs are informational → write a concise report the user can read on return, saved to \`relay-listen-report.md\` in the current directory
`)
}

function registerIpc() {
  ipcMain.handle('relay:list', () => store.getTasks())
  ipcMain.handle('relay:usage', () => { try { return tracker.snapshot(store.getSettings()) } catch (e) { return { error: String(e && e.message) } } })
  ipcMain.handle('relay:settings:get', () => store.getSettings())
  ipcMain.handle('relay:settings:set', (_e, patch) => { const s = store.setSettings(patch); writeRelayConfig(); return s })
  ipcMain.handle('relay:sessions:list', () => sessions.listSessions())
  ipcMain.handle('relay:browse-folder', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('relay:create', async (_e, input) => {
    const settings = store.getSettings()
    const schedule = { ...(input.schedule || {}) }
    if (schedule.kind === 'at-next-reset' && !schedule.at) {
      let resetAt = null
      try {
        const usage = await fetchClaudeUsage()
        if (!usage.error && usage.sessionResetsAt && usage.sessionResetsAt > Date.now()) {
          resetAt = new Date(usage.sessionResetsAt).toISOString()
        }
      } catch {}
      schedule.at = resetAt || scheduler.nextSessionReset(settings.sessionStartTime).toISOString()
    }
    const task = {
      id: uid(),
      title: (input.title && input.title.trim()) || (input.prompt || '').trim().slice(0, 60) || 'Untitled task',
      prompt: input.prompt || '',
      mode: input.mode || 'fresh',
      sessionId: input.sessionId || null,
      projectPath: input.projectPath || '',
      schedule,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    }
    store.addTask(task)
    notifyChange()
    return task
  })

  ipcMain.handle('relay:cancel', (_e, id) => {
    const child = running.get(id)
    if (child) { try { child.kill() } catch {} running.delete(id) }
    store.updateTask(id, { status: 'cancelled' })
    notifyChange()
  })

  ipcMain.handle('relay:delete', (_e, id) => {
    const child = running.get(id)
    if (child) { try { child.kill() } catch {} running.delete(id) }
    store.deleteTask(id)
    notifyChange()
  })

  ipcMain.handle('relay:retry', (_e, id) => {
    // Cancel any auto-created resume tasks for this task before re-arming the original
    for (const t of store.getTasks()) {
      if (t.resumeOf === id && t.status === 'scheduled') store.updateTask(t.id, { status: 'cancelled' })
    }
    store.updateTask(id, { status: 'scheduled' })
    notifyChange()
  })
  ipcMain.handle('relay:update', (_e, id, patch) => { store.updateTask(id, patch); notifyChange() })

  ipcMain.handle('relay:run-now', async (_e, id) => {
    const t = store.getTask(id)
    if (t && (t.status === 'scheduled' || t.status === 'failed' || t.status === 'stopped' || t.status === 'cancelled')) {
      await runDueTask(t, { manual: true }) // explicit run bypasses the extended-usage gate
    }
  })

  ipcMain.handle('relay:resume-at-reset', async (_e, id) => {
    const t = store.getTask(id)
    if (!t) return
    // Don't stack a second resume if one is already scheduled
    const already = store.getTasks().find(x => x.resumeOf === id && x.status === 'scheduled')
    if (already) { notifyChange(); return }
    // Fetch the live reset time so queueResume schedules at the real moment
    // and rescheduleAllPending pushes all stale tasks to align with it too.
    let resetAt = null
    try { resetAt = pickResetAt(await fetchClaudeUsage()) } catch {}
    queueResume(t, resetAt)
    notifyChange()
  })

  // Capture a (possibly limited-out) session to pick back up at the reset moment.
  ipcMain.handle('relay:capture-session', async (_e, input) => {
    if (!input || !input.sessionId) return
    const settings = store.getSettings()
    const at = input.resetsAt ? new Date(input.resetsAt).toISOString()
      : (pickResetAt(await fetchClaudeUsage().catch(() => null))
         || scheduler.nextSessionReset(settings.sessionStartTime).toISOString())
    store.addTask({
      id: uid(),
      title: input.title || `Resume session ${String(input.sessionId).slice(0, 8)}`,
      prompt: input.prompt || 'continue',
      mode: 'resume-full',
      sessionId: input.sessionId,
      projectPath: input.projectPath || '',
      schedule: { kind: 'once', at },
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    })
    notifyChange()
  })

  ipcMain.handle('relay:claude-usage', async () => {
    try { return await fetchClaudeUsage() } catch (e) { return { error: e.message } }
  })

  ipcMain.handle('relay:claude-login', () => {
    const loginWin = new BrowserWindow({ width: 960, height: 700, title: 'Log in to Claude' })
    loginWin.loadURL('https://claude.ai/login')
    // Close once the user lands back on claude.ai (login complete)
    loginWin.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith('https://claude.ai') && !url.includes('/login') && !url.includes('/auth')) loginWin.close()
    })
  })

  ipcMain.handle('relay:login-item:get', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('relay:login-item:set', (_e, val) => app.setLoginItemSettings({ openAtLogin: !!val }))
  ipcMain.handle('relay:version', () => app.getVersion())
  ipcMain.handle('relay:install-update', () => autoUpdater.quitAndInstall(false, true))

  ipcMain.handle('relay:statusline-path', () => {
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : app.getAppPath()
    return path.join(base, 'scripts', 'relay-statusline.js').replace(/\\/g, '/')
  })

  ipcMain.handle('relay:claude-logout', async () => {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey')
  })

  ipcMain.handle('relay:logs:get', (_e, logPath) => {
    try { return fs.readFileSync(logPath, 'utf8') } catch { return '(log not found)' }
  })
  ipcMain.handle('relay:logs:open', () => shell.openPath(logsDir()))

  ipcMain.handle('relay:setup-skill', () => {
    const scriptsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts')
      : path.join(app.getAppPath(), 'scripts')

    // Write relay.cmd so `relay` works as a bare command on Windows PATH
    fs.writeFileSync(path.join(scriptsDir, 'relay.cmd'), '@echo off\nnode "%~dp0relay.js" %*\n')

    // Add scripts dir to user PATH (HKCU — no elevation needed)
    try {
      const cur = execFileSync('powershell', ['-NoProfile', '-Command',
        '[Environment]::GetEnvironmentVariable("Path","User")'
      ], { encoding: 'utf8' }).trim()
      const parts = cur.split(';').map(p => p.trim()).filter(Boolean)
      if (!parts.some(p => p.toLowerCase() === scriptsDir.toLowerCase())) {
        const next = [...parts, scriptsDir].join(';')
        execFileSync('powershell', ['-NoProfile', '-Command',
          `[Environment]::SetEnvironmentVariable("Path","${next}","User")`
        ])
      }
    } catch (e) {
      return { ok: false, error: `PATH update failed: ${e.message}` }
    }

    // Write the /relay Claude Code skill
    writeRelaySkill()

    return { ok: true }
  })
}

function makeTray() {
  const iconPath = path.join(__dirname, 'assets', 'relay_tray', 'favicon.ico')
  let img = nativeImage.createFromPath(iconPath)
  if (img.isEmpty()) return // no icon → window-only mode (see window-all-closed below)
  try {
    tray = new Tray(img)
    tray.setToolTip('/relay')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open /relay', click: () => { if (win) { win.show(); win.focus() } else createWindow() } },
      { type: 'separator' },
      { label: 'Restart', click: () => { app.relaunch(); app.exit(0) } },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
    ]))
    tray.on('click', () => { if (win) { win.isVisible() ? win.focus() : win.show() } else createWindow() })
    hasTray = true
  } catch {
    hasTray = false
  }
}

// On startup, any task still marked 'running' was orphaned by a crash or force-quit.
// The child process is gone; mark them interrupted so they show up as retryable.
function rotateLogs(maxAgeDays = 14) {
  const dir = logsDir()
  try {
    const cutoff = Date.now() - maxAgeDays * 86400000
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p) } catch {}
    }
  } catch {}
}

function cleanupOrphanedTasks() {
  for (const t of store.getTasks()) {
    if (t.status === 'running') store.updateTask(t.id, { status: 'interrupted' })
  }
}

function main() {
  app.whenReady().then(() => {
    rotateLogs()
    cleanupOrphanedTasks()
    writeRelayCmdShim()
    writeRelaySkill()
    writeAutoResumeSkill()
    writeRelayListenSkill()
    writeRelayConfig()
    registerIpc()
    if (app.isPackaged) {
      autoUpdater.on('error', (err) => console.error('[updater] error:', err.message))
      autoUpdater.on('update-available', (info) => {
        if (win && !win.isDestroyed()) win.webContents.send('relay:update-available', info.version)
      })
      autoUpdater.on('update-downloaded', () => {
        if (win && !win.isDestroyed()) win.webContents.send('relay:update-ready')
      })
      autoUpdater.checkForUpdates().catch(e => console.error('[updater] check failed:', e.message))
      // recheck every 10 min in case the app was open when a release landed
      setInterval(() => autoUpdater.checkForUpdates().catch(e => console.error('[updater] check failed:', e.message)), 10 * 60 * 1000)
    }
    createWindow()
    makeTray()
    watchStore()
    const settings = store.getSettings()
    stopScheduler = scheduler.start({
      intervalMs: Math.max(5, settings.schedulerIntervalSec || 20) * 1000,
      getState: () => ({ tasks: store.getTasks(), settings: store.getSettings() }),
      runDueTask,
    })
    watchRelayDir()
    setInterval(checkAutoResumeArm, 30 * 1000)
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    if (stopScheduler) stopScheduler()
    // Kill every running child process so claude sessions don't outlive Relay
    running.forEach((child) => { try { child.kill() } catch {} })
    running.clear()
  })

  // Stay alive in the tray so the scheduler keeps running. Only quit on all-windows-closed if
  // there is NO tray to keep the app reachable.
  app.on('window-all-closed', () => { if (!hasTray) app.quit() })
}
