#!/usr/bin/env node
'use strict'
// relay CLI — enqueue/list/cancel tasks from anywhere (Claude, scripts, the bench loop).
// Self-contained: writes the same store the app reads, so the app's watcher shows changes live.
//
//   node scripts/relay.js schedule --prompt "..." [--mode fresh|resume-full]
//        [--resume <id|current>] [--at next-reset|+30m|+2h|<ISO>] [--every 30m|4h|1d|1w] [--cwd <path>] [--title "..."]
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
// Mutation lock shared with the app (src/store.js withLock) — prevents a CLI load→save pair from
// erasing a task the app wrote in between (and vice versa). Same lock path, same 5s stale-break.
function withLock(fn) {
  const lock = STORE + '.lock'
  for (let i = 0; i < 50; i++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' })
      try { return fn() } finally { try { fs.unlinkSync(lock) } catch {} }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) { fs.unlinkSync(lock); continue } } catch {}
      const end = Date.now() + 20
      while (Date.now() < end) { /* wait */ }
    }
  }
  return fn()
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
function nextSessionReset(sessionStartTime) {
  const [h, m] = String(sessionStartTime || '02:00').split(':').map(n => parseInt(n, 10) || 0)
  const d = new Date(); d.setHours(h + 5, m, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d
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
    return nextSessionReset(settings.sessionStartTime).toISOString()
  }
  const rel = String(at).match(/^\+(\d+)\s*(m|h|d)$/i)
  if (rel) {
    const n = parseInt(rel[1], 10), unit = rel[2].toLowerCase()
    const ms = unit === 'm' ? 60e3 : unit === 'h' ? 3600e3 : 86400e3
    return new Date(Math.round((Date.now() + n * ms) / 60000) * 60000).toISOString()
  }
  const d = new Date(at)
  if (isNaN(d)) throw new Error(`--at: can't parse "${at}" (use next-reset, +30m, +2h, or an ISO datetime)`)
  return new Date(Math.round(d.getTime() / 60000) * 60000).toISOString()
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
  // --every "30m|4h|1d|1w" makes the task recurring; --at sets the first run (default: one interval from now)
  let repeat = null
  if (f.every) {
    const m = String(f.every).match(/^(\d+)\s*(m|h|d|w)$/i)
    if (!m) { console.error('error: --every: use e.g. 30m, 4h, 1d, 1w'); process.exit(1) }
    const units = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' }
    repeat = { n: parseInt(m[1], 10), unit: units[m[2].toLowerCase()] }
  }
  const at = (repeat && !f.at)
    ? new Date(Date.now() + repeat.n * { minutes: 60e3, hours: 3600e3, days: 86400e3, weeks: 604800e3 }[repeat.unit]).toISOString()
    : resolveAt(f.at, db.settings)
  const task = {
    id: uid(),
    title: f.title || String(f.prompt).slice(0, 60),
    prompt: String(f.prompt),
    mode,
    sessionId: sessionId || null,
    projectPath: cwd,
    model: f.model || null,
    effort: f.effort || null,
    schedule: repeat ? { kind: 'repeat', ...repeat, at } : { kind: 'once', at },
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  }
  withLock(() => { const fresh = loadStore(); fresh.tasks.unshift(task); saveStore(fresh) })
  console.log(`✓ scheduled "${task.title}"`)
  console.log(`  ${task.mode}${sessionId ? ' · session ' + sessionId.slice(0, 8) : ''}${cwd ? ' · cwd ' + cwd : ''}`)
  console.log(`  ${repeat ? `repeats every ${repeat.n} ${repeat.unit} — first ` : 'fires '}${new Date(at).toLocaleString()}  (id ${task.id})`)
}
function cmdList() {
  const db = loadStore()
  if (!db.tasks.length) return console.log('(no tasks)')
  for (const t of db.tasks) console.log(`${(t.status || '').padEnd(10)} ${t.id}  ${t.title}  →  ${t.schedule && t.schedule.at ? new Date(t.schedule.at).toLocaleString() : '-'}`)
}
function cmdCancel(id) {
  if (!id) { console.error('error: cancel needs a task id'); process.exit(1) }
  const found = withLock(() => {
    const db = loadStore()
    const t = db.tasks.find(x => x.id === id)
    if (!t) return false
    t.status = 'cancelled'; saveStore(db); return true
  })
  if (!found) { console.error('no task ' + id); process.exit(1) }
  console.log('✓ cancelled ' + id)
}
function cmdLog(taskId) {
  if (!taskId) { console.error('error: log needs a task id'); process.exit(1) }
  const logsDir = path.join(userDataDir(), 'logs')
  let files
  try { files = fs.readdirSync(logsDir) } catch { console.error('no logs dir found'); process.exit(1) }
  const matches = files.filter(f => f.startsWith(taskId + '-') && f.endsWith('.log')).sort().reverse()
  if (!matches.length) { console.error('no log found for task ' + taskId); process.exit(1) }
  console.log(fs.readFileSync(path.join(logsDir, matches[0]), 'utf8'))
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
  else if (cmd === 'log') cmdLog(pos[1])
  else {
    console.log('relay — usage:')
    console.log('  schedule --prompt "..." [--mode fresh|resume-full] [--resume <id|current>] [--at next-reset|+30m|<ISO>] [--every 30m|4h|1d|1w] [--cwd <path>] [--title "..."]')
    console.log('  list')
    console.log('  cancel <id>')
    console.log('  log <task-id>        — print the task log (last line: # session: <uuid> for --resume)')
    console.log('  restart              — signal the running Relay tray app to relaunch')
  }
} catch (e) { console.error('error:', e.message); process.exit(1) }
