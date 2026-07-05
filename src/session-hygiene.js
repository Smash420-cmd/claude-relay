'use strict'
// Session hygiene — stops task runs from flooding the account with sessions.
//
// task.sessionPolicy:
//   'keep'        default — current behaviour, transcript kept forever
//   'ephemeral'   one-off chores: transcript deleted after a SUCCESSFUL run
//                 (failed runs keep theirs for debugging)
//   'rolling:Nd'  recurring routines: reuse one session for N days, then
//                 rotate to a fresh one and delete the rotated-out transcript
//
// Deletion is local (~/.claude/projects/<proj>/<id>.jsonl). It removes the
// session from resume lists and disk; a synced stub may linger on claude.ai —
// ponytail: no public API to delete those; revisit if one appears.

const fs = require('fs')
const os = require('os')
const path = require('path')

function deleteTranscript(sessionId) {
  if (!sessionId) return false
  const root = path.join(os.homedir(), '.claude', 'projects')
  let deleted = false
  try {
    for (const proj of fs.readdirSync(root, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue
      const fp = path.join(root, proj.name, sessionId + '.jsonl')
      try { fs.unlinkSync(fp); deleted = true } catch {}
    }
  } catch {}
  if (deleted) console.log(`[hygiene] deleted transcript ${sessionId.slice(0, 8)}…`)
  return deleted
}

function rollingDays(policy) {
  const m = /^rolling:(\d+)d$/.exec(policy || '')
  return m ? parseInt(m[1], 10) : null
}

// Pre-run: for rolling tasks with a live session younger than N days,
// convert this run into a resume of that session.
function beforeRun(task) {
  const days = rollingDays(task.sessionPolicy)
  if (!days || !task.rollSessionId) return task
  const age = Date.now() - (task.rollSessionStartedAt || 0)
  if (age < days * 86400e3) {
    return { ...task, mode: 'resume-full', sessionId: task.rollSessionId }
  }
  return task // rotation due — run stays fresh; afterRun swaps the session in
}

// Post-run: enforce the policy. Returns a patch to persist on the task (or null).
function afterRun(task, res) {
  const policy = task.sessionPolicy || 'keep'
  if (policy === 'ephemeral') {
    if (res.status === 'succeeded') deleteTranscript(res.resultSessionId)
    return null
  }
  const days = rollingDays(policy)
  if (days && res.resultSessionId) {
    if (res.resultSessionId !== task.rollSessionId) {
      // New session took over (first run or rotation) — retire the old transcript
      if (task.rollSessionId) deleteTranscript(task.rollSessionId)
      return { rollSessionId: res.resultSessionId, rollSessionStartedAt: Date.now() }
    }
  }
  return null
}

// ── context matrix ───────────────────────────────────────────────────────
// Recurring tasks get a persistent notes dir (~/.relay/context/<task-id>/) so
// state survives session rotation: each run reads NOTES.md, does its work,
// and updates NOTES.md for the next run. Continuity in files, not context.
function contextDir(task) {
  return path.join(os.homedir(), '.relay', 'context', task.id)
}

function sharedNotesPath() {
  return path.join(os.homedir(), '.relay', 'context', 'shared', 'NOTES.md')
}

function ensureSharedNotes() {
  const p = sharedNotesPath()
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, `# Shared context — all tasks read this\n\n`
        + `Cross-task facts only (travel, launches, global decisions, "ignore X").\n`
        + `Task-specific state belongs in the task's own NOTES.md, not here.\n`)
    }
  } catch {}
  return p
}

function injectContext(task) {
  if ((task.schedule || {}).kind !== 'repeat') return task
  const dir = contextDir(task)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const notes = path.join(dir, 'NOTES.md')
    if (!fs.existsSync(notes)) {
      fs.writeFileSync(notes, `# ${task.title} — running notes\n\n(State left by previous runs. Nothing yet — this is the first.)\n`)
    }
  } catch { return task }
  const shared = ensureSharedNotes()
  const header = `## Context (persistent across runs)\n`
    + `Task dir: ${dir}\n`
    + `Shared notes: ${shared}\n`
    + `FIRST: read both NOTES.md files — the task one holds this task's own state `
    + `(baselines, things already handled); the shared one holds cross-task facts every routine should know. `
    + `LAST, before you finish: update the task NOTES.md with what the next run should know; `
    + `add to the shared NOTES.md ONLY facts that other tasks genuinely need (rare). `
    + `Keep each under ~150 lines — prune stale entries. The task dir is also yours for working files.\n\n`
  return { ...task, prompt: header + task.prompt }
}

module.exports = { beforeRun, afterRun, deleteTranscript, rollingDays, injectContext }
