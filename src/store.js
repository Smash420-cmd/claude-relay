'use strict'
// Task + settings persistence. JSON file under the app's userData dir.
//
// Why JSON not SQLite (per the outline's "SQLite" line): for the MVP scaffold a JSON file has
// zero native-module build risk and the data volume is tiny. The interface below is the seam —
// swap the load()/save() internals for SQLite later without touching callers.
const fs = require('fs')
const path = require('path')
const { tasksFile } = require('./paths')

const DEFAULT_SETTINGS = {
  claudeCommand: 'claude',      // CLI binary; set to a full path if `claude` isn't on PATH
  defaultProjectPath: '',       // cwd used for tasks that don't set their own
  dailyResetTime: '02:20',      // local HH:MM the usage limit resets (drives "at next reset")
  autoResumeOnLimit: false,     // OFF until limit-detection is verified (Phase 0) — manual resume works today
  schedulerIntervalSec: 20,     // how often the due-task loop ticks
  allowExtendedUsage: true,     // false = pause auto-runs at the limit (don't spend credits); wait for reset
  pauseAtPct: 100,              // when extended usage is off, defer scheduled runs at/above this live session %
  skipPermissions: true,        // ON (user opted in 2026-06-22 — "the whole point is autonomous workflow").
                                // --dangerously-skip-permissions: unattended tasks edit/run/commit with no gate.
  // ── Usage tracker (gauge is an ESTIMATE: load tokens consumed ÷ these limits) ──
  sessionWindowHours: 5,        // Claude's rolling session window
  weeklyWindowDays: 7,
  sessionLoadLimit: 8000000,    // ESTIMATE — calibrate by watching when you actually hit the wall
  weeklyLoadLimit: 80000000,    // ESTIMATE
  weeklyOpusLoadLimit: 0,       // 0 = hide the Opus bar until you set it
}

function emptyDB() { return { tasks: [], settings: { ...DEFAULT_SETTINGS } } }

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(tasksFile(), 'utf8'))
    db.tasks = Array.isArray(db.tasks) ? db.tasks : []
    db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) }
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

module.exports = {
  DEFAULT_SETTINGS, getTasks, getTask, addTask, updateTask, deleteTask, getSettings, setSettings,
}
