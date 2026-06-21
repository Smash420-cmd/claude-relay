'use strict'
// Runs a task by spawning the Claude Code CLI as a subprocess and capturing its output to a log.
//
// PHASE-0 UNKNOWNS (see DESIGN.md §9) — VERIFY before trusting:
//   1. Exact headless-resume flags. The defaults below (`-p`, `--resume <id>`) are the documented
//      best-guess; `claudeCommand` is configurable in Settings if the binary/flags differ.
//   2. Limit signalling. detectLimit() is a best-guess regex over the CLI output. Confirm the real
//      limit message + whether it carries a reset time, then tighten this.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { logsDir } = require('./paths')

function buildArgs(task) {
  const prompt = task.prompt && task.prompt.trim() ? task.prompt : 'continue'
  switch (task.mode) {
    case 'resume-full':
    case 'resume-compact': // compaction-before-resume not wired yet → behaves as resume-full (logged)
      return ['--resume', task.sessionId, '-p', prompt]
    case 'fresh':
    default:
      return ['-p', prompt]
  }
}

// Best-guess limit detection. VERIFY in Phase-0 against a real limit-reached message.
const LIMIT_RE = /(usage|rate|session)\s+limit|limit reached|you'?ve hit your|resets?\s+at|try again (later|at)/i
const RESET_AT_RE = /resets?\s+at\s+([0-9]{1,2}[:.][0-9]{2}\s*(?:am|pm)?)/i

function detectLimit(text) {
  if (!text || !LIMIT_RE.test(text)) return { stopped: false, resetHint: null }
  const m = text.match(RESET_AT_RE)
  return { stopped: true, resetHint: m ? m[1].trim() : null }
}

// Runs the task. Resolves { exitCode, status, logPath, resetHint }.
// opts: { command, cwd, onStart(child) }
function runTask(task, opts = {}) {
  const command = opts.command || 'claude'
  return new Promise((resolve) => {
    const dir = logsDir()
    fs.mkdirSync(dir, { recursive: true })
    const logPath = path.join(dir, `${task.id}-${Date.now()}.log`)
    const logStream = fs.createWriteStream(logPath, { flags: 'a' })
    const args = buildArgs(task)
    logStream.write(`# Relay run @ ${new Date().toISOString()}\n$ ${command} ${args.join(' ')}\n# cwd: ${opts.cwd || process.cwd()}\n\n`)
    if (task.mode === 'resume-compact') {
      logStream.write('[note] resume-compact not yet wired — running as resume-full (no /compact).\n\n')
    }

    let output = ''
    let child
    try {
      child = spawn(command, args, {
        cwd: opts.cwd || undefined,
        shell: process.platform === 'win32', // resolve `claude` on PATH under Windows
        stdio: ['ignore', 'pipe', 'pipe'], // close stdin → claude gets EOF instead of waiting 3s for it
      })
    } catch (err) {
      logStream.write(`\n[spawn error] ${err.message}\n`)
      logStream.end()
      return resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    }

    if (typeof opts.onStart === 'function') opts.onStart(child)

    child.stdout && child.stdout.on('data', d => { const s = d.toString(); output += s; logStream.write(s) })
    child.stderr && child.stderr.on('data', d => { const s = d.toString(); output += s; logStream.write(s) })

    child.on('error', err => {
      logStream.write(`\n[error] ${err.message}\n`)
      logStream.end()
      resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    })

    child.on('close', code => {
      const limit = detectLimit(output)
      let status = code === 0 ? 'succeeded' : 'failed'
      if (limit.stopped) status = 'stopped'
      logStream.write(`\n\n[exit ${code}] status=${status}${limit.resetHint ? ` resetHint=${limit.resetHint}` : ''}\n`)
      logStream.end()
      resolve({ exitCode: code, status, logPath, resetHint: limit.resetHint })
    })
  })
}

module.exports = { runTask, buildArgs, detectLimit }
