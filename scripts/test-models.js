#!/usr/bin/env node
'use strict'
// Smoke-tests every model + effort combo by running `claude -p "ok" --model X --effort Y`.
// Pass/fail based on exit code. Prints a summary table at the end.
// Usage: node scripts/test-models.js
const { spawnSync } = require('child_process')
const { buildArgs, buildCodexArgs, isCodexModel, scrubSecrets } = require('../src/executor')

// Mirrors MODELS in renderer/app.js — keep both in step.
const MODELS = [
  { id: '',                           label: 'Default (no --model)', effort: ['low','medium','high','max'] },
  { id: 'claude-opus-5-5',             label: 'Opus 5.5',                  effort: ['low','medium','high'] },
  { id: 'claude-sonnet-5-5',           label: 'Sonnet 5.5',                effort: ['low','medium','high','xhigh','max'] },
  { id: 'claude-sonnet-5',             label: 'Sonnet 5',                  effort: ['low','medium','high','xhigh','max'] },
  { id: 'claude-haiku-4-5-20251001',   label: 'Haiku 4.5',                 effort: null },
  { id: 'claude-fable-5-1',            label: 'Fable 5.1 (Max plan only)', effort: ['low','medium','high'] },
  { id: 'claude-fable-5',              label: 'Fable 5 (Max plan only)',   effort: ['low','medium','high'] },
  { id: 'gpt-6.1-sol',                 label: 'GPT-6.1 Sol',               effort: ['low','medium','high','xhigh','max','ultra'] },
  { id: 'gpt-6-astra',                 label: 'GPT-6 Astra',               effort: ['low','medium','high','xhigh','max','ultra'] },
  { id: 'gpt-6-sol',                   label: 'GPT-6 Sol',                 effort: ['low','medium','high','xhigh','max','ultra'] },
  { id: 'gpt-6-luna',                  label: 'GPT-6 Luna',                effort: ['low','medium','high','xhigh','max'] },
  { id: 'gpt-5.6-sol',                 label: 'GPT-5.6 Sol',               effort: ['low','medium','high','xhigh','max','ultra'] },
  { id: 'gpt-5.6-terra',               label: 'GPT-5.6 Terra',             effort: ['low','medium','high','xhigh','max','ultra'] },
  { id: 'gpt-5.6-luna',                label: 'GPT-5.6 Luna',              effort: ['low','medium','high','xhigh','max'] },
  { id: 'gpt-5.5',                     label: 'GPT-5.5',                   effort: ['low','medium','high','xhigh'] },
  { id: 'claude-opus-5',               label: 'Opus 5',                    effort: ['low','medium','high'] },
  { id: 'claude-opus-4-8',            label: 'Opus 4.8',            effort: ['low','medium','high'] },
  { id: 'claude-opus-4-7',            label: 'Opus 4.7',            effort: ['low','medium','high'] },
  { id: 'claude-opus-4-6',            label: 'Opus 4.6',            effort: ['low','medium','high'] },
  { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6',          effort: ['low','medium','high','max'] },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5',          effort: ['low','medium','high','max'] },
]

const results = []

function run(model, effort) {
  // Same arg builders the executor uses, so the smoke test covers the real routing.
  const codex = isCodexModel(model)
  const task = { model, effort, mode: 'fresh' }
  const args = codex ? buildCodexArgs(task, { skipPermissions: true }) : buildArgs(task, { skipPermissions: true })

  const label = `${model || 'default'} / effort=${effort || 'default'}`
  process.stdout.write(`  testing ${label} ... `)

  const res = spawnSync(codex ? 'codex' : 'claude', args, {
    input: 'Reply with only the single word: ok',
    env: scrubSecrets(process.env),
    shell: process.platform === 'win32',
    timeout: 180000,
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
