'use strict'
// Task + settings persistence. JSON file under the app's userData dir.
//
// Why JSON not SQLite (per the outline's "SQLite" line): for the MVP scaffold a JSON file has
// zero native-module build risk and the data volume is tiny. The interface below is the seam —
// swap the load()/save() internals for SQLite later without touching callers.
const fs = require('fs')
const path = require('path')
const { tasksFile } = require('./paths')

const SETTINGS_VERSION = 2 // bump when a default changes meaning so existing stores get migrated

const DEFAULT_SETTINGS = {
  hasSeenWelcome: false,
  claudeCommand: 'claude',      // CLI binary; set to a full path if `claude` isn't on PATH
  defaultProjectPath: '',       // cwd used for tasks that don't set their own
  dailyResetTime: '02:20',      // local HH:MM — fallback for "at next reset" when API is unavailable
  autoResumeOnLimit: true,      // ON: re-schedule stopped tasks at the exact moment the limit resets
  schedulerIntervalSec: 20,     // how often the due-task loop ticks
  allowExtendedUsage: false,    // OFF by default — don't auto-run past the free limit and spend credits
  pauseAtPct: 100,              // defer scheduled runs at/above this session % (when allowExtendedUsage is off)
  skipPermissions: true,        // --dangerously-skip-permissions: unattended tasks edit/run/commit with no gate
  defaultModel: '',             // empty = no --model flag (Claude Code default, currently Sonnet 4.6)
  defaultEffort: '',            // empty = no --effort flag (model default, currently high)
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
      db.settingsVersion = SETTINGS_VERSION
      save(db)
    } else {
      db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) }
    }
    return db
  } catch {
    return emptyDB()
  }
}

function save(db) {
  const file = tasksFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, file) // atomic-ish replace
}

function getTasks() { return load().tasks }
function getTask(id) { return load().tasks.find(t => t.id === id) || null }
function addTask(task) { const db = load(); db.tasks.unshift(task); save(db); return task }
function updateTask(id, patch) {
  const db = load()
  const t = db.tasks.find(x => x.id === id)
  if (!t) return null
  Object.assign(t, patch)
  save(db)
  return t
}
function deleteTask(id) { const db = load(); db.tasks = db.tasks.filter(t => t.id !== id); save(db) }
function getSettings() { return load().settings }
function setSettings(patch) { const db = load(); db.settings = { ...db.settings, ...patch }; save(db); return db.settings }

// When a task is stopped by the session limit, push all pending scheduled tasks to just after
// the reset so they don't all pile up trying to fire while usage is still at 100%.
// Stagger by 30s each so the scheduler can sequence them cleanly after the resume task fires first.
function rescheduleAllPending(resetAt) {
  const db = load()
  const resetMs = new Date(resetAt).getTime()
  let offset = 0
  for (const t of db.tasks) {
    if (t.status === 'scheduled' && new Date(t.schedule && t.schedule.at || 0).getTime() <= resetMs) {
      offset++
      t.schedule = { kind: 'once', at: new Date(resetMs + offset * 30000).toISOString() }
    }
  }
  save(db)
}

module.exports = {
  getTasks, getTask, addTask, updateTask, deleteTask, getSettings, setSettings, rescheduleAllPending,
}
