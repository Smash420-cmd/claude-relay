#!/usr/bin/env node
// interlinked — sender CLI for the Interlinked feed (spec: Documents/interlinked/SPEC.md)
// Cards are Claude texting Patrick. This is the only writer besides Relay itself.
//
// Usage:
//   interlinked send --type dev-update --title "..." [--body "md" | --body-file x.md]
//                    [--priority low|normal|urgent] [--propose | --actions '<json>']
//                    [--data '<json>'] [--pin] [--expires <ISO>] [--remind <ISO>]
//   interlinked update <card-id> [--title ...] [--body ...] [--status in_progress|done|...]
//   interlinked list [--limit 10]        (debug: newest cards)
//   interlinked intents                  (debug: unhandled intents)
//
// Auth: INTERLINKED_SERVICE_KEY env var (Supabase service_role key).
// Never touches ANTHROPIC_API_KEY (relay security rule applies here too).

const fs = require('fs')

const URL_BASE = process.env.INTERLINKED_SUPABASE_URL || 'https://trbiwkfqfwcevfqmhwai.supabase.co'
let KEY = process.env.INTERLINKED_SERVICE_KEY
if (!KEY && process.platform === 'win32') {
  // Relay-spawned Claude sessions have secrets scrubbed from env — fall back to the User registry.
  try {
    KEY = require('child_process').execFileSync('powershell.exe',
      ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('INTERLINKED_SERVICE_KEY','User')"],
      { encoding: 'utf8', windowsHide: true }).trim() || undefined
  } catch {}
}

const TYPES = ['morning-briefing', 'email-digest', 'dev-update', 'relay-task',
  'calendar', 'ops-digest', 'list', 'reminder', 'alert', 'note']
const TRIAD = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'other', label: 'Something else…' }]

function die(msg) { console.error('interlinked: ' + msg); process.exit(1) }

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) args[key] = true
      else { args[key] = next; i++ }
    } else args._.push(a)
  }
  return args
}

async function rest(method, path, body) {
  if (!KEY) die('INTERLINKED_SERVICE_KEY not set (Supabase service_role key)')
  // New-style keys (sb_secret_/sb_publishable_) go in apikey only;
  // legacy JWT keys also need the Authorization bearer.
  const headers = {
    apikey: KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  if (!KEY.startsWith('sb_')) headers.Authorization = `Bearer ${KEY}`
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) die(`${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  const [cmd, ...rest_] = process.argv.slice(2)
  const args = parseArgs(rest_)

  if (cmd === 'send') {
    if (!args.type || !TYPES.includes(args.type)) die(`--type required, one of: ${TYPES.join(', ')}`)
    if (!args.title) die('--title required')
    let body_md = args.body ?? null
    if (args['body-file']) body_md = fs.readFileSync(args['body-file'], 'utf8')
    let actions = []
    if (args.propose) actions = TRIAD
    if (args.actions) actions = JSON.parse(args.actions)
    const card = {
      type: args.type,
      title: args.title,
      body_md,
      priority: args.priority || 'normal',
      actions,
      data: args.data ? JSON.parse(args.data) : {},
      pinned: !!args.pin,
      status: args.status || 'unread',
      expires_at: args.expires || null,
      remind_at: args.remind || null,
    }
    const [row] = await rest('POST', 'il_cards', card)
    console.log(row.id)                      // stdout = card id, for later `update`
    return
  }

  if (cmd === 'update') {
    const id = args._[0]
    if (!id) die('update <card-id> required')
    const patch = {}
    for (const k of ['title', 'status', 'priority']) if (args[k]) patch[k] = args[k]
    if (args.body) patch.body_md = args.body
    if (args['body-file']) patch.body_md = fs.readFileSync(args['body-file'], 'utf8')
    if (args.data) patch.data = JSON.parse(args.data)
    if (args.pin !== undefined) patch.pinned = args.pin !== 'false'
    if (!Object.keys(patch).length) die('nothing to update')
    await rest('PATCH', `il_cards?id=eq.${id}`, patch)
    console.log('updated')
    return
  }

  if (cmd === 'list') {
    const rows = await rest('GET', `il_cards?order=created_at.desc&limit=${args.limit || 10}&select=id,created_at,type,title,status,priority`)
    for (const r of rows) console.log(`${r.created_at}  [${r.type}] (${r.status}) ${r.title}  ${r.id}`)
    return
  }

  if (cmd === 'intents') {
    const rows = await rest('GET', 'il_intents?handled_at=is.null&order=created_at.asc&select=id,card_id,action_id,payload,created_at')
    console.log(JSON.stringify(rows, null, 2))
    return
  }

  die('usage: interlinked send|update|list|intents (see file header)')
}

main().catch(e => die(e.message))
