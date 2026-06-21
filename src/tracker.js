'use strict'
// Usage tracker — the "prime, don't scramble" gauge (DESIGN.md §4c).
//
// This is the same mechanism the Claude Code usage CLIs (e.g. ccusage) use: read the local
// transcript token counts and COMPUTE the gauge. There is no "remaining/reset" meter file to read
// — % = consumed-in-window ÷ a configured limit, reset = the window edge.
//
// "load" metric = input + output + cache_creation tokens. cache_READ is excluded on purpose: it's
// cheap context re-reads (hundreds of millions over a long session) and would swamp the gauge.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { claudeProjectsDir } = require('./paths')

// Most-recently-active session id (from the live ~/.claude/sessions registry) — so the live gauge's
// "Resume at reset" shortcut knows which session to resume.
function currentSessionId() {
  try {
    const dir = path.join(os.homedir(), '.claude', 'sessions')
    let best = null
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        if (o.sessionId && (!best || (o.updatedAt || 0) > (best.updatedAt || 0))) best = o
      } catch {}
    }
    return best && best.sessionId
  } catch { return null }
}

// Authoritative reading written by the statusLine bridge (scripts/relay-statusline.js).
function readAuthoritative(now) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.relay', 'usage.json'), 'utf8'))
    if (o && o.rate_limits && o.capturedAt) return { o, ageSec: now / 1000 - o.capturedAt }
  } catch {}
  return null
}

const HOUR = 3600e3
const DAY = 24 * HOUR

function turnLoad(u) {
  return (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
}

// Read every assistant turn (with usage) across all project transcripts touched within the window.
function collectTurns(sinceMs) {
  const root = claudeProjectsDir()
  const turns = []
  let projects = []
  try { projects = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()) } catch { return turns }
  for (const p of projects) {
    const dir = path.join(root, p.name)
    let files = []
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const full = path.join(dir, f)
      let stat; try { stat = fs.statSync(full) } catch { continue }
      if (stat.mtimeMs < sinceMs) continue // file untouched in window — skip whole file
      let data; try { data = fs.readFileSync(full, 'utf8') } catch { continue }
      for (const line of data.split('\n')) {
        if (line.indexOf('"output_tokens"') === -1) continue // fast filter before JSON.parse
        let o; try { o = JSON.parse(line) } catch { continue }
        const u = o.message && o.message.usage
        if (!u || u.output_tokens == null) continue
        const ts = Date.parse(o.timestamp)
        if (!ts || ts < sinceMs) continue
        turns.push({
          ts,
          model: (o.message && o.message.model) || '',
          load: turnLoad(u),
          sessionId: o.sessionId || f.replace(/\.jsonl$/, ''),
        })
      }
    }
  }
  turns.sort((a, b) => a.ts - b.ts)
  return turns
}

// 5-hour "session block": a block starts at the first activity; a turn >= windowMs after the block
// start opens a new block. The active block is the last one if it hasn't aged out.
function activeBlock(turns, windowMs, now) {
  if (!turns.length) return null
  let start = turns[0].ts
  let load = 0
  let lastSession = turns[0].sessionId
  for (const t of turns) {
    if (t.ts - start >= windowMs) { start = t.ts; load = 0 } // new block
    load += t.load
    lastSession = t.sessionId
  }
  const resetsAt = start + windowMs
  return { windowStart: start, resetsAt, load, active: now < resetsAt, lastSession }
}

function gauge(used, limit) {
  const l = Number(limit) || 0
  return { used, limit: l, pct: l > 0 ? Math.min(100, Math.round((used / l) * 100)) : null }
}

function snapshot(settings, now = Date.now()) {
  settings = settings || {}

  // 1) Prefer the AUTHORITATIVE reading from Claude Code's statusLine (real % + reset timestamps).
  const auth = readAuthoritative(now)
  const FRESH = 20 * 60 // seconds
  if (auth && auth.ageSec < FRESH) {
    const rl = auth.o.rate_limits
    const g = w => ({
      pct: w && w.used_percentage != null ? Math.round(w.used_percentage) : null,
      used: null, limit: null,
      resetsAt: w && w.resets_at ? w.resets_at * 1000 : null,
    })
    return {
      now, source: 'live', ageSec: Math.round(auth.ageSec),
      session: Object.assign(g(rl.five_hour), { windowHours: settings.sessionWindowHours || 5, active: true, sessionId: currentSessionId() }),
      weekly: Object.assign(g(rl.seven_day), { windowDays: settings.weeklyWindowDays || 7 }),
      weeklyOpus: { pct: null, used: null, limit: null },
    }
  }

  // 2) Fallback: transcript-based ESTIMATE (no statusLine data yet, or it's stale).
  const winMs = (settings.sessionWindowHours || 5) * HOUR
  const weekMs = (settings.weeklyWindowDays || 7) * DAY
  const turns = collectTurns(now - weekMs - HOUR)

  const blk = activeBlock(turns, winMs, now)
  const sessionLoad = blk && blk.active ? blk.load : 0
  const sessionReset = blk && blk.active ? blk.resetsAt : null
  const sessionStart = blk && blk.active ? blk.windowStart : null
  const lastSession = blk ? blk.lastSession : null

  let weeklyLoad = 0
  let weeklyOpus = 0
  for (const t of turns) {
    if (t.ts >= now - weekMs) {
      weeklyLoad += t.load
      if (/opus/i.test(t.model)) weeklyOpus += t.load
    }
  }

  return {
    now,
    source: 'estimate',
    lastLive: auth ? {
      ageSec: Math.round(auth.ageSec),
      session: auth.o.rate_limits.five_hour && Math.round(auth.o.rate_limits.five_hour.used_percentage),
      weekly: auth.o.rate_limits.seven_day && Math.round(auth.o.rate_limits.seven_day.used_percentage),
    } : null,
    session: Object.assign(gauge(sessionLoad, settings.sessionLoadLimit), {
      windowHours: settings.sessionWindowHours || 5,
      windowStart: sessionStart,
      resetsAt: sessionReset,
      active: !!(blk && blk.active),
      sessionId: lastSession,
    }),
    weekly: Object.assign(gauge(weeklyLoad, settings.weeklyLoadLimit), {
      windowDays: settings.weeklyWindowDays || 7,
      rolling: true, // rolling window — no single hard reset unless an anchor is configured later
    }),
    weeklyOpus: Object.assign(gauge(weeklyOpus, settings.weeklyOpusLoadLimit), { rolling: true }),
    turnsConsidered: turns.length,
  }
}

module.exports = { snapshot, collectTurns, turnLoad }
