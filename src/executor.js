'use strict'
// Runs a task by spawning the Claude Code CLI as a subprocess and capturing its output to a log.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { logsDir } = require('./paths')

// After a task exits, find the Claude session that was created/used by scanning
// ~/.claude/projects/ for the most-recently-modified .jsonl newer than taskStartMs.
function findResultSession(taskStartMs) {
  const root = path.join(os.homedir(), '.claude', 'projects')
  let best = null
  try {
    for (const proj of fs.readdirSync(root, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue
      const dir = path.join(root, proj.name)
      try {
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.jsonl')) continue
          const mtime = fs.statSync(path.join(dir, f)).mtimeMs
          if (mtime < taskStartMs) continue
          if (!best || mtime > best.mtime) best = { mtime, uuid: f.replace('.jsonl', '') }
        }
      } catch {}
    }
  } catch {}
  return best ? best.uuid : null
}

// Flags only — the PROMPT is passed via stdin, never as an arg. With shell:true (needed to resolve
// `claude` on Windows) a spaced prompt arg gets re-split by the shell into separate words, which
// silently truncates it. stdin sidesteps that entirely.
function buildArgs(task, opts = {}) {
  const args = []
  if (task.mode === 'resume-full' || task.mode === 'resume-compact') {
    args.push('--resume', task.sessionId)
  }
  if (task.model) args.push('--model', task.model)
  if (task.effort) args.push('--effort', task.effort)
  args.push('-p')
  // Unattended runs can't answer permission prompts; without this the session just replies with text
  // and "succeeds" without editing/committing. User-enabled (settings.skipPermissions, default ON) so
  // tasks complete seamlessly — a headless session runs anything with no gate, in the task's cwd.
  if (opts.skipPermissions) args.push('--dangerously-skip-permissions')
  return args
}

// Limit detection heuristic — tuned against real limit-reached output.
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
    const promptText = task.prompt && task.prompt.trim() ? task.prompt : 'continue'
    const args = buildArgs(task, opts)
    logStream.write(`# Relay run @ ${new Date().toISOString()}\n$ ${command} ${args.join(' ')}\n# cwd: ${opts.cwd || process.cwd()}\n# prompt (via stdin): ${promptText.slice(0, 300)}\n\n`)
    if (task.mode === 'resume-compact') {
      logStream.write('[note] resume-compact not yet wired — running as resume-full (no /compact).\n\n')
    }

    const taskStartMs = Date.now()
    let output = ''
    let child
    try {
      const spawnEnv = { ...process.env }
      if (process.platform === 'win32') {
        spawnEnv.SystemRoot = spawnEnv.SystemRoot || 'C:\\Windows'
        spawnEnv.ComSpec    = spawnEnv.ComSpec    || 'C:\\Windows\\System32\\cmd.exe'
      }
      // Strip API key so relay tasks use the claude.ai subscription, not a (possibly depleted) API key
      delete spawnEnv.ANTHROPIC_API_KEY
      child = spawn(command, args, {
        cwd: opts.cwd || undefined,
        shell: process.platform === 'win32' ? (spawnEnv.ComSpec) : false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: spawnEnv,
      })
    } catch (err) {
      logStream.write(`\n[spawn error] ${err.message}\n`)
      logStream.end()
      return resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    }

    if (typeof opts.onStart === 'function') opts.onStart(child)

    // Feed the prompt via stdin (immune to shell arg-splitting), then close it.
    try { child.stdin.write(promptText); child.stdin.end() } catch {}

    child.stdout && child.stdout.on('data', d => { const s = d.toString(); output += s; logStream.write(s) })
    child.stderr && child.stderr.on('data', d => { const s = d.toString(); output += s; logStream.write(s) })

    child.on('error', err => {
      logStream.write(`\n[error] ${err.message}\n`)
      logStream.end()
      resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    })

    // Hard timeout — if the process doesn't exit within 45 min, kill it.
    // Prevents the scheduler from blocking forever on a hung task (e.g. Claude Code
    // pausing for user input after hitting a session limit with stdin already closed).
    const timeout = setTimeout(() => {
      try { child.kill() } catch {}
      logStream.write('\n\n[timeout] process exceeded 45 min — killed\n')
      logStream.end()
      resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    }, 45 * 60 * 1000)

    child.on('close', code => {
      clearTimeout(timeout)
      const limit = detectLimit(output)
      let status = code === 0 ? 'succeeded' : 'failed'
      if (limit.stopped) status = 'stopped'
      const resultSessionId = findResultSession(taskStartMs)
      if (!logStream.writableEnded) {
        logStream.write(`\n\n[exit ${code}] status=${status}${limit.resetHint ? ` resetHint=${limit.resetHint}` : ''}\n`)
        if (resultSessionId) logStream.write(`# session: ${resultSessionId}\n`)
        logStream.end()
      }
      resolve({ exitCode: code, status, logPath, resetHint: limit.resetHint, resultSessionId: resultSessionId || null })
    })
  })
}

module.exports = { runTask, buildArgs, detectLimit }
