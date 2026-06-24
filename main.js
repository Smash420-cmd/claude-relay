'use strict'
// Relay — Electron main process. Owns the window, the tray (so the scheduler stays alive when the
// window is closed), the due-task scheduler, the executor, and all IPC.
const { app, BrowserWindow, Tray, Menu, MenuItem, ipcMain, nativeImage, shell, session } = require('electron')
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
        sessionPct: data.five_hour ? data.five_hour.utilization : null,
        weeklyPct: data.seven_day ? data.seven_day.utilization : null,
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
  } catch {}
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
  } catch {}
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
  if (!opts.manual && !settings.allowExtendedUsage) {
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
  if ((task.mode === 'resume-full' || task.mode === 'resume-compact') && task.sessionId && !task.projectPath) {
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
  })
  // Core feature: when a run is stopped by the session/weekly limit and auto-resume is on,
  // fetch the exact reset time from the Claude API and schedule a resume at that moment.
  if (res.status === 'stopped' && settings.autoResumeOnLimit) {
    let resetAt = null
    try {
      const usage = await fetchClaudeUsage()
      if (!usage.error) {
        // Weekly at 100%? wait for the weekly reset — it's the binding constraint.
        if (usage.weeklyPct >= 100 && usage.weeklyResetsAt) resetAt = new Date(usage.weeklyResetsAt).toISOString()
        else if (usage.sessionResetsAt) resetAt = new Date(usage.sessionResetsAt).toISOString()
      }
    } catch {}
    queueResume(task, resetAt)
    // Push every other pending scheduled task to just after the reset so they
    // don't pile up firing at 100% — they'll queue behind the resumed task.
    if (resetAt) store.rescheduleAllPending(resetAt)
  }
  notifyChange()
}

// resetAt: ISO string from the Claude API (exact moment the 5h or 7d window resets).
// Falls back to the configured dailyResetTime estimate when the API is unavailable.
function queueResume(task, resetAt) {
  const settings = store.getSettings()
  const resumeCount = (task.resumeCount || 0) + 1
  if (resumeCount > 8) return // bounded — never loop forever
  const at = resetAt || scheduler.nextResetDate(settings.dailyResetTime).toISOString()
  store.addTask({
    id: uid(),
    title: `Resume: ${task.title}`,
    prompt: task.prompt || 'continue',
    mode: task.mode === 'fresh' ? 'fresh' : (task.mode || 'resume-full'),
    sessionId: task.sessionId || null,
    projectPath: task.projectPath || '',
    schedule: { kind: 'once', at },
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    resumeOf: task.id,
    resumeCount,
  })
}

function writeRelaySkill() {
  try {
    const skillDir = path.join(os.homedir(), '.claude', 'commands')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'relay.md'), [
      'Schedule the described work into the Relay queue for later autonomous Claude Code execution.',
      '',
      'Parse the user\'s message and extract:',
      '- **title**: short label ≤60 chars',
      '- **prompt**: the full task Claude should run — be specific, it runs unattended in a headless session',
      '- **at**: when to run — convert natural language ("4pm tuesday", "tomorrow 9am", "in 2 hours") to ISO 8601 in the user\'s local timezone',
      '- **model** *(optional)*: one of `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-5-20250929` — omit to use the default (Sonnet 4.6)',
      '- **effort** *(optional)*: `low`, `medium`, `high`, `xhigh` (Opus 4.8/4.7 only), or `max` — omit to use the model default; not supported on Haiku 4.5',
      '',
      'Run via Bash:',
      '```bash',
      'relay schedule --title "TITLE" --prompt "PROMPT" --at "ISO_DATETIME"',
      '```',
      '',
      'Add `--cwd "PROJECT_PATH"` if the task is for a specific project directory.',
      'Add `--model "MODEL_ID"` if the user specified a model.',
      'Add `--effort "LEVEL"` if the user specified an effort level (and the model supports it).',
      '',
      'Confirm with one line after scheduling: `✓ "TITLE" → HUMAN_READABLE_TIME`',
    ].join('\n'))
  } catch (e) {
    console.warn('[skill] could not write relay.md:', e.message)
  }
}

function registerIpc() {
  ipcMain.handle('relay:list', () => store.getTasks())
  ipcMain.handle('relay:usage', () => { try { return tracker.snapshot(store.getSettings()) } catch (e) { return { error: String(e && e.message) } } })
  ipcMain.handle('relay:settings:get', () => store.getSettings())
  ipcMain.handle('relay:settings:set', (_e, patch) => store.setSettings(patch))
  ipcMain.handle('relay:sessions:list', () => sessions.listSessions())

  ipcMain.handle('relay:create', (_e, input) => {
    const settings = store.getSettings()
    const schedule = { ...(input.schedule || {}) }
    if (schedule.kind === 'at-next-reset' && !schedule.at) {
      schedule.at = scheduler.nextResetDate(settings.dailyResetTime).toISOString()
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

  ipcMain.handle('relay:retry',  (_e, id) => { store.updateTask(id, { status: 'scheduled' }); notifyChange() })
  ipcMain.handle('relay:update', (_e, id, patch) => { store.updateTask(id, patch); notifyChange() })

  ipcMain.handle('relay:run-now', async (_e, id) => {
    const t = store.getTask(id)
    if (t && (t.status === 'scheduled' || t.status === 'failed' || t.status === 'stopped' || t.status === 'cancelled')) {
      await runDueTask(t, { manual: true }) // explicit run bypasses the extended-usage gate
    }
  })

  ipcMain.handle('relay:resume-at-reset', (_e, id) => {
    const t = store.getTask(id)
    if (t) { queueResume(t); notifyChange() }
  })

  // Capture a (possibly limited-out) session to pick back up at the reset moment.
  ipcMain.handle('relay:capture-session', (_e, input) => {
    const settings = store.getSettings()
    const at = input && input.resetsAt ? new Date(input.resetsAt).toISOString()
      : scheduler.nextResetDate(settings.dailyResetTime).toISOString()
    if (!input || !input.sessionId) return
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
      capturedFromSession: input.sessionId,
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
  const db = require('./src/store')
  const tasks = db.getTasks()
  for (const t of tasks) {
    if (t.status === 'running') db.updateTask(t.id, { status: 'interrupted' })
  }
}

function main() {
  app.whenReady().then(() => {
    rotateLogs()
    cleanupOrphanedTasks()
    writeRelaySkill()
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
