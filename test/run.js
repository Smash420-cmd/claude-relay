'use strict'
// Relay test suite — assert-based, no framework. Covers the load-bearing, UNWATCHED logic:
// the reset math + usage normalisation that decide *when* a walked-away job resumes, the limit
// detector that decides *whether* it resumes, and the security scrub that decides what secrets a
// headless (--dangerously-skip-permissions) task can see. A silent bug in any of these = "I came
// back to nothing done" or a leaked credential. Runs in `npm run check`.
const assert = require('assert')
const { normPct, pickResetAt, isLimitFalsePositive } = require('../src/usage')
const scheduler = require('../src/scheduler')
const { detectLimit, isSecretEnv, scrubSecrets, buildArgs, buildCodexArgs, isCodexModel } = require('../src/executor')

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
// Regression, 2026-08-17: a Sunday weekly-limit hold used to rewrite every pending task's
// schedule.at to reset+30s*n. For repeats that is permanent — nextRepeat steps forward from `at` —
// so six dailies (12:00/14:00/15:00/19:41/21:00/21:50) were stuck at ~12:00 every day after.
// The hold is now one settings.holdUntil and must leave each task's own slot untouched.
// start() fires one tick synchronously, and the hold check sits before any await, so a plain
// sync assertion sees the outcome. runDueTask is likewise invoked before the first suspend.
function tickOnce(settings, task) {
  const ran = []
  scheduler.start({
    intervalMs: 60e3,
    getState: () => ({ tasks: [task], settings }),
    runDueTask: t => { ran.push(t.id); return Promise.resolve() },
  })()
  return ran
}
check('holdUntil pauses the queue without moving any task', () => {
  const at = new Date(Date.now() - 60e3).toISOString() // overdue: fires instantly unless held
  const task = { id: 't1', status: 'scheduled', schedule: { kind: 'repeat', n: 1, unit: 'days', at } }
  const ran = tickOnce({ holdUntil: new Date(Date.now() + 3600e3).toISOString() }, task)
  assert.strictEqual(ran.length, 0, 'held queue ran a task')
  assert.strictEqual(task.schedule.at, at, 'hold moved the task — the old rescheduleAllPending bug')
})
check('holdUntil in the past does not block (stale value stays inert)', () => {
  const at = new Date(Date.now() - 60e3).toISOString()
  const task = { id: 't1', status: 'scheduled', schedule: { kind: 'repeat', n: 1, unit: 'days', at } }
  assert.deepStrictEqual(tickOnce({ holdUntil: new Date(Date.now() - 3600e3).toISOString() }, task), ['t1'])
})
check('nextRepeat: a slot missed during a hold keeps its wall-clock time', () => {
  // Task due Sunday 14:00, held through to Monday 12:00 — next fire must be Monday 14:00, not noon.
  const next = scheduler.nextRepeat(
    { n: 1, unit: 'days', at: new Date(2026, 7, 16, 14, 0, 0) },
    new Date(2026, 7, 17, 12, 0, 0),
  )
  assert.strictEqual(next.getDate(), 17)
  assert.strictEqual(next.getHours(), 14)
  assert.strictEqual(next.getMinutes(), 0)
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
check('isCodexModel: gpt-* routes to codex, claude-* does not', () => {
  assert.ok(isCodexModel('gpt-6-sol')); assert.ok(isCodexModel('gpt-5.5'))
  assert.ok(!isCodexModel('claude-opus-5-5')); assert.ok(!isCodexModel('')); assert.ok(!isCodexModel(null))
})
check('buildCodexArgs: fresh — model, effort, bypass, prompt from stdin', () => {
  const a = buildCodexArgs({ mode: 'fresh', model: 'gpt-6-sol', effort: 'ultra' }, { skipPermissions: true })
  assert.deepStrictEqual(a, ['exec', '-m', 'gpt-6-sol', '-c', 'model_reasoning_effort="ultra"', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-'])
})
check('buildCodexArgs: resume-full targets the session, no bypass when off', () => {
  const a = buildCodexArgs({ mode: 'resume-full', sessionId: 'abc', model: 'gpt-5.5' }, { skipPermissions: false })
  assert.deepStrictEqual(a.slice(0, 3), ['exec', 'resume', 'abc']); assert.ok(!a.includes('--dangerously-bypass-approvals-and-sandbox'))
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
check('buildArgs: --chrome only when the task opts in', () => {
  assert.ok(buildArgs({ mode: 'fresh', chrome: true }, {}).includes('--chrome'))
  assert.ok(!buildArgs({ mode: 'fresh' }, {}).includes('--chrome'))
})

// ── relay CLI: --model/--effort are mandatory ────────────────────────────────
// A task scheduled without them inherits the Claude CLI's interactive default, which changes
// between CLI releases — an unattended run can silently land on a premium model.
const { spawnSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
const CLI = path.join(__dirname, '..', 'scripts', 'relay.js')
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-')) // store path comes from APPDATA/HOME — keep the real store out of this
const cli = (...args) => spawnSync(process.execPath, [CLI, 'schedule', '--at', '+5m', '--prompt', 'x', ...args],
  { encoding: 'utf8', env: { ...process.env, APPDATA: SANDBOX, HOME: SANDBOX, USERPROFILE: SANDBOX, XDG_CONFIG_HOME: SANDBOX } })

check('cli schedule: no --model → exits 1', () => {
  const r = cli()
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /--model is required/)
})
check('cli schedule: --model with no value → exits 1 (bare flag parses to boolean true)', () => {
  const r = cli('--model', '--effort', 'high')
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /--model is required/)
})
check('cli schedule: --model without --effort → exits 1', () => {
  const r = cli('--model', 'claude-sonnet-5')
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /--effort is required/)
})
check('cli schedule: Haiku + --effort → exits 1 (the Claude CLI rejects effort on Haiku)', () => {
  const r = cli('--model', 'claude-haiku-4-5-20251001', '--effort', 'high')
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /not supported on Haiku/)
})
check('cli schedule: Haiku without --effort → accepted', () => {
  const r = cli('--model', 'claude-haiku-4-5-20251001')
  assert.strictEqual(r.status, 0, r.stderr)
})
check('cli schedule: model + effort → accepted, both persisted on the task', () => {
  const r = cli('--model', 'claude-sonnet-5', '--effort', 'high')
  assert.strictEqual(r.status, 0, r.stderr)
  const db = JSON.parse(fs.readFileSync(path.join(SANDBOX, 'relay', 'relay-data.json'), 'utf8'))
  assert.strictEqual(db.tasks[0].model, 'claude-sonnet-5')
  assert.strictEqual(db.tasks[0].effort, 'high')
})
// Browser access has to be reachable from the CLI: agents schedule through it and can't tick
// the app's "Browser access" box, so without --chrome a browser task silently runs tool-less.
check('cli schedule: --chrome persists chrome:true; omitted → false', () => {
  const readTop = () => JSON.parse(fs.readFileSync(path.join(SANDBOX, 'relay', 'relay-data.json'), 'utf8')).tasks[0]
  assert.strictEqual(cli('--model', 'claude-sonnet-5', '--effort', 'high', '--chrome').status, 0)
  assert.strictEqual(readTop().chrome, true)
  assert.strictEqual(cli('--model', 'claude-sonnet-5', '--effort', 'high').status, 0)
  assert.strictEqual(readTop().chrome, false)
})
try { fs.rmSync(SANDBOX, { recursive: true, force: true }) } catch {}

// ── transcript reads: the task modal and the usage gauge must not read 1.3GB ──
// Both used to slurp whole transcripts: opening "Add task" cost 3.7s, and every 30s gauge refresh
// re-parsed ~90MB on the main process. Metadata is head-only now; turns are cached per mtime+size.
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-home-'))
  const projDir = path.join(home, '.claude', 'projects', '-c--proj')
  fs.mkdirSync(projDir, { recursive: true })
  const file = path.join(projDir, '11111111-2222-3333-4444-555555555555.jsonl')
  const turn = (mins, model, out) => JSON.stringify({
    type: 'assistant', timestamp: new Date(Date.now() - mins * 60e3).toISOString(),
    message: { model, usage: { input_tokens: 10, output_tokens: out, cache_creation_input_tokens: 5 } },
  })
  fs.writeFileSync(file, [
    JSON.stringify({ type: 'user', cwd: 'C:\\proj', message: { role: 'user', content: 'first ask' } }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Session title' }),
    turn(10, 'claude-sonnet-5', 100),
    'x'.repeat(400 * 1024), // past the 256KB head window — must not be needed for metadata
  ].join('\n') + '\n')

  const prevHome = process.env.HOME, prevProfile = process.env.USERPROFILE
  process.env.HOME = home; process.env.USERPROFILE = home
  try {
    delete require.cache[require.resolve('../src/tracker')]
    delete require.cache[require.resolve('../src/sessions')]
    const tracker = require('../src/tracker')
    const sessions = require('../src/sessions')

    check('sessions: metadata comes from the head, not the whole file', () => {
      const s = sessions.listSessions()
      assert.strictEqual(s.length, 1)
      assert.strictEqual(s[0].title, 'Session title')
      assert.strictEqual(s[0].cwd, 'C:\\proj')
      assert.match(s[0].preview, /first ask/)
    })
    check('collectTurns: reads turns in window', () => {
      const t = tracker.collectTurns(Date.now() - 3600e3)
      assert.strictEqual(t.length, 1); assert.strictEqual(t[0].load, 115)
    })
    check('collectTurns: cache invalidates when the transcript grows (REGRESSION: stale gauge)', () => {
      fs.appendFileSync(file, turn(1, 'claude-opus-5', 50) + '\n')
      const t = tracker.collectTurns(Date.now() - 3600e3)
      assert.strictEqual(t.length, 2)
      assert.ok(t.some(x => /opus/.test(x.model)), 'appended turn missing — cache served a stale parse')
    })
    check('collectTurns: window filter still applies to cached turns', () => {
      assert.strictEqual(tracker.collectTurns(Date.now() - 5 * 60e3).length, 1) // only the 1-min-old turn
    })
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome
    if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile
    delete require.cache[require.resolve('../src/tracker')]
    delete require.cache[require.resolve('../src/sessions')]
    try { fs.rmSync(home, { recursive: true, force: true }) } catch {}
  }
}

// ── report ────────────────────────────────────────────────────────────────────
console.log(`\nrelay tests: ${pass} passed, ${fail} failed`)
if (fail) { console.log('\nFAILURES:\n' + fails.join('\n')); process.exit(1) }
console.log('✓ all load-bearing + security logic verified\n')
