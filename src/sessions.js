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

  const out = []
  for (const proj of projects) {
    const dir = path.join(root, proj.name)
    let files = []
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const full = path.join(dir, f)
      let stat
      try { stat = fs.statSync(full) } catch { continue }
      const sessionId = f.replace(/\.jsonl$/, '')
      const meta = readMeta(full) // { preview, slug, cwd }
      const cwd = meta.cwd || ''
      out.push({
        sessionId,
        slug: meta.slug || '',
        project: cwd || decodeProject(proj.name),
        modified: stat.mtimeMs,
        preview: meta.preview,
        cwd,
        branch: gitBranch(cwd),
        active: active.has(sessionId),
        status: active.get(sessionId) || null,
      })
    }
  }
  // active sessions first, then most-recently-modified
  out.sort((a, b) => (b.active - a.active) || (b.modified - a.modified))
  return out.slice(0, limit)
}

function decodeProject(encoded) {
  return encoded.replace(/^-/, '').split('-').filter(Boolean).slice(-2).join('/') || encoded
}

// One pass over the transcript: grab slug, first user message, and cwd.
function readMeta(file) {
  let preview = '', slug = '', cwd = ''
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      let o
      try { o = JSON.parse(line) } catch { continue }
      if (!slug && o.slug) slug = o.slug
      if (!cwd && o.cwd) cwd = o.cwd
      if (!preview) {
        const content = o.message && o.message.content
        if (typeof content === 'string' && content.trim() && o.type === 'user') preview = clean(content)
        else if (Array.isArray(content)) {
          const t = content.find(c => c && c.type === 'text' && c.text)
          if (t && o.type === 'user') preview = clean(t.text)
        }
      }
      if (slug && preview && cwd) break
    }
  } catch {}
  return { preview, slug, cwd }
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
      for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
        if (line.indexOf('"cwd"') === -1) continue
        try { const o = JSON.parse(line); if (o.cwd) return o.cwd } catch {}
      }
      return null
    }
  } catch {}
  return null
}

module.exports = { listSessions, findSessionCwd }
