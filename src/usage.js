'use strict'
// Pure usage-math helpers — no Electron, so they're unit-testable (these are exactly the
// load-bearing, unwatched calcs whose silent failure means "I came back to nothing done").

// Normalise a usage window to a 0–100 integer percent. Both API fields (used_percentage and
// utilization) are already percentages (e.g. 25), confirmed by tracker.js reading them straight.
// No fraction case: 1.0 ("100%") and 1 ("1%") are indistinguishable, so don't guess — take as-is.
function normPct(w) {
  if (!w) return null
  const v = w.used_percentage != null ? w.used_percentage : w.utilization
  if (v == null) return null
  return Math.min(100, Math.max(0, Math.round(v)))
}

// Pick the binding reset timestamp (ISO) from a usage reading: weekly if it's at 100% (the binding
// constraint), else the 5h session reset. Returns null if usage is missing/errored.
function pickResetAt(usage) {
  if (!usage || usage.error) return null
  if (usage.weeklyPct >= 100 && usage.weeklyResetsAt) return new Date(usage.weeklyResetsAt).toISOString()
  if (usage.sessionResetsAt) return new Date(usage.sessionResetsAt).toISOString()
  return null
}

// A run can be flagged "stopped on a limit" by text-matching the CLI output, which false-positives
// (e.g. a task that merely prints "resets at 2am"). Use the usage API to VETO — not to gate:
// only call it a false positive when the API is reachable AND BOTH windows are clearly below a
// limit. If the API is unavailable (logged out / blip) or its data is incomplete, return false so
// the caller trusts the text match (manual mode). This asymmetry avoids the dangerous case — a real
// limit getting suppressed and the user coming back to nothing — at the cost of a rare, cancelable
// phantom resume when not logged in. Threshold is 90 (not 100) to tolerate API rounding/lag.
function isLimitFalsePositive(usage) {
  if (!usage || usage.error) return false
  const s = usage.sessionPct, w = usage.weeklyPct
  if (typeof s !== 'number' || typeof w !== 'number') return false // incomplete → don't veto
  return s < 90 && w < 90
}

module.exports = { normPct, pickResetAt, isLimitFalsePositive }
