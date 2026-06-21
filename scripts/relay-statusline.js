#!/usr/bin/env node
'use strict'
// Relay statusLine bridge.
//
// Claude Code (v2.1.80+) pipes a JSON payload to the configured statusLine script's stdin after
// every turn — including a `rate_limits` field with the live 5-hour and 7-day windows. This script
// captures that to ~/.relay/usage.json (where the Relay app reads it) and prints a compact status
// line. Authoritative usage, locally, no credentials.
//
// Install — add to ~/.claude/settings.json:
//   { "statusLine": { "type": "command", "command": "node \"<abs path>/scripts/relay-statusline.js\"" } }
const fs = require('fs')
const path = require('path')
const os = require('os')

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => { input += d })
process.stdin.on('end', () => {
  let data = {}
  try { data = JSON.parse(input) } catch {}
  const rl = data && data.rate_limits

  if (rl) {
    try {
      const dir = path.join(os.homedir(), '.relay')
      fs.mkdirSync(dir, { recursive: true })
      const tmp = path.join(dir, 'usage.json.tmp')
      const out = path.join(dir, 'usage.json')
      fs.writeFileSync(tmp, JSON.stringify({ capturedAt: Math.floor(Date.now() / 1000), rate_limits: rl }))
      fs.renameSync(tmp, out)
    } catch {}
  }

  process.stdout.write(statusLine(data, rl))
})

// keep the status line useful — show both windows; fall back gracefully on older Claude Code
function statusLine(data, rl) {
  const parts = []
  if (rl) {
    const p = w => (w && w.used_percentage != null) ? Math.round(w.used_percentage) + '%' : '—'
    parts.push(`5h ${p(rl.five_hour)} · 7d ${p(rl.seven_day)}`)
  }
  const model = data && data.model && (data.model.display_name || data.model.id)
  if (model) parts.push(model)
  return parts.join('  ·  ')
}
