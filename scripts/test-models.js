#!/usr/bin/env node
'use strict'
// Smoke-tests every model + effort combo by running `claude -p "ok" --model X --effort Y`.
// Pass/fail based on exit code. Prints a summary table at the end.
// Usage: node scripts/test-models.js
const { spawnSync } = require('child_process')

const MODELS = [
  { id: '',                           label: 'Default (Sonnet 4.6)', effort: ['low','medium','high','max'] },
  { id: 'claude-opus-4-8',            label: 'Opus 4.8',            effort: ['low','medium','high','xhigh','max'] },
  { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6',          effort: ['low','medium','high','max'] },
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',           effort: null },
  { id: 'claude-opus-4-7',            label: 'Opus 4.7',            effort: ['low','medium','high','xhigh','max'] },
  { id: 'claude-opus-4-6',            label: 'Opus 4.6',            effort: ['low','medium','high','max'] },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5',          effort: ['low','medium','high','max'] },
]

const results = []

function run(model, effort) {
  const args = []
  if (model) args.push('--model', model)
  if (effort) args.push('--effort', effort)
  args.push('-p', 'Reply with only the single word: ok', '--dangerously-skip-permissions')

  const label = `${model || 'default'} / effort=${effort || 'default'}`
  process.stdout.write(`  testing ${label} ... `)

  const spawnEnv = { ...process.env }
  delete spawnEnv.ANTHROPIC_API_KEY

  const res = spawnSync('claude', args, {
    env: spawnEnv,
    shell: process.platform === 'win32',
    timeout: 60000,
    encoding: 'utf8',
  })

  const ok = res.status === 0
  const note = res.error ? res.error.message : (ok ? '' : (res.stderr || res.stdout || '').trim().slice(0, 120))
  console.log(ok ? 'PASS' : `FAIL — ${note}`)
  results.push({ label, ok, note })
  return ok
}

console.log('\n=== relay model + effort smoke test ===\n')

for (const m of MODELS) {
  console.log(`\n[ ${m.label} ]`)
  // no effort flag
  run(m.id, null)
  // each effort level
  if (m.effort) {
    for (const e of m.effort) run(m.id, e)
  }
}

console.log('\n=== results ===')
const passed = results.filter(r => r.ok).length
const failed = results.filter(r => !r.ok)
console.log(`${passed}/${results.length} passed`)
if (failed.length) {
  console.log('\nFailed:')
  for (const f of failed) console.log(`  FAIL  ${f.label}${f.note ? ' — ' + f.note : ''}`)
}
console.log()
process.exit(failed.length ? 1 : 0)
