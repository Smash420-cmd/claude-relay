'use strict'
// The due-task loop. Because Relay stays alive in the tray (autostart), an internal timer is
// enough — no OS cron needed. Ticks every settings.schedulerIntervalSec.

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// Next 5h session reset: user's typical session START time + 5 hours, next future occurrence.
function nextSessionReset(sessionStartTime, from = new Date()) {
  const [h, m] = String(sessionStartTime || '02:00').split(':').map(n => parseInt(n, 10) || 0)
  const d = new Date(from)
  d.setHours(h + 5, m, 0, 0)
  if (d <= from) d.setDate(d.getDate() + 1)
  return d
}

// Next weekly reset: next future occurrence of the user's configured start day + time.
function nextWeeklyReset(weeklyStartDay, weeklyStartTime, from = new Date()) {
  const target = DAYS.indexOf(weeklyStartDay || 'Monday')
  const [h, m] = String(weeklyStartTime || '02:00').split(':').map(n => parseInt(n, 10) || 0)
  const d = new Date(from)
  d.setHours(h, m, 0, 0)
  let daysUntil = (target - d.getDay() + 7) % 7
  if (daysUntil === 0 && d <= from) daysUntil = 7
  d.setDate(d.getDate() + daysUntil)
  return d
}

// When is a task due? Returns epoch ms (Infinity = never / unsupported).
function dueTime(task, settings) {
  const s = task.schedule || {}
  if (s.kind === 'once' || s.kind === 'repeat') return new Date(s.at).getTime()
  if (s.kind === 'at-next-reset') {
    return s.at ? new Date(s.at).getTime() : nextSessionReset(settings.sessionStartTime).getTime()
  }
  return Infinity
}

// Next occurrence of a repeat schedule strictly after `from`. Days/weeks step via setDate so the
// wall-clock time survives DST; minutes/hours are fixed-duration ms.
function nextRepeat(s, from = new Date()) {
  const n = Math.max(1, parseInt(s.n, 10) || 1)
  const d = new Date(s.at)
  if (isNaN(d)) return new Date(from.getTime() + 60000)
  if (s.unit === 'days' || s.unit === 'weeks') {
    const step = s.unit === 'weeks' ? n * 7 : n
    while (d <= from) d.setDate(d.getDate() + step) // few iterations even after long downtime
  } else {
    const step = (s.unit === 'hours' ? 3600e3 : 60e3) * n // minutes (default) or hours
    if (d <= from) d.setTime(d.getTime() + step * (Math.floor((from - d) / step) + 1))
  }
  return d
}

// start({ intervalMs, getState, runDueTask }) -> stop()
function start({ intervalMs, getState, runDueTask }) {
  let ticking = false
  const tick = async () => {
    if (ticking) return
    ticking = true
    const startedAt = Date.now()
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
      console.error('[scheduler] tick error:', e && e.message)
    } finally {
      ticking = false
      const elapsed = Date.now() - startedAt
      if (elapsed > intervalMs) console.warn(`[scheduler] slow tick: ${elapsed}ms > ${intervalMs}ms — ticks may be dropping`)
    }
  }
  const handle = setInterval(tick, intervalMs)
  tick()
  return () => clearInterval(handle)
}

module.exports = { start, nextSessionReset, nextWeeklyReset, dueTime, nextRepeat }
