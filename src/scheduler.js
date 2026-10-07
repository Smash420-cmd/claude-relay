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
// Codex phasing (Patrick, 2026-10-02): one Sol/high posting run ate ~90% of the 5h Codex
// allowance, so Codex tasks start at least `codexGapHours` (default 5) after the last Codex
// start. Claude tasks are unaffected. A held Codex task just stays due and runs once the gap ends.
const isCodexModel = (m) => /^(gpt-|codex-|o\d)/i.test(m || '')  // same rule as executor.js
function lastCodexStart(tasks) {
  let last = 0
  for (const t of tasks) {
    if (isCodexModel(t.model) && t.lastRunAt) last = Math.max(last, new Date(t.lastRunAt).getTime() || 0)
    // A Claude task that fell back to Codex spent Codex allowance too (lastCodexRunAt, set by main.js)
    if (t.lastCodexRunAt) last = Math.max(last, new Date(t.lastCodexRunAt).getTime() || 0)
  }
  return last
}
function codexHeld(task, lastStart, settings, now = Date.now()) {
  const gapMs = (settings.codexGapHours ?? 5) * 3600e3
  return isCodexModel(task.model) && lastStart > 0 && now - lastStart < gapMs
}

function start({ intervalMs, getState, runDueTask, getTask }) {
  let ticking = false
  const tick = async () => {
    if (ticking) return
    ticking = true
    const startedAt = Date.now()
    try {
      const { tasks, settings } = getState()
      const now = Date.now()
      // A usage limit holds the WHOLE queue until the reset, as one timestamp. The old approach
      // rewrote every pending task's schedule.at instead — which for a repeat task is permanent
      // (nextRepeat steps forward from `at`), so one Sunday limit moved six dailies to noon
      // for good. Never touch a task's own slot; a missed occurrence is just missed.
      const hold = settings.holdUntil ? new Date(settings.holdUntil).getTime() : 0
      if (hold > now) {
        if (!tick.heldLogged) { console.log(`[scheduler] queue held until ${new Date(hold).toLocaleString()} (usage limit)`); tick.heldLogged = true }
        return
      }
      tick.heldLogged = false
      // Due tasks run SEQUENTIALLY on purpose: parallel claude runs would race each other into the
      // session limit. Consequence: one long run delays everything behind it (incl. repeat slots).
      let lastCodex = lastCodexStart(tasks)
      // Oldest due first (stable). In store order (newest first) a Codex task that re-armed inside
      // the gap was always ahead of an older one, and the older one was held at every gap expiry.
      const due = tasks.filter(t => t.status === 'scheduled' && dueTime(t, settings) <= now)
        .sort((a, b) => dueTime(a, settings) - dueTime(b, settings))
      for (const t of due) {
        if (codexHeld(t, lastCodex, settings, now)) {
          if (!tick.codexLogged) { console.log(`[scheduler] codex task ${t.id} held until ${new Date(lastCodex + (settings.codexGapHours ?? 5) * 3600e3).toLocaleString()} (codex gap)`); tick.codexLogged = true }
          continue
        }
        // The loop walks a snapshot, and runs are sequential: a task cancelled, deleted or edited
        // while an earlier one ran must not start from its stale copy. Re-read it first.
        // A run earlier in this tick can hit a usage limit and hold the queue: stop here, not after
        // every remaining due task has also tried (and fallen back) one by one.
        const hold = new Date(getState().settings.holdUntil || 0).getTime() || 0
        if (hold > Date.now()) break
        const cur = getTask ? getTask(t.id) : t
        if (!cur || cur.status !== 'scheduled' || dueTime(cur, settings) > Date.now()) continue
        // runDueTask returns false when it deferred without starting (cost guard): that must not
        // take the Codex slot, or the deferred task holds every other Codex task back.
        const runAt = Date.now()
        const started = await runDueTask(cur)
        if (isCodexModel(cur.model) && started !== false) { lastCodex = runAt; tick.codexLogged = false }
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

module.exports = { start, nextSessionReset, nextWeeklyReset, dueTime, nextRepeat, lastCodexStart, codexHeld }
