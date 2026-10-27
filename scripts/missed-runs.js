#!/usr/bin/env node
// One line for the ops digest: did Relay run what it should in the last N hours?
// Names failed runs, usage-limit stops, a held queue and overdue tasks, so a silent gap (a limit hold, a dead
// app) shows up the next morning instead of days later.
//   node scripts/missed-runs.js [--hours 24] [--end <ISO>]   (--end: judge a past window, for checking the line)
const fs = require('fs'), path = require('path'), os = require('os')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const hours = Number(arg('--hours', 24)), end = new Date(arg('--end', new Date().toISOString())).getTime(), start = end - hours * 3600e3
const dir = process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'relay')
  : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'relay') : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'relay')   // same as relay.js
const db = JSON.parse(fs.readFileSync(path.join(dir, 'relay-data.json'), 'utf8'))
const title = (id) => ((db.tasks || []).find((t) => t.id === id) || {}).title || id
const runs = [], failed = [], limited = []
for (const f of fs.readdirSync(path.join(dir, 'logs'))) {
  const m = /^(.+)-(\d{13})\.log$/.exec(f)
  if (!m || +m[2] < start || +m[2] > end) continue
  const tail = fs.readFileSync(path.join(dir, 'logs', f), 'utf8').slice(-4000)
  runs.push(m[1])
  const status = ([...tail.matchAll(/\] status=(\w+)/g)].pop() || [])[1]   // the runner's own last line; prompt text can mention limits
  if (status === 'stopped') limited.push(m[1])
  else if (status && status !== 'succeeded') failed.push(m[1])
}
const uniq = (a) => [...new Set(a)].map(title)
const hold = db.settings && db.settings.holdUntil && new Date(db.settings.holdUntil).getTime() > end ? db.settings.holdUntil : ''
const overdue = (db.tasks || []).filter((t) => t.status === 'scheduled' && t.schedule && t.schedule.at && new Date(t.schedule.at).getTime() < end - 30 * 60e3).map((t) => t.title)
const parts = [`Relay ${hours}h: ${runs.length} runs`]
if (failed.length) parts.push(`${failed.length} failed (${uniq(failed).join('; ')})`)
if (limited.length) parts.push(`${limited.length} stopped on a usage limit (${uniq(limited).join('; ')})`)
if (hold) parts.push(`queue HELD until ${hold}`)
if (overdue.length) parts.push(`${overdue.length} overdue (${overdue.join('; ')})`)
if (!runs.length) parts.push('NOTHING RAN')
console.log(parts.length === 1 ? parts[0] + ', all ok' : parts.join(', '))
