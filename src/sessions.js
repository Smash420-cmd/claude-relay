'use strict'
// Discover local Claude Code conversations so a task can target a specific session to resume.
// Sessions live as ~/.claude/projects/<encoded-project>/<session-id>.jsonl
const fs = require('fs')
const path = require('path')
const { claudeProjectsDir } = require('./paths')

function listSessions(limit = 60) {
  const root = claudeProjectsDir()
  let projects = []
  try {
    projects = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())
  } catch {
    return [] // ~/.claude/projects not present — return empty, UI shows a hint
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
      out.push({
        sessionId: f.replace(/\.jsonl$/, ''),
        project: decodeProject(proj.name),
        modified: stat.mtimeMs,
        preview: firstUserText(full),
      })
    }
  }
  out.sort((a, b) => b.modified - a.modified)
  return out.slice(0, limit)
}

// Claude encodes the project path into the folder name (path separators → '-'). This is a
// best-effort decode for DISPLAY only; we never rely on it for correctness.
function decodeProject(encoded) {
  return encoded.replace(/^-/, '').split('-').filter(Boolean).slice(-2).join('/') || encoded
}

function firstUserText(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      let obj
      try { obj = JSON.parse(line) } catch { continue }
      const content = obj?.message?.content ?? obj?.content
      if (typeof content === 'string' && content.trim()) return content.trim().slice(0, 90)
      if (Array.isArray(content)) {
        const t = content.find(c => c && c.type === 'text' && c.text)?.text
        if (t) return t.trim().slice(0, 90)
      }
    }
  } catch {}
  return ''
}

module.exports = { listSessions }
