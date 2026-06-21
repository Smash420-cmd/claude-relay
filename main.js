'use strict'
// Relay — Electron main process. Owns the window, the tray (so the scheduler stays alive when the
// window is closed), the due-task scheduler, the executor, and all IPC.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const store = require('./src/store')
const sessions = require('./src/sessions')
const executor = require('./src/executor')
const scheduler = require('./src/scheduler')
const tracker = require('./src/tracker')
const { logsDir } = require('./src/paths')

let win = null
let tray = null
let hasTray = false
let stopScheduler = null
const running = new Map() // taskId -> child process (for cancel)

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

function createWindow() {
  win = new BrowserWindow({
    width: 900, height: 700, minWidth: 660, minHeight: 480,
    backgroundColor: '#0d1117',
    title: 'Relay',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.removeMenu()
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.on('close', (e) => {
    // Keep the app (and scheduler) alive in the tray instead of quitting — unless there's no tray.
    if (hasTray && !app.isQuitting) { e.preventDefault(); win.hide() }
  })
}

async function runDueTask(task) {
  store.updateTask(task.id, { status: 'running', lastRunAt: new Date().toISOString() })
  notifyChange()
  const settings = store.getSettings()
  // Resume tasks MUST run in the session's own project dir (sessions are cwd-scoped), or
  // `claude --resume` reports "no conversation found". Fall back to that if no cwd was set.
  let cwd = task.projectPath || settings.defaultProjectPath || undefined
  if ((task.mode === 'resume-full' || task.mode === 'resume-compact') && task.sessionId && !task.projectPath) {
    cwd = sessions.findSessionCwd(task.sessionId) || cwd
  }
  const res = await executor.runTask(task, {
    command: settings.claudeCommand || 'claude',
    cwd,
    onStart: (child) => running.set(task.id, child),
  })
  running.delete(task.id)
  store.updateTask(task.id, {
    status: res.status,
    lastLogPath: res.logPath,
    lastExitCode: res.exitCode,
    resetHint: res.resetHint || null,
  })
  // Killer-feature hook (guarded OFF by default until limit-detection is verified — Phase 0):
  // when a run is stopped by a limit and auto-resume is enabled, queue a resume at next reset.
  if (res.status === 'stopped' && settings.autoResumeOnLimit) {
    queueResume(task)
  }
  notifyChange()
}

function queueResume(task) {
  const settings = store.getSettings()
  const resumeCount = (task.resumeCount || 0) + 1
  if (resumeCount > 8) return // bounded — never loop forever
  store.addTask({
    id: uid(),
    title: `Resume: ${task.title}`,
    prompt: task.prompt || 'continue',
    mode: task.mode === 'fresh' ? 'fresh' : (task.mode || 'resume-full'),
    sessionId: task.sessionId || null,
    projectPath: task.projectPath || '',
    schedule: { kind: 'at-next-reset', at: scheduler.nextResetDate(settings.dailyResetTime).toISOString() },
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    resumeOf: task.id,
    resumeCount,
  })
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

  ipcMain.handle('relay:retry', (_e, id) => { store.updateTask(id, { status: 'scheduled' }); notifyChange() })

  ipcMain.handle('relay:run-now', async (_e, id) => {
    const t = store.getTask(id)
    if (t && (t.status === 'scheduled' || t.status === 'failed' || t.status === 'stopped' || t.status === 'cancelled')) {
      await runDueTask(t)
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

  ipcMain.handle('relay:logs:get', (_e, logPath) => {
    try { return fs.readFileSync(logPath, 'utf8') } catch { return '(log not found)' }
  })
  ipcMain.handle('relay:logs:open', () => shell.openPath(logsDir()))
}

function makeTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png')
  let img = nativeImage.createFromPath(iconPath)
  if (img.isEmpty()) return // no icon → window-only mode (see window-all-closed below)
  try {
    tray = new Tray(img)
    tray.setToolTip('Relay')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Relay', click: () => { if (win) { win.show(); win.focus() } else createWindow() } },
      { type: 'separator' },
      { label: 'Quit Relay', click: () => { app.isQuitting = true; app.quit() } },
    ]))
    tray.on('click', () => { if (win) { win.isVisible() ? win.focus() : win.show() } else createWindow() })
    hasTray = true
  } catch {
    hasTray = false
  }
}

function main() {
  app.whenReady().then(() => {
    registerIpc()
    createWindow()
    makeTray()
    const settings = store.getSettings()
    stopScheduler = scheduler.start({
      intervalMs: Math.max(5, settings.schedulerIntervalSec || 20) * 1000,
      getState: () => ({ tasks: store.getTasks(), settings: store.getSettings() }),
      runDueTask,
    })
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('before-quit', () => { app.isQuitting = true; if (stopScheduler) stopScheduler() })

  // Stay alive in the tray so the scheduler keeps running. Only quit on all-windows-closed if
  // there is NO tray to keep the app reachable.
  app.on('window-all-closed', () => { if (!hasTray) app.quit() })
}
