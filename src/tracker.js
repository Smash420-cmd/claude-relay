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

// Transcripts are append-only, so each file is read once and then only its NEW bytes. The old code
// re-read the whole file on every change; with sessions past 1 GB that meant ~2 GB of buffers in
// the main process per gauge refresh, the likely cause of Relay vanishing with no log (8 Oct).
// A file's first read starts at most TAIL_MAX from its end (older turns can't sit in a 7-day
// window of a live session, and the gauge is an estimate anyway); a later read that finds more
// than TAIL_MAX of new bytes also skips to the last TAIL_MAX. A shrunk file is read afresh.
const TAIL_MAX = 64 * 1024 * 1024
const KEEP_MS = 8 * DAY   // turns older than this are dropped from the cache: no window looks that far back
const fileCache = new Map() // path -> { offset, turns } — offset = byte after the last complete line read

// Read [start, end) of a file and return complete lines. midLine: start isn't a known line boundary
// (a tail skip), so the first, possibly cut, line is dropped. A trailing line without '\n' is left
// for the next read.
function readLines(full, start, end, midLine) {
  const fd = fs.openSync(full, 'r')
  try {
    const buf = Buffer.alloc(end - start)
    const n = fs.readSync(fd, buf, 0, buf.length, start)
    let text = buf.subarray(0, n).toString('utf8')
    let from = 0
    if (midLine) { from = text.indexOf('\n') + 1; if (from === 0) return { lines: [], consumed: 0 } }
    const last = text.lastIndexOf('\n')
    if (last < from) return { lines: [], consumed: Buffer.byteLength(text.slice(0, from), 'utf8') }   // bytes, not chars
    const consumed = Buffer.byteLength(text.slice(0, last + 1), 'utf8')
    return { lines: text.slice(from, last).split('\n'), consumed }
  } finally { fs.closeSync(fd) }
}

function parseTurns(lines, f) {
  const out = []
  for (const line of lines) {
    if (line.indexOf('"output_tokens"') === -1) continue // fast filter before JSON.parse
    let o; try { o = JSON.parse(line) } catch { continue }
    const u = o.message && o.message.usage
    if (!u || u.output_tokens == null) continue
    const ts = Date.parse(o.timestamp)
    if (!ts) continue
    out.push({ ts, model: (o.message && o.message.model) || '', load: turnLoad(u), sessionId: o.sessionId || f.replace(/\.jsonl$/, '') })
  }
  return out
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
      let hit = fileCache.get(full)
      if (hit && stat.size < hit.offset) hit = null   // shrunk or replaced: start over
      const offset = hit ? hit.offset : 0
      if (stat.size > offset) {
        const start = Math.max(offset, stat.size - TAIL_MAX)
        let r; try { r = readLines(full, start, stat.size, start > offset) } catch { continue }
        const cutoff = Date.now() - KEEP_MS
        const kept = (start > offset ? [] : (hit ? hit.turns : [])).filter(t => t.ts >= cutoff)
        hit = { offset: start + r.consumed, turns: kept.concat(parseTurns(r.lines, f)) }
        fileCache.set(full, hit)
      }
      if (hit) for (const t of hit.turns) if (t.ts >= sinceMs) turns.push(t)
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
  // Trust it as long as the 5h window hasn't ROLLED (resets_at still in the future) — NOT a
  // time-since-capture cutoff. During an idle stretch the last reading is still roughly valid (the %
  // is last-known, the reset is an absolute timestamp), and that beats slamming the bar to an
  // estimate-zero. Only once the window resets does the captured % become meaningless.
  const auth = readAuthoritative(now)
  const fh = auth && auth.o.rate_limits && auth.o.rate_limits.five_hour
  const windowOpen = fh && fh.resets_at && fh.resets_at * 1000 > now
  if (auth && windowOpen) {
    const rl = auth.o.rate_limits
    const capturedAtMs = auth.o.capturedAt * 1000
    const capturedPct = fh.used_percentage != null ? fh.used_percentage : null

    // Blend: live base % + transcript delta since capture.
    // delta% = (tokens_since_capture / tokens_at_capture) * captured_pct
    // This keeps the authoritative reset timestamp + window shape, while tracking tokens
    // consumed since the last statusLine fire (which only happens on Claude Code responses).
    let sessionPct = capturedPct != null ? Math.round(capturedPct) : null
    if (capturedPct != null && capturedPct > 0 && auth.ageSec > 30) {
      try {
        const winMs = (5) * HOUR
        const turns = collectTurns(now - winMs)
        const tokensAtCapture = turns.filter(t => t.ts <= capturedAtMs).reduce((s, t) => s + t.load, 0)
        const tokensSince = turns.filter(t => t.ts > capturedAtMs).reduce((s, t) => s + t.load, 0)
        if (tokensAtCapture > 0 && tokensSince > 0) {
          sessionPct = Math.round(capturedPct + (tokensSince / tokensAtCapture) * capturedPct)
        }
      } catch {}
    }

    const g = w => ({
      pct: w && w.used_percentage != null ? Math.round(w.used_percentage) : null,
      used: null, limit: null,
      resetsAt: w && w.resets_at ? w.resets_at * 1000 : null,
    })
    return {
      now, source: 'live', ageSec: Math.round(auth.ageSec),
      session: Object.assign(g(rl.five_hour), { pct: sessionPct, windowHours: 5, active: true, sessionId: currentSessionId() }),
      weekly: Object.assign(g(rl.seven_day), { windowDays: 7 }),
      weeklyOpus: { pct: null, used: null, limit: null },
    }
  }

  // 2) Fallback: transcript-based ESTIMATE (no statusLine data yet, or it's stale).
  const winMs = (5) * HOUR
  const weekMs = (7) * DAY
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
      // ponytail: premium tier by name pattern — /opus/ alone missed claude-fable-5 entirely,
      // so a Fable-heavy week read as zero premium spend. Ceiling: the NEXT premium family name
      // falls through this the same way. Upgrade path when that bites — a per-model tier map.
      if (/opus|fable|mythos/i.test(t.model)) weeklyOpus += t.load
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
      windowHours: 5,
      windowStart: sessionStart,
      resetsAt: sessionReset,
      active: !!(blk && blk.active),
      sessionId: lastSession,
    }),
    weekly: Object.assign(gauge(weeklyLoad, settings.weeklyLoadLimit), {
      windowDays: 7,
      rolling: true,
    }),
    weeklyOpus: Object.assign(gauge(weeklyOpus, settings.weeklyOpusLoadLimit), { rolling: true }),
  }
}

module.exports = { snapshot, collectTurns, turnLoad }
