'use strict'
// Runs a task by spawning the Claude Code CLI as a subprocess and capturing its output to a log.
const { spawn, execFile } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { logsDir } = require('./paths')

// Fallback only: find the Claude session a task created by scanning ~/.claude/projects/ for the
// most-recently-modified .jsonl newer than taskStartMs. Heuristic — can pick the WRONG conversation
// if another session is active at the same time. Used only if an assigned --session-id wasn't honoured.
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
  if (task.mode === 'resume-full') {
    args.push('--resume', task.sessionId)
    // Collision escape hatch: resuming a session that's open in another Claude Code
    // process fails silently. --fork-session continues the same history under a NEW
    // session id, so the run completes without touching the live conversation.
    if (task.forkSession) args.push('--fork-session')
  } else if (opts.assignSessionId) {
    // Fresh run: pin the session UUID up front so we know EXACTLY which session this task created
    // and can resume that one — no most-recent-file guessing (which grabs the wrong conversation
    // when another session is active concurrently).
    args.push('--session-id', opts.assignSessionId)
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
// \b after every bare "limit"/"at" — without it, "limit" substring-matches "limiting"/"limitation"
// and "at" substring-matches "attempts"/"attaching" etc, false-triggering a stop on ordinary task
// prose (e.g. "password-reset attempts", "implemented rate limiting for the API").
const LIMIT_RE = /(usage|rate|session)\s+limit\b|limit reached|you'?ve hit your|resets?\s+at\b|try again (later|at\b)/i
const RESET_AT_RE = /resets?\s+at\s+([0-9]{1,2}[:.][0-9]{2}\s*(?:am|pm)?)/i

// Structural guard: a real limit stop TERMINATES the run, so the CLI's limit message is
// always the last thing printed. Only the output tail is signal — everything earlier is
// ordinary task prose, which may legitimately discuss limits ("implemented rate limiting",
// a task report about this very regex). Whole-output matching produced two real false
// positives (2026-07-10); tail-scoping removes the class, not just the phrases.
const LIMIT_TAIL = 300

function detectLimit(text) {
  if (!text) return { stopped: false, resetHint: null }
  const tail = text.slice(-LIMIT_TAIL)
  if (!LIMIT_RE.test(tail)) return { stopped: false, resetHint: null }
  const m = tail.match(RESET_AT_RE)
  return { stopped: true, resetHint: m ? m[1].trim() : null }
}

// Secret env-var scrubbing (security). A headless task runs with --dangerously-skip-permissions, so
// any secret left in its env could be exfiltrated by the model via tool use. Name-pattern blacklist
// (not a whitelist — a whitelist would break PATH, npm config, proxies). Covers name-shaped secrets
// (*_KEY/_TOKEN/_PASS…) and value-shaped ones (DATABASE_URL, *_DSN, connection strings).
// ponytail: blacklist ceiling — add a pattern here if a new secret shape shows up.
// Strong suffixes: no common env var / English word ends in these, so match as a plain suffix —
// catches concatenated forms like PGPASSWORD that have no underscore separator.
const SECRET_STRONG_RE = /(PASSWORD|PASSWD|SECRET|CREDENTIALS?|TOKEN)$/i
// Weak suffixes: real words/vars end in these (monKEY, comPASS, forMAT), so require a boundary
// (start-of-name or underscore) to avoid false strips.
const SECRET_WEAK_RE = /(^|_)(KEY|PASS|PAT|DSN|AUTH)$/i
// PWD bare is the Unix working directory (keep it); only a secret after an underscore (MYSQL_PWD).
const SECRET_PWD_RE = /_PWD$/i
// Value-shaped secrets: connection strings carry an embedded password.
const SECRET_CONN_RE = /(DATABASE_URL|CONNECTION_?STRING)$/i
function isSecretEnv(name) {
  return SECRET_STRONG_RE.test(name) || SECRET_WEAK_RE.test(name) || SECRET_PWD_RE.test(name) || SECRET_CONN_RE.test(name)
}

// Return a copy of `env` with the Anthropic API key and all matched secrets removed.
// ANTHROPIC_API_KEY is always dropped (security invariant — tasks must use the claude.ai
// subscription, never a billable API key), independent of the pattern match.
function scrubSecrets(env) {
  const out = { ...env }
  delete out.ANTHROPIC_API_KEY
  for (const k of Object.keys(out)) if (isSecretEnv(k)) delete out[k]
  return out
}

// Kill the whole process tree. On Windows we spawn via cmd.exe (shell:true), so child.kill()
// only kills the shell and leaves the claude process running headless — taskkill /T gets the tree.
function killTree(child) {
  if (!child) return
  if (process.platform === 'win32' && child.pid) {
    try { execFile('taskkill', ['/pid', String(child.pid), '/T', '/F']) } catch {}
  } else {
    try { child.kill() } catch {}
  }
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
    // Fresh runs get a pinned session UUID so the resume chain always targets the same conversation.
    // Resume runs continue task.sessionId (claude --resume keeps the id unless --fork-session).
    const assignSessionId = task.mode === 'resume-full' ? null : randomUUID()
    const args = buildArgs(task, { ...opts, assignSessionId })
    logStream.write(`# Relay run @ ${new Date().toISOString()}\n$ ${command} ${args.join(' ')}\n# cwd: ${opts.cwd || process.cwd()}\n# prompt (via stdin): ${promptText.slice(0, 300)}\n\n`)

    const taskStartMs = Date.now()
    let output = ''
    let child
    try {
      const spawnEnv = scrubSecrets(process.env)
      if (process.platform === 'win32') {
        spawnEnv.SystemRoot = spawnEnv.SystemRoot || 'C:\\Windows'
        spawnEnv.ComSpec    = spawnEnv.ComSpec    || 'C:\\Windows\\System32\\cmd.exe'
      }
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

    // Keep only the tail in memory — detectLimit needs the end of the output, and a chatty
    // 45-min run can produce hundreds of MB (the full text still goes to the log file).
    const OUTPUT_CAP = 65536
    const append = (s) => { output = (output + s).slice(-OUTPUT_CAP) }
    child.stdout && child.stdout.on('data', d => { const s = d.toString(); append(s); logStream.write(s) })
    child.stderr && child.stderr.on('data', d => { const s = d.toString(); append(s); logStream.write(s) })

    child.on('error', err => {
      clearTimeout(timeout)
      if (!logStream.writableEnded) {
        logStream.write(`\n[error] ${err.message}\n`)
        logStream.end()
      }
      resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    })

    // Hard timeout — if the process doesn't exit within 45 min, kill it.
    // Prevents the scheduler from blocking forever on a hung task (e.g. Claude Code
    // pausing for user input after hitting a session limit with stdin already closed).
    const timeout = setTimeout(() => {
      killTree(child)
      if (!logStream.writableEnded) {
        logStream.write('\n\n[timeout] process exceeded 45 min — killed\n')
        logStream.end()
      }
      resolve({ exitCode: -1, status: 'failed', logPath, resetHint: null })
    }, 45 * 60 * 1000)

    child.on('close', code => {
      clearTimeout(timeout)
      const limit = detectLimit(output)
      let status = code === 0 ? 'succeeded' : 'failed'
      if (limit.stopped) status = 'stopped'
      // Deterministic: the session we pinned (fresh) or continued (resume). A forked resume
      // writes to a NEW id only the heuristic can find. Last resort otherwise — so the
      // resume chain stays on the originating session.
      const resultSessionId = assignSessionId
        || (task.forkSession ? findResultSession(taskStartMs) : task.sessionId)
        || findResultSession(taskStartMs)
      if (!logStream.writableEnded) {
        logStream.write(`\n\n[exit ${code}] status=${status}${limit.resetHint ? ` resetHint=${limit.resetHint}` : ''}\n`)
        if (resultSessionId) logStream.write(`# session: ${resultSessionId}\n`)
        logStream.end()
      }
      // outputLen: collision detector — a resume that dies having printed NOTHING is the
      // silent session-collision signature (vs a real failure, which always prints something).
      resolve({ exitCode: code, status, logPath, resetHint: limit.resetHint, resultSessionId: resultSessionId || null, outputLen: output.trim().length })
    })
  })
}

module.exports = { runTask, buildArgs, detectLimit, isSecretEnv, scrubSecrets, killTree }
