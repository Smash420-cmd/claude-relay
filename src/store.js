'use strict'
// Task + settings persistence. JSON file under the app's userData dir.
//
// Why JSON not SQLite (per the outline's "SQLite" line): for the MVP scaffold a JSON file has
// zero native-module build risk and the data volume is tiny. The interface below is the seam —
// swap the load()/save() internals for SQLite later without touching callers.
const fs = require('fs')
const path = require('path')
const { tasksFile } = require('./paths')

const SETTINGS_VERSION = 3 // bump when a default changes meaning so existing stores get migrated

const DEFAULT_SETTINGS = {
  hasSeenWelcome: false,
  claudeCommand: 'claude',      // CLI binary; set to a full path if `claude` isn't on PATH
  defaultProjectPath: '',       // cwd used for tasks that don't set their own
  sessionStartTime: '02:00',    // local HH:MM — when you typically START a Claude session; reset = this + 5h
  weeklyStartDay: 'Monday',     // day of week your 7d window started
  weeklyStartTime: '02:00',     // local HH:MM on that day; used as fallback weekly reset when API unavailable
  autoResumeOnLimit: true,      // ON: re-schedule stopped tasks at the exact moment the limit resets
  schedulerIntervalSec: 20,     // how often the due-task loop ticks
  allowExtendedUsage: false,    // OFF by default — don't auto-run past the free limit and spend credits
  pauseAtPct: 100,              // defer scheduled runs at/above this session % (when allowExtendedUsage is off)
  skipPermissions: true,        // --dangerously-skip-permissions: unattended tasks edit/run/commit with no gate
  defaultModel: '',             // empty = no --model flag (Claude Code default, currently Sonnet 4.6)
  defaultEffort: '',            // empty = no --effort flag (model default, currently high)
  skillAutoResumeOnLimit: false, // OFF: /relay-autoresume skill self-schedules a resume when a session hits its limit
  // tracker window/limit knobs intentionally omitted — no UI, hardcoded in tracker.js
}

function emptyDB() { return { tasks: [], settings: { ...DEFAULT_SETTINGS } } }

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(tasksFile(), 'utf8'))
    db.tasks = Array.isArray(db.tasks) ? db.tasks : []
    // Version migration: if stored version is behind, re-apply defaults for changed keys
    // so users with existing settings pick up new defaults automatically.
    if ((db.settingsVersion || 0) < SETTINGS_VERSION) {
      db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) }
      delete db.settings.dailyResetTime // removed in v3 — replaced by sessionStartTime + weekly* keys
      db.settingsVersion = SETTINGS_VERSION
      save(db)
    } else {
      db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) }
    }
    return db
  } catch (e) {
    // A corrupt store must NEVER silently become an empty one — the next save
    // would make the wipe permanent (this ate every pre-Jul-5 task, including
    // the Hidden Examiner weekly). Quarantine the bad file for recovery, fall
    // back to the last-known-good .bak if one exists, and say so loudly.
    const file = tasksFile()
    if (fs.existsSync(file)) {
      try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`) } catch {}
      console.error('[store] relay-data.json unreadable — quarantined a copy:', e.message)
      try {
        const bak = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'))
        bak.tasks = Array.isArray(bak.tasks) ? bak.tasks : []
        bak.settings = { ...DEFAULT_SETTINGS, ...(bak.settings || {}) }
        console.error('[store] recovered from .bak —', bak.tasks.length, 'tasks')
        return bak
      } catch {}
    }
    return emptyDB()
  }
}

function save(db) {
  const file = tasksFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // One-generation backup of the outgoing state — the corruption fallback in load()
  try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak') } catch {}
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, file) // atomic-ish replace
}

// Cross-process mutation lock — the CLI (scripts/relay.js) writes the same file, and an unlocked
// load→mutate→save pair loses whichever write lands first. `wx` create is atomic on NTFS; a lock
// older than 5s is a crashed writer and gets broken. Mirrored in scripts/relay.js.
function withLock(fn) {
  const lock = tasksFile() + '.lock'
  for (let i = 0; i < 50; i++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' })
      try { return fn() } finally { try { fs.unlinkSync(lock) } catch {} }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) { fs.unlinkSync(lock); continue } } catch {}
      const end = Date.now() + 20 // ponytail: sync spin-wait — mutations are millisecond-scale
      while (Date.now() < end) { /* wait */ }
    }
  }
  return fn() // lock never freed after ~1s of retries — proceed rather than drop the write
}

function getTasks() { return load().tasks }
function getTask(id) { return load().tasks.find(t => t.id === id) || null }
function addTask(task) { return withLock(() => { const db = load(); db.tasks.unshift(task); save(db); return task }) }
function updateTask(id, patch) {
  return withLock(() => {
    const db = load()
    const t = db.tasks.find(x => x.id === id)
    if (!t) return null
    Object.assign(t, patch)
    save(db)
    return t
  })
}
function deleteTask(id) { withLock(() => { const db = load(); db.tasks = db.tasks.filter(t => t.id !== id); save(db) }) }
function getSettings() { return load().settings }
function setSettings(patch) { return withLock(() => { const db = load(); db.settings = { ...db.settings, ...patch }; save(db); return db.settings }) }

// When a task is stopped by the session limit, push all pending scheduled tasks to just after
// the reset so they don't all pile up trying to fire while usage is still at 100%.
// Stagger by 30s each so the scheduler can sequence them cleanly after the resume task fires first.
function rescheduleAllPending(resetAt) {
  withLock(() => {
    const db = load()
    const resetMs = new Date(resetAt).getTime()
    let offset = 0
    for (const t of db.tasks) {
      if (t.status === 'scheduled' && new Date(t.schedule && t.schedule.at || 0).getTime() <= resetMs) {
        offset++
        const at = new Date(resetMs + offset * 30000).toISOString()
        // Repeat tasks keep their kind/interval — only the next fire time is pushed past the reset.
        t.schedule = t.schedule && t.schedule.kind === 'repeat' ? { ...t.schedule, at } : { kind: 'once', at }
      }
    }
    save(db)
  })
}

module.exports = {
  getTasks, getTask, addTask, updateTask, deleteTask, getSettings, setSettings, rescheduleAllPending,
}
