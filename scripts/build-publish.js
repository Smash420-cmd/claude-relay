#!/usr/bin/env node
'use strict'
// Wraps `npm run publish` with automatic retry until Defender releases the lock.
// Windows Defender scans extracted Electron binaries and briefly holds a rename lock —
// the same build succeeds once it finishes scanning (usually within 2-3 attempts).
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const version = require('../package.json').version
const exe = path.join(__dirname, '..', 'dist', `Relay Setup ${version}.exe`)
const MAX = 20

for (let i = 1; i <= MAX; i++) {
  try { fs.unlinkSync(exe) } catch {}
  process.stdout.write(`\nBuild attempt ${i}/${MAX}...\n`)
  const r = spawnSync('npm', ['run', 'publish'], {
    stdio: 'inherit', shell: true,
    env: { ...process.env, ELECTRON_BUILDER_CACHE: '.cache' },
    cwd: path.join(__dirname, '..'),
  })
  if (r.status === 0) { console.log('\nDone.'); process.exit(0) }
  if (i < MAX) {
    process.stdout.write('EPERM — waiting 5s for Defender to release...\n')
    const until = Date.now() + 5000
    while (Date.now() < until) {} // busy-wait (no async needed)
  }
}
console.error(`\nFailed after ${MAX} attempts.`)
process.exit(1)
