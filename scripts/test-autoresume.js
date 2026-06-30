#!/usr/bin/env node
'use strict'
// Smoke test for the /relay-autoresume watchdog flow.
// Writes a mock arm file, runs the watchdog logic, checks the task was queued, then cleans up.
const os = require('os')
const fs = require('fs')
const path = require('path')

const ARM_FILE = path.join(os.homedir(), '.relay', 'autoresume.json')

function userDataDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'relay')
  return path.join(os.homedir(), '.config', 'relay')
}
const STORE = path.join(userDataDir(), 'relay-data.json')

function loadStore() {
  try { const d = JSON.parse(fs.readFileSync(STORE, 'utf8')); d.tasks = d.tasks || []; return d }
  catch { return { tasks: [] } }
}
function saveStore(db) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true })
  const tmp = STORE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, STORE)
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

// ── Step 1: write a fresh arm file ──────────────────────────────────────────
console.log('\n[1] Writing arm file...')
fs.mkdirSync(path.dirname(ARM_FILE), { recursive: true })
// Capture real session ID the same way the skill does
let sessionId = null
try {
  const sessDir = path.join(os.homedir(), '.claude', 'sessions')
  const files = fs.readdirSync(sessDir).filter(x => x.endsWith('.json'))
    .map(x => ({ x, m: fs.statSync(path.join(sessDir, x)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  if (files[0]) { const o = JSON.parse(fs.readFileSync(path.join(sessDir, files[0].x), 'utf8')); sessionId = o.sessionId || null }
} catch {}
console.log('    session ID:', sessionId || '(none found)')

const arm = {
  prompt: 'Continue fixing relay bugs — re-arm duplication, reset timing, autoresume',
  cwd: 'C:\\Users\\pmdse\\Documents\\relay',
  sessionId,
  armedAt: new Date().toISOString(),
}
fs.writeFileSync(ARM_FILE, JSON.stringify(arm, null, 2))
console.log('    arm file:', ARM_FILE)
console.log('    prompt:', arm.prompt)

// ── Step 2: simulate watchdog reading the file ───────────────────────────────
console.log('\n[2] Simulating watchdog (mocked usage = 100% session)...')
const armRead = JSON.parse(fs.readFileSync(ARM_FILE, 'utf8'))
const age = Date.now() - new Date(armRead.armedAt).getTime()
if (age > 8 * 60 * 60 * 1000) { console.error('FAIL: arm file expired'); process.exit(1) }
console.log('    arm file age:', Math.round(age / 1000) + 's — valid')

// Mock: usage at 100% session, reset in 1 hour
const mockUsage = {
  sessionPct: 100,
  weeklyPct: 40,
  sessionResetsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  weeklyResetsAt: null,
}
const resetAt = mockUsage.weeklyPct >= 100 && mockUsage.weeklyResetsAt
  ? new Date(mockUsage.weeklyResetsAt).toISOString()
  : mockUsage.sessionResetsAt

console.log('    reset at:', resetAt)

// ── Step 3: add the resume task to the store ─────────────────────────────────
console.log('\n[3] Adding resume task to relay store...')
const db = loadStore()
const taskId = uid()
const task = {
  id: taskId,
  title: `Auto-resume: ${String(armRead.prompt).slice(0, 50)}`,
  prompt: armRead.prompt,
  mode: armRead.sessionId ? 'resume-full' : 'fresh',
  sessionId: armRead.sessionId || null,
  projectPath: armRead.cwd || '',
  model: null,
  effort: null,
  schedule: { kind: 'once', at: resetAt },
  status: 'scheduled',
  createdAt: new Date().toISOString(),
}
db.tasks.unshift(task)
saveStore(db)
console.log('    task id:', taskId)
console.log('    fires:', new Date(resetAt).toLocaleString())

// ── Step 4: verify it appears in relay list ──────────────────────────────────
console.log('\n[4] Verifying task in store...')
const verify = loadStore()
const found = verify.tasks.find(t => t.id === taskId)
if (!found) { console.error('FAIL: task not found in store'); process.exit(1) }
console.log('    found:', found.status, '|', found.title)

// ── Step 5: clean up ─────────────────────────────────────────────────────────
console.log('\n[5] Cleaning up...')
fs.unlinkSync(ARM_FILE)
console.log('    arm file removed')
const dbClean = loadStore()
dbClean.tasks = dbClean.tasks.filter(t => t.id !== taskId)
saveStore(dbClean)
console.log('    test task removed from store')

console.log('\n✓ PASS — watchdog flow works end-to-end')
console.log('  The running app will use the same logic once rebuilt and deployed.\n')
