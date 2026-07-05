'use strict'
// One-time setup: schedule the Interlinked card routines as recurring Relay tasks.
// Run: node scripts/schedule-interlinked-routines.js
const { execFileSync } = require('child_process')
const path = require('path')

const RELAY = path.join(__dirname, 'relay.js')
const IL_CLI = 'node C:/Users/pmdse/Documents/relay/scripts/interlinked.js'
const SOJOURNLY = 'C:/Users/pmdse/Documents/claude_itinerary'

const QUALITY = `Card quality bar: would a sharp assistant text this? Be brief, concrete, no filler. `
  + `If a tool you need (Gmail, Calendar) is unavailable in this session, silently skip that section. `
  + `Send at most ONE card, then stop. Do not edit any files. The interlinked CLI: ${IL_CLI}`

const routines = [
  {
    title: 'Interlinked: morning briefing',
    at: '2026-07-06T07:00:00+10:00',
    every: '1d',
    prompt: `You are Patrick's morning-briefing routine for Interlinked (his private card feed). Compose and send ONE card.

Gather (skip any section whose tools are unavailable):
1. EMAILS - search Gmail for unread inbox mail from the last 24h (is:unread in:inbox newer_than:1d). List up to 5 that actually matter: sender, subject, one-line gist. Ignore promos/notifications.
2. TODAY - Google Calendar events for today and tomorrow (date + time + title).
3. SOJOURNLY - via the Supabase MCP (project qiwxsetlndsqnypmxgcu) run read-only SQL: count of auth.users created in the last 24h (signups), count + sum(amount_total) from purchases in the last 24h (sales), count from error_logs in the last 24h. One line: "X new users, Y sales (Z AUD), N errors".

Then write the card body as tight markdown (## Emails / ## Today / ## Sojournly - one line each when empty: "Nothing new.") to a temp file and send:
${IL_CLI} send --type morning-briefing --title "Morning briefing - <weekday> <date>" --body-file <tempfile> --priority normal

${QUALITY}`,
  },
  {
    title: 'Interlinked: ops digest',
    at: '2026-07-05T21:00:00+10:00',
    every: '1d',
    prompt: `You are Patrick's nightly Sojournly ops-digest routine for Interlinked. Compose and send ONE card.

Via the Supabase MCP (project qiwxsetlndsqnypmxgcu) run read-only SQL for the last 24h:
- signups: count from auth.users where created_at > now() - interval '24 hours'
- sales: count and sum(amount_total) (cents) from purchases in the window
- tokens spent: sum from token_usage in the window if the table has a suitable column (inspect it first)
- errors: count from error_logs in the window; if > 0 include up to 3 distinct error kinds
- venue guard: count from venue_api_calls in the window, and any venue_closed / venue_not_found warnings in error_logs

Body: one markdown line per metric, real numbers, real money (AUD). A zero day is fine - say so plainly.
${IL_CLI} send --type ops-digest --title "Sojournly pulse - <date>" --body-file <tempfile> --priority normal

${QUALITY}`,
  },
  {
    title: 'Interlinked: midday email check',
    at: '2026-07-06T12:30:00+10:00',
    every: '1d',
    prompt: `You are Patrick's midday email-check routine for Interlinked. Search Gmail for unread inbox mail from the last 6 hours (is:unread in:inbox newer_than:6h). Filter hard: only mail a sharp assistant would interrupt Patrick for (real people, money, deadlines, Sojournly users, legal/government). Promos, newsletters and automated notifications never qualify.

If NOTHING qualifies: send no card at all and stop - silence is the correct output.
If something qualifies: send ONE card listing each item (sender, subject, one-line gist, why it matters):
${IL_CLI} send --type email-digest --title "Emails needing you" --body-file <tempfile> --priority normal

${QUALITY}`,
  },
]

for (const r of routines) {
  const out = execFileSync('node', [
    RELAY, 'schedule',
    '--title', r.title,
    '--prompt', r.prompt,
    '--mode', 'fresh',
    '--cwd', SOJOURNLY,
    '--at', r.at,
    '--every', r.every,
  ], { encoding: 'utf8' })
  process.stdout.write(out)
}
console.log('\nAll three routines scheduled.')
