'use strict'
// The due-task loop. Because Relay stays alive in the tray (autostart), an internal timer is
// enough — no OS cron needed. Ticks every settings.schedulerIntervalSec.

// Next occurrence of a daily local HH:MM (drives "at next reset").
function nextResetDate(dailyResetTime, from = new Date()) {
  const parts = String(dailyResetTime || '02:20').split(':')
  const h = parseInt(parts[0], 10) || 0
  const m = parseInt(parts[1], 10) || 0
  const d = new Date(from)
  d.setHours(h, m, 0, 0)
  if (d <= from) d.setDate(d.getDate() + 1)
  return d
}

// When is a task due? Returns epoch ms (Infinity = never / unsupported).
function dueTime(task, settings) {
  const s = task.schedule || {}
  if (s.kind === 'once') return new Date(s.at).getTime()
  if (s.kind === 'at-next-reset') {
    return s.at ? new Date(s.at).getTime() : nextResetDate(settings.dailyResetTime).getTime()
  }
  return Infinity // 'cron'/recurring not in the MVP (DESIGN.md Phase 2)
}

// start({ intervalMs, getState, runDueTask }) -> stop()
function start({ intervalMs, getState, runDueTask }) {
  let ticking = false
  const tick = async () => {
    if (ticking) return // never overlap ticks
    ticking = true
    try {
      const { tasks, settings } = getState()
      const now = Date.now()
      for (const t of tasks) {
        if (t.status !== 'scheduled') continue
        if (dueTime(t, settings) <= now) {
          await runDueTask(t)
        }
      }
    } catch (e) {
      // never let a bad task kill the loop
      console.error('[scheduler] tick error:', e && e.message)
    } finally {
      ticking = false
    }
  }
  const handle = setInterval(tick, intervalMs)
  tick()
  return () => clearInterval(handle)
}

module.exports = { start, nextResetDate, dueTime }
