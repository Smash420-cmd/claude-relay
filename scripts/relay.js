#!/usr/bin/env node
'use strict'
// relay CLI — enqueue/list/cancel tasks from anywhere (Claude, scripts, the bench loop).
// Self-contained: writes the same store the app reads, so the app's watcher shows changes live.
//
//   node scripts/relay.js schedule --prompt "..." [--mode fresh|resume-full|resume-compact]
//        [--resume <id|current>] [--at next-reset|+30m|+2h|<ISO>] [--cwd <path>] [--title "..."]
//   node scripts/relay.js list
//   node scripts/relay.js cancel <id>
const fs = require('fs')
const os = require('os')
const path = require('path')

// ── locations (replicate Electron's userData convention so we hit the same store) ──
function userDataDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'relay')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'relay')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'relay')
}
const STORE = path.join(userDataDir(), 'relay-data.json')
const USAGE = path.join(os.homedir(), '.relay', 'usage.json')
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CLAUDE_SESSIONS = path.join(os.homedir(), '.claude', 'sessions')

// ── store ──
function loadStore() {
  try { const d = JSON.parse(fs.readFileSync(STORE, 'utf8')); d.tasks = d.tasks || []; d.settings = d.settings || {}; return d }
  catch { return { tasks: [], settings: {} } }
}
function saveStore(db) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true })
  const tmp = STORE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, STORE)
}

// ── helpers ──
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

function currentSessionId() {
  try {
    let best = null
    for (const f of fs.readdirSync(CLAUDE_SESSIONS)) {
      if (!f.endsWith('.json')) continue
      try { const o = JSON.parse(fs.readFileSync(path.join(CLAUDE_SESSIONS, f), 'utf8')); if (o.sessionId && (!best || (o.updatedAt || 0) > (best.updatedAt || 0))) best = o } catch {}
    }
    return best && best.sessionId
  } catch { return null }
}
function findSessionCwd(id) {
  try {
    for (const p of fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true })) {
      if (!p.isDirectory()) continue
      const fp = path.join(CLAUDE_PROJECTS, p.name, id + '.jsonl')
      if (!fs.existsSync(fp)) continue
      for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
        if (line.indexOf('"cwd"') === -1) continue
        try { const o = JSON.parse(line); if (o.cwd) return o.cwd } catch {}
      }
    }
  } catch {}
  return null
}
function nextDailyReset(hhmm) {
  const [h, m] = String(hhmm || '02:20').split(':').map(n => parseInt(n, 10))
  const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d
}
// resolve --at into an ISO string
function resolveAt(at, settings) {
  if (!at || at === 'next-reset') {
    // prefer the real 5h reset from the statusLine bridge; else the configured daily reset
    try {
      const u = JSON.parse(fs.readFileSync(USAGE, 'utf8'))
      const r = u.rate_limits && u.rate_limits.five_hour && u.rate_limits.five_hour.resets_at
      if (r && r * 1000 > Date.now()) return new Date(r * 1000).toISOString()
    } catch {}
    return nextDailyReset(settings.dailyResetTime).toISOString()
  }
  const rel = String(at).match(/^\+(\d+)\s*(m|h|d)$/i)
  if (rel) {
    const n = parseInt(rel[1], 10), unit = rel[2].toLowerCase()
    const ms = unit === 'm' ? 60e3 : unit === 'h' ? 3600e3 : 86400e3
    return new Date(Date.now() + n * ms).toISOString()
  }
  const d = new Date(at)
  if (isNaN(d)) throw new Error(`--at: can't parse "${at}" (use next-reset, +30m, +2h, or an ISO datetime)`)
  return d.toISOString()
}

// ── arg parse ──
function parseFlags(argv) {
  const f = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq >= 0) f[a.slice(2, eq)] = a.slice(eq + 1)
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) f[a.slice(2)] = argv[++i]
      else f[a.slice(2)] = true
    } else pos.push(a)
  }
  return { f, pos }
}

// ── commands ──
function cmdSchedule(f) {
  if (!f.prompt) { console.error('error: --prompt is required'); process.exit(1) }
  const db = loadStore()
  let mode = f.mode || (f.resume ? 'resume-full' : 'fresh')
  let sessionId = null
  if (mode !== 'fresh') {
    sessionId = (f.resume === 'current' || f.session === 'current') ? currentSessionId() : (f.resume && f.resume !== true ? f.resume : f.session)
    if (!sessionId) { console.error('error: resume mode needs --resume <id|current>'); process.exit(1) }
  }
  let cwd = f.cwd || ''
  if (mode !== 'fresh' && !cwd && sessionId) cwd = findSessionCwd(sessionId) || ''
  const at = resolveAt(f.at, db.settings)
  const task = {
    id: uid(),
    title: f.title || String(f.prompt).slice(0, 60),
    prompt: String(f.prompt),
    mode,
    sessionId: sessionId || null,
    projectPath: cwd,
    model: f.model || null,
    effort: f.effort || null,
    schedule: { kind: 'once', at },
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  }
  db.tasks.unshift(task)
  saveStore(db)
  console.log(`✓ scheduled "${task.title}"`)
  console.log(`  ${task.mode}${sessionId ? ' · session ' + sessionId.slice(0, 8) : ''}${cwd ? ' · cwd ' + cwd : ''}`)
  console.log(`  fires ${new Date(at).toLocaleString()}  (id ${task.id})`)
}
function cmdList() {
  const db = loadStore()
  if (!db.tasks.length) return console.log('(no tasks)')
  for (const t of db.tasks) console.log(`${(t.status || '').padEnd(10)} ${t.id}  ${t.title}  →  ${t.schedule && t.schedule.at ? new Date(t.schedule.at).toLocaleString() : '-'}`)
}
function cmdCancel(id) {
  if (!id) { console.error('error: cancel needs a task id'); process.exit(1) }
  const db = loadStore()
  const t = db.tasks.find(x => x.id === id)
  if (!t) { console.error('no task ' + id); process.exit(1) }
  t.status = 'cancelled'; saveStore(db); console.log('✓ cancelled ' + id)
}
function cmdRestart() {
  const signalDir = path.join(os.homedir(), '.relay')
  const signalPath = path.join(signalDir, 'restart.signal')
  fs.mkdirSync(signalDir, { recursive: true })
  fs.writeFileSync(signalPath, new Date().toISOString())
  console.log('✓ restart signal sent — Relay will relaunch in a moment')
}

const { f, pos } = parseFlags(process.argv.slice(2))
const cmd = pos[0]
try {
  if (cmd === 'schedule') cmdSchedule(f)
  else if (cmd === 'list') cmdList()
  else if (cmd === 'cancel') cmdCancel(pos[1])
  else if (cmd === 'restart') cmdRestart()
  else {
    console.log('relay — usage:')
    console.log('  schedule --prompt "..." [--mode fresh|resume-full|resume-compact] [--resume <id|current>] [--at next-reset|+30m|<ISO>] [--cwd <path>] [--title "..."]')
    console.log('  list')
    console.log('  cancel <id>')
    console.log('  restart              — signal the running Relay tray app to relaunch')
  }
} catch (e) { console.error('error:', e.message); process.exit(1) }
