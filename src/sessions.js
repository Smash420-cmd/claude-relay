'use strict'
// Discover local Claude Code conversations so a task can target a specific session to resume.
// Sessions live as ~/.claude/projects/<encoded-project>/<session-id>.jsonl
//
// Claude Code does NOT persist a separate human-readable title we could read; /resume shows the
// first message + an on-the-fly summary. So we surface: the first user message (the de-facto title),
// the per-session `slug` codename (e.g. "calm-waddling-engelbart" — friendlier than the UUID), and
// an "active" flag for any session currently open (from the ~/.claude/sessions registry).
const fs = require('fs')
const path = require('path')
const os = require('os')
const { claudeProjectsDir } = require('./paths')

// Session ids currently open, from the live registry (~/.claude/sessions/<pid>.json).
function activeSessionIds() {
  const dir = path.join(os.homedir(), '.claude', 'sessions')
  const out = new Map() // sessionId -> status
  let files = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch { return out }
  for (const f of files) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      if (o.sessionId) out.set(o.sessionId, o.status || 'open')
    } catch {}
  }
  return out
}

function listSessions(limit = 60) {
  const root = claudeProjectsDir()
  const active = activeSessionIds()
  let projects = []
  try {
    projects = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())
  } catch {
    return []
  }

  // Cheap pass first (stat + the active registry) — everything the sort needs. Reading metadata is
  // the expensive part, so it happens AFTER the slice: 60 transcripts, not the whole 1.3GB history.
  const found = []
  for (const proj of projects) {
    const dir = path.join(root, proj.name)
    let files = []
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const full = path.join(dir, f)
      let stat
      try { stat = fs.statSync(full) } catch { continue }
      const sessionId = f.replace(/\.jsonl$/, '')
      found.push({ full, sessionId, proj: proj.name, modified: stat.mtimeMs, active: active.has(sessionId) })
    }
  }
  // active sessions first, then most-recently-modified
  found.sort((a, b) => (b.active - a.active) || (b.modified - a.modified))
  return found.slice(0, limit).map(s => {
    const meta = readMeta(s.full) // { preview, slug, cwd, title }
    const cwd = meta.cwd || ''
    return {
      sessionId: s.sessionId,
      slug: meta.slug || '',
      title: meta.title || '',
      project: cwd || decodeProject(s.proj),
      modified: s.modified,
      preview: meta.preview,
      cwd,
      branch: gitBranch(cwd),
      active: s.active,
      status: active.get(s.sessionId) || null,
    }
  })
}

function decodeProject(encoded) {
  return encoded.replace(/^-/, '').split('-').filter(Boolean).slice(-2).join('/') || encoded
}

// One pass over the transcript: grab title, slug, first user message, and cwd.
// `ai-title` records hold the SAME conversation name Claude Code's own /resume
// list shows — surface it so the picker matches what the user sees elsewhere.
// ponytail: 256KB head. title/preview/cwd are always in the opening records; `slug` is written
// later on some transcripts (measured: 8 of the 13 that have one land inside this window), so a
// few old sessions show no codename. Widen the window if that ever matters — it costs read time.
// Head-only: every field here is written in the opening records, but the old whole-file read cost
// 3.7s across a 1.3GB history each time the task modal opened — and on a transcript over ~512MB it
// threw (V8 max string length) so those sessions silently showed no metadata at all.
function readHead(file, bytes = 256 * 1024) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(bytes)
    const n = fs.readSync(fd, buf, 0, bytes, 0)
    const s = buf.slice(0, n).toString('utf8')
    if (n < bytes) return s
    return s.slice(0, s.lastIndexOf('\n') + 1) // drop the partial trailing line
  } finally { if (fd !== undefined) try { fs.closeSync(fd) } catch {} }
}

function readMeta(file) {
  let preview = '', slug = '', cwd = '', title = ''
  try {
    const lines = readHead(file).split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      let o
      try { o = JSON.parse(line) } catch { continue }
      if (!slug && o.slug) slug = o.slug
      if (!cwd && o.cwd) cwd = o.cwd
      if (!title && o.type === 'ai-title' && o.aiTitle) title = String(o.aiTitle).slice(0, 80)
      if (!preview) {
        const content = o.message && o.message.content
        if (typeof content === 'string' && content.trim() && o.type === 'user') preview = clean(content)
        else if (Array.isArray(content)) {
          const t = content.find(c => c && c.type === 'text' && c.text)
          if (t && o.type === 'user') preview = clean(t.text)
        }
      }
      if (slug && preview && cwd && title) break
    }
  } catch {}
  return { preview, slug, cwd, title }
}

// Newest mtime of the session's transcript — proxy for "was someone just using this?"
function transcriptMtime(sessionId) {
  const root = claudeProjectsDir()
  try {
    for (const proj of fs.readdirSync(root)) {
      try { return fs.statSync(path.join(root, proj, sessionId + '.jsonl')).mtimeMs } catch {}
    }
  } catch {}
  return null
}

function gitBranch(cwd) {
  if (!cwd) return ''
  try {
    const head = fs.readFileSync(path.join(cwd, '.git', 'HEAD'), 'utf8').trim()
    if (head.startsWith('ref: refs/heads/')) return head.slice('ref: refs/heads/'.length)
    return head.slice(0, 7) // detached HEAD — show short hash
  } catch { return '' }
}

// Strip injected system-reminder / boilerplate so the preview reads like the user's actual ask.
function clean(s) {
  return String(s)
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ') // drop tag blocks (system-reminder, etc.)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

// The project directory a session belongs to — Claude Code sessions are scoped to their original
// cwd, so `claude --resume <id>` only works when run from there. Read the real cwd off the transcript.
function findSessionCwd(sessionId) {
  const root = claudeProjectsDir()
  try {
    for (const p of fs.readdirSync(root, { withFileTypes: true })) {
      if (!p.isDirectory()) continue
      const fp = path.join(root, p.name, sessionId + '.jsonl')
      if (!fs.existsSync(fp)) continue
      for (const line of readHead(fp).split('\n')) { // cwd is in the opening records — never read the whole transcript
        if (line.indexOf('"cwd"') === -1) continue
        try { const o = JSON.parse(line); if (o.cwd) return o.cwd } catch {}
      }
      return null
    }
  } catch {}
  return null
}

module.exports = { listSessions, findSessionCwd, activeSessionIds, transcriptMtime }
