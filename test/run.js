'use strict'
// Relay test suite — assert-based, no framework. Covers the load-bearing, UNWATCHED logic:
// the reset math + usage normalisation that decide *when* a walked-away job resumes, the limit
// detector that decides *whether* it resumes, and the security scrub that decides what secrets a
// headless (--dangerously-skip-permissions) task can see. A silent bug in any of these = "I came
// back to nothing done" or a leaked credential. Runs in `npm run check`.
const assert = require('assert')
const { normPct, pickResetAt, isLimitFalsePositive } = require('../src/usage')
const scheduler = require('../src/scheduler')
const { detectLimit, isSecretEnv, scrubSecrets, buildArgs } = require('../src/executor')

let pass = 0, fail = 0
const fails = []
function check(name, fn) {
  try { fn(); pass++ }
  catch (e) { fail++; fails.push(`  ✗ ${name}\n      ${e.message}`) }
}
const DAY = 86400000

// ── normPct — the field that pinned both gauges to 100% twice ─────────────────
check('normPct: used_percentage 25 → 25', () => assert.strictEqual(normPct({ used_percentage: 25 }), 25))
check('normPct: utilization 25 → 25', () => assert.strictEqual(normPct({ utilization: 25 }), 25))
check('normPct: utilization 1 → 1 (REGRESSION: was 100)', () => assert.strictEqual(normPct({ utilization: 1 }), 1))
check('normPct: utilization 100 → 100 (real limit fires)', () => assert.strictEqual(normPct({ utilization: 100 }), 100))
check('normPct: utilization 0 → 0', () => assert.strictEqual(normPct({ utilization: 0 }), 0))
check('normPct: 150 clamps to 100', () => assert.strictEqual(normPct({ utilization: 150 }), 100))
check('normPct: -5 clamps to 0', () => assert.strictEqual(normPct({ utilization: -5 }), 0))
check('normPct: 24.6 rounds to 25', () => assert.strictEqual(normPct({ used_percentage: 24.6 }), 25))
check('normPct: prefers used_percentage over utilization', () => assert.strictEqual(normPct({ used_percentage: 99, utilization: 1 }), 99))
check('normPct: null window → null', () => assert.strictEqual(normPct(null), null))
check('normPct: no usable field → null', () => assert.strictEqual(normPct({ resets_at: 123 }), null))

// ── pickResetAt — weekly-vs-session reset selection ───────────────────────────
const W = Date.now() + 7 * DAY, S = Date.now() + 3600e3
check('pickResetAt: weekly at 100% binds to weekly reset', () =>
  assert.strictEqual(pickResetAt({ weeklyPct: 100, weeklyResetsAt: W, sessionResetsAt: S }), new Date(W).toISOString()))
check('pickResetAt: weekly under 100% → session reset', () =>
  assert.strictEqual(pickResetAt({ weeklyPct: 40, sessionResetsAt: S }), new Date(S).toISOString()))
check('pickResetAt: weekly 100% but no weekly ts → falls back to session', () =>
  assert.strictEqual(pickResetAt({ weeklyPct: 100, sessionResetsAt: S }), new Date(S).toISOString()))
check('pickResetAt: error usage → null', () => assert.strictEqual(pickResetAt({ error: 'x' }), null))
check('pickResetAt: null → null', () => assert.strictEqual(pickResetAt(null), null))
check('pickResetAt: no timestamps → null', () => assert.strictEqual(pickResetAt({ weeklyPct: 40 }), null))

// ── isLimitFalsePositive — API veto for text-detected limit stops ─────────────
check('falsePositive: both windows low (25/2) → veto (true)', () =>
  assert.strictEqual(isLimitFalsePositive({ sessionPct: 25, weeklyPct: 2 }), true))
check('falsePositive: session at limit (100/2) → real, no veto', () =>
  assert.strictEqual(isLimitFalsePositive({ sessionPct: 100, weeklyPct: 2 }), false))
check('falsePositive: weekly at limit (30/100) → real, no veto', () =>
  assert.strictEqual(isLimitFalsePositive({ sessionPct: 30, weeklyPct: 100 }), false))
check('falsePositive: 89/89 just under threshold → veto', () =>
  assert.strictEqual(isLimitFalsePositive({ sessionPct: 89, weeklyPct: 89 }), true))
check('falsePositive: 90/10 at threshold → real, no veto', () =>
  assert.strictEqual(isLimitFalsePositive({ sessionPct: 90, weeklyPct: 10 }), false))
check('falsePositive: API unavailable (null) → trust text, no veto', () =>
  assert.strictEqual(isLimitFalsePositive(null), false))
check('falsePositive: API error → trust text, no veto', () =>
  assert.strictEqual(isLimitFalsePositive({ error: 'not_logged_in' }), false))
check('falsePositive: incomplete pct (null) → do not veto (avoid false negative)', () =>
  assert.strictEqual(isLimitFalsePositive({ sessionPct: null, weeklyPct: 2 }), false))

// ── nextSessionReset — start + 5h, next future occurrence (local time) ────────
check('nextSessionReset: 02:00 from local midnight → same-day 07:00', () => {
  const from = new Date(2026, 6, 1, 0, 0, 0)
  const r = scheduler.nextSessionReset('02:00', from)
  assert.strictEqual(r.getHours(), 7); assert.strictEqual(r.getMinutes(), 0)
  assert.strictEqual(r.getDate(), 1); assert.strictEqual(r - from, 7 * 3600e3)
})
check('nextSessionReset: 02:00 from local 08:00 → next-day 07:00 (already passed)', () => {
  const from = new Date(2026, 6, 1, 8, 0, 0)
  const r = scheduler.nextSessionReset('02:00', from)
  assert.strictEqual(r.getHours(), 7); assert.strictEqual(r.getDate(), 2); assert.ok(r > from)
})
check('nextSessionReset: wraps hours past midnight (22:00 + 5h)', () => {
  const from = new Date(2026, 6, 1, 12, 0, 0)
  const r = scheduler.nextSessionReset('22:00', from) // 22+5 = 27 → 03:00 next day
  assert.strictEqual(r.getHours(), 3); assert.ok(r > from)
})

// ── nextWeeklyReset — next future occurrence of weekday + time (local) ────────
check('nextWeeklyReset: returns a future Monday 02:00', () => {
  const from = new Date(2026, 6, 1, 12, 0, 0)
  const r = scheduler.nextWeeklyReset('Monday', '02:00', from)
  assert.strictEqual(r.getDay(), 1); assert.strictEqual(r.getHours(), 2); assert.strictEqual(r.getMinutes(), 0)
  assert.ok(r > from)
})
check('nextWeeklyReset: when already on target, advances a full week', () => {
  const from = new Date(2026, 6, 1, 12, 0, 0)
  const first = scheduler.nextWeeklyReset('Monday', '02:00', from)
  const second = scheduler.nextWeeklyReset('Monday', '02:00', first) // from === target instant
  const delta = second - first
  assert.ok(delta >= 6.5 * DAY && delta <= 7.5 * DAY, `delta was ${delta / DAY}d`)
  assert.strictEqual(second.getDay(), 1)
})

// ── dueTime — schedule → epoch ms ─────────────────────────────────────────────
check('dueTime: once uses stored at', () => {
  const at = new Date(2026, 6, 1, 9, 0, 0).toISOString()
  assert.strictEqual(scheduler.dueTime({ schedule: { kind: 'once', at } }, {}), new Date(at).getTime())
})
check('dueTime: at-next-reset with stored at uses it', () => {
  const at = new Date(2026, 6, 2, 9, 0, 0).toISOString()
  assert.strictEqual(scheduler.dueTime({ schedule: { kind: 'at-next-reset', at } }, {}), new Date(at).getTime())
})
check('dueTime: at-next-reset without at computes session reset', () => {
  const t = scheduler.dueTime({ schedule: { kind: 'at-next-reset' } }, { sessionStartTime: '02:00' })
  assert.ok(Number.isFinite(t) && t > Date.now())
})
check('dueTime: unsupported kind → Infinity (never fires)', () =>
  assert.strictEqual(scheduler.dueTime({ schedule: { kind: 'cron' } }, {}), Infinity))
check('dueTime: repeat uses stored at', () => {
  const at = new Date(2026, 6, 3, 9, 0, 0).toISOString()
  assert.strictEqual(scheduler.dueTime({ schedule: { kind: 'repeat', n: 1, unit: 'days', at } }, {}), new Date(at).getTime())
})

// ── nextRepeat — recurring-task re-arm math ───────────────────────────────────
check('nextRepeat: minutes fast-forward lands on grid within one interval, even after months', () => {
  const at = new Date(2026, 0, 1, 0, 0, 0), from = new Date(2026, 6, 1, 0, 0, 7)
  const next = scheduler.nextRepeat({ n: 30, unit: 'minutes', at }, from)
  assert.ok(next > from && next - from <= 30 * 60e3)
  assert.strictEqual((next - at) % (30 * 60e3), 0)
})
check('nextRepeat: hours advance by n', () => {
  const next = scheduler.nextRepeat({ n: 4, unit: 'hours', at: new Date(2026, 6, 2, 8, 0, 0) }, new Date(2026, 6, 2, 9, 0, 0))
  assert.strictEqual(next.getTime(), new Date(2026, 6, 2, 12, 0, 0).getTime())
})
check('nextRepeat: days preserve local wall-clock time (DST-safe)', () => {
  const next = scheduler.nextRepeat({ n: 1, unit: 'days', at: new Date(2026, 2, 1, 9, 0, 0) }, new Date(2026, 5, 15))
  assert.strictEqual(next.getHours(), 9)
  assert.ok(next > new Date(2026, 5, 15))
})
check('nextRepeat: weeks keep the same weekday and time', () => {
  const at = new Date(2026, 6, 1, 10, 0, 0)
  const next = scheduler.nextRepeat({ n: 1, unit: 'weeks', at }, new Date(2026, 6, 20))
  assert.strictEqual(next.getDay(), at.getDay())
  assert.strictEqual(next.getHours(), 10)
})
check('nextRepeat: future at returned unchanged', () => {
  const at = new Date(Date.now() + 3600e3)
  assert.strictEqual(scheduler.nextRepeat({ n: 1, unit: 'days', at }, new Date()).getTime(), at.getTime())
})
check('nextRepeat: garbage input → valid date, no throw/loop', () => {
  const next = scheduler.nextRepeat({ n: 'x', unit: 'days', at: 'not-a-date' }, new Date())
  assert.ok(next instanceof Date && !isNaN(next))
})

// ── detectLimit — the trigger for the whole walk-away promise ─────────────────
check('detectLimit: "usage limit" + "resets at 3:00pm" → stopped + hint', () => {
  const r = detectLimit("You've hit your usage limit. resets at 3:00pm")
  assert.strictEqual(r.stopped, true); assert.strictEqual(r.resetHint, '3:00pm')
})
check('detectLimit: "5-hour limit reached" → stopped', () => assert.strictEqual(detectLimit('5-hour limit reached').stopped, true))
check('detectLimit: "rate limit exceeded" → stopped', () => assert.strictEqual(detectLimit('rate limit exceeded').stopped, true))
check('detectLimit: normal success output → not stopped', () => assert.strictEqual(detectLimit('Done. 3 files changed, tests green.').stopped, false))
check('detectLimit: empty output → not stopped', () => assert.strictEqual(detectLimit('').stopped, false))
check('detectLimit: "delimiter" does not false-trigger on "limit"', () => assert.strictEqual(detectLimit('parsing delimiter tokens').stopped, false))
// KNOWN BRITTLENESS (documented, not failed): bare "resets at" in a task's own output trips it.
check('detectLimit: KNOWN false-positive — bare "resets at" trips (documented)', () =>
  assert.strictEqual(detectLimit('the cache resets at 02:00 nightly').stopped, true))
// REGRESSION: mr7hatbkh48kqb-1783648838861.log — a successful email-digest run (exit 0) got
// wrongly marked "stopped" because unanchored "resets?\s+at" substring-matched "reset" + the
// leading "at" of "attempts". Word-boundary fix in LIMIT_RE.
check('detectLimit: "no new password-reset attempts or Pay-in-4 activity" does not false-trigger', () =>
  assert.strictEqual(detectLimit('no new password-reset attempts or Pay-in-4 activity').stopped, false))
check('detectLimit: "implemented rate limiting for the API" does not false-trigger', () =>
  assert.strictEqual(detectLimit('implemented rate limiting for the API').stopped, false))
check('detectLimit: "try again attaching the file" does not false-trigger', () =>
  assert.strictEqual(detectLimit('please try again attaching the file').stopped, false))
// STRUCTURAL: a real limit stop terminates output, so only the tail is scanned. Limit-shaped
// prose buried mid-report (a task DISCUSSING limits — the 2026-07-10 fix-task false positive)
// must not trip; the same phrase as the final output must.
check('detectLimit: limit prose mid-output with a long tail after it → not stopped', () =>
  assert.strictEqual(detectLimit('Fixed the usage limit regex, resets at 3:00pm was matching prose. ' + 'x'.repeat(400) + ' All tests green.').stopped, false))
check('detectLimit: real limit message at end of long output → stopped + hint', () => {
  const r = detectLimit('x'.repeat(5000) + "\nYou've hit your usage limit. resets at 3:00pm")
  assert.strictEqual(r.stopped, true)
  assert.strictEqual(r.resetHint, '3:00pm')
})

// ── SECURITY: isSecretEnv — what gets stripped from a headless task's env ─────
for (const name of ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'OPENAI_API_KEY',
  'DB_PASSWORD', 'MY_PASS', 'PGPASSWORD', 'MYSQL_PWD', 'SERVICE_CREDENTIAL', 'APP_CREDENTIALS', 'FOO_PAT',
  'MY_DSN', 'DATABASE_URL', 'PG_CONNECTION_STRING', 'REDIS_CONNECTIONSTRING'])
  check(`isSecretEnv: strips ${name}`, () => assert.strictEqual(isSecretEnv(name), true))
for (const name of ['PATH', 'PWD', 'HOME', 'LANG', 'TEMP', 'APPDATA', 'SystemRoot', 'ComSpec',
  'npm_config_registry', 'COMPASS', 'MONKEY', 'BASE_URL_PATH', 'NODE_ENV'])
  check(`isSecretEnv: keeps ${name}`, () => assert.strictEqual(isSecretEnv(name), false))

// ── SECURITY: scrubSecrets — the invariant CLAUDE.md mandates ─────────────────
check('scrubSecrets: ANTHROPIC_API_KEY always removed (cost-safety invariant)', () => {
  assert.strictEqual(scrubSecrets({ ANTHROPIC_API_KEY: 'sk-x', PATH: '/usr/bin' }).ANTHROPIC_API_KEY, undefined)
})
check('scrubSecrets: removes matched secrets, keeps benign vars', () => {
  const out = scrubSecrets({ GH_TOKEN: 't', DATABASE_URL: 'postgres://u:p@h/db', PATH: '/b', HOME: '/h' })
  assert.strictEqual(out.GH_TOKEN, undefined); assert.strictEqual(out.DATABASE_URL, undefined)
  assert.strictEqual(out.PATH, '/b'); assert.strictEqual(out.HOME, '/h')
})
check('scrubSecrets: does not mutate the input env', () => {
  const env = { GH_TOKEN: 't', PATH: '/b' }
  scrubSecrets(env)
  assert.strictEqual(env.GH_TOKEN, 't') // original untouched
})

// ── SECURITY/correctness: buildArgs — flags + no API key, resume targeting ────
check('buildArgs: fresh task with skipPermissions', () => {
  const a = buildArgs({ mode: 'fresh' }, { skipPermissions: true })
  assert.ok(a.includes('-p')); assert.ok(a.includes('--dangerously-skip-permissions')); assert.ok(!a.includes('--resume'))
})
check('buildArgs: skipPermissions off omits the dangerous flag', () => {
  assert.ok(!buildArgs({ mode: 'fresh' }, { skipPermissions: false }).includes('--dangerously-skip-permissions'))
})
check('buildArgs: resume-full targets the session', () => {
  const a = buildArgs({ mode: 'resume-full', sessionId: 'abc123' }, {})
  assert.strictEqual(a[a.indexOf('--resume') + 1], 'abc123')
})
check('buildArgs: fresh pins assigned --session-id (deterministic resume target)', () => {
  const a = buildArgs({ mode: 'fresh' }, { assignSessionId: 'uuid-1' })
  assert.strictEqual(a[a.indexOf('--session-id') + 1], 'uuid-1'); assert.ok(!a.includes('--resume'))
})
check('buildArgs: resume ignores assignSessionId (continues existing, no --session-id)', () => {
  const a = buildArgs({ mode: 'resume-full', sessionId: 'abc123' }, { assignSessionId: 'uuid-1' })
  assert.ok(!a.includes('--session-id')); assert.strictEqual(a[a.indexOf('--resume') + 1], 'abc123')
})
check('buildArgs: forkSession adds --fork-session after --resume (collision escape)', () => {
  const a = buildArgs({ mode: 'resume-full', sessionId: 'abc123', forkSession: true }, {})
  assert.ok(a.includes('--fork-session')); assert.strictEqual(a[a.indexOf('--resume') + 1], 'abc123')
})
check('buildArgs: no --fork-session unless the collision guard set it', () => {
  assert.ok(!buildArgs({ mode: 'resume-full', sessionId: 'abc123' }, {}).includes('--fork-session'))
  assert.ok(!buildArgs({ mode: 'fresh', forkSession: true }, {}).includes('--fork-session')) // fresh never forks
})
check('buildArgs: model + effort forwarded when set', () => {
  const a = buildArgs({ mode: 'fresh', model: 'claude-opus-4-8', effort: 'high' }, {})
  assert.strictEqual(a[a.indexOf('--model') + 1], 'claude-opus-4-8')
  assert.strictEqual(a[a.indexOf('--effort') + 1], 'high')
})
check('buildArgs: no model/effort flags when unset', () => {
  const a = buildArgs({ mode: 'fresh' }, {})
  assert.ok(!a.includes('--model')); assert.ok(!a.includes('--effort'))
})

// ── report ────────────────────────────────────────────────────────────────────
console.log(`\nrelay tests: ${pass} passed, ${fail} failed`)
if (fail) { console.log('\nFAILURES:\n' + fails.join('\n')); process.exit(1) }
console.log('✓ all load-bearing + security logic verified\n')
