'use strict'
// Interlinked bridge — Relay's side of the Triforce (spec: Documents/interlinked/SPEC.md §2b).
//   • Task runs post a live relay-task card (silent) and update it with the outcome.
//   • Failures/limit-stops insert an alert card (pushes to the phone).
//   • A poller consumes il_intents (phone verdicts) and enqueues Relay tasks.
// Entirely optional: every function no-ops if INTERLINKED_SERVICE_KEY is unavailable.
// Never touches ANTHROPIC_API_KEY.

const { execFileSync } = require('child_process')
const fs = require('fs')

const URL_BASE = process.env.INTERLINKED_SUPABASE_URL || 'https://trbiwkfqfwcevfqmhwai.supabase.co'

let cachedKey
function key() {
  if (cachedKey !== undefined) return cachedKey
  cachedKey = process.env.INTERLINKED_SERVICE_KEY || null
  if (!cachedKey && process.platform === 'win32') {
    // The app may have started before the env var existed; read the User registry value.
    try {
      cachedKey = execFileSync('powershell.exe',
        ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('INTERLINKED_SERVICE_KEY','User')"],
        { encoding: 'utf8', windowsHide: true }).trim() || null
    } catch { cachedKey = null }
  }
  return cachedKey
}

async function rest(method, path, body) {
  const k = key()
  if (!k) return null
  const headers = { apikey: k, 'Content-Type': 'application/json', Prefer: 'return=representation' }
  if (!k.startsWith('sb_')) headers.Authorization = `Bearer ${k}`
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`interlinked ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── cards ────────────────────────────────────────────────────────────────

// Task started → silent live card (feeds the app's Live strip; no push).
async function taskStarted(task) {
  try {
    const rows = await rest('POST', 'il_cards', {
      type: 'relay-task',
      title: `Running: ${task.title}`,
      body_md: (task.prompt || '').slice(0, 400),
      priority: 'low',
      status: 'in_progress',
      data: { relay_task_id: task.id },
    })
    return rows?.[0]?.id ?? null
  } catch (e) { console.warn('[interlinked] taskStarted:', e.message); return null }
}

// Task finished → update the live card. Failures also insert an alert (pushes).
async function taskFinished(cardId, task, res) {
  try {
    let tail = ''
    try { tail = fs.readFileSync(res.logPath, 'utf8').slice(-600) } catch {}
    const ok = res.status === 'succeeded'
    if (cardId) {
      await rest('PATCH', `il_cards?id=eq.${cardId}`, {
        title: `${ok ? '✅' : res.status === 'stopped' ? '⏸' : '❌'} ${task.title}`,
        body_md: `**${res.status}** (exit ${res.exitCode})\n\n\`\`\`\n${tail}\n\`\`\``,
        status: ok ? 'read' : 'unread',
      })
    }
    if (!ok) {
      await rest('POST', 'il_cards', {
        type: 'alert',
        title: `Relay task ${res.status}: ${task.title}`,
        body_md: `Exit ${res.exitCode}${res.resetHint ? ` — limit resets ${res.resetHint}` : ''}\n\n\`\`\`\n${tail.slice(-300)}\n\`\`\``,
        priority: 'normal',
        data: { relay_task_id: task.id },
      })
    }
  } catch (e) { console.warn('[interlinked] taskFinished:', e.message) }
}

// ── intents poller (phone verdicts → Relay tasks) ────────────────────────
// Verdict conventions (set by the card's author in card.data):
//   yes         → enqueue data.on_yes (a pre-formed prompt)
//   no          → nothing
//   other       → enqueue a revise-proposal prompt around payload.steer
//   <bespoke>   → enqueue data['on_' + action_id]
// Mirror Relay's upcoming schedule into il_schedule so the phone can render it.
// Full-replace each sync: the list is tiny and Relay is the only writer.
async function syncSchedule(tasks) {
  const rows = (tasks || [])
    .filter(t => t.status === 'scheduled' && t.schedule?.at)
    .map(t => ({
      id: t.id,
      title: t.title,
      at: t.schedule.at,
      every: t.schedule.kind === 'repeat' ? `${t.schedule.n} ${t.schedule.unit}` : null,
      cwd: t.projectPath || null,
      updated_at: new Date().toISOString(),
    }))
  const keep = rows.map(r => `"${r.id}"`).join(',')
  await rest('DELETE', `il_schedule?id=not.in.(${keep || '"none"'})`)
  if (rows.length) {
    await rest('POST', 'il_schedule', rows).catch(async () => {
      // fallback: upsert via merge-duplicates when ids already exist
      await fetch(`${URL_BASE}/rest/v1/il_schedule`, {
        method: 'POST',
        headers: { apikey: key(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      })
    })
  }
}

function startIntentPoller({ addTask, notifyChange, getTasks, intervalMs = 60000 }) {
  if (!key()) { console.log('[interlinked] no key — poller disabled'); return null }
  const CLI = 'node "C:/Users/pmdse/Documents/relay/scripts/interlinked.js"'

  async function tick() {
    try {
      if (getTasks) await syncSchedule(getTasks()).catch(e => console.warn('[interlinked] schedule sync:', e.message))
      const intents = await rest('GET', 'il_intents?handled_at=is.null&order=created_at.asc&limit=10&select=*')
      if (!intents?.length) return
      for (const intent of intents) {
        // Mark handled FIRST — a crash mid-handling must not double-enqueue.
        await rest('PATCH', `il_intents?id=eq.${intent.id}`, { handled_at: new Date().toISOString() })
        const cards = await rest('GET', `il_cards?id=eq.${intent.card_id}&select=*`)
        const card = cards?.[0]
        if (!card) continue

        let prompt = null
        if (intent.action_id === 'no') continue
        else if (intent.action_id === 'other') {
          const steer = (intent.payload?.steer || '').slice(0, 500)
          if (!steer) continue
          prompt = `Patrick answered your Interlinked proposal "${card.title}" with "Something else": "${steer}".\n`
            + `Original proposal body:\n${(card.body_md || '').slice(0, 1500)}\n\n`
            + `Act on the steer. If further consent is needed, post a fresh proposal card via:\n`
            + `${CLI} send --type ${card.type} --title "..." --body "..." --propose --data '{"on_yes":"<prompt to run if Patrick taps Yes>"}'`
        } else {
          prompt = card.data?.['on_' + intent.action_id] || (intent.action_id === 'yes' ? card.data?.on_yes : null)
          if (!prompt && intent.action_id === 'yes') continue // plain ack — nothing to run
          if (!prompt) continue
        }

        addTask({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          title: `📱 ${card.title}`,
          prompt,
          mode: 'fresh',
          sessionPolicy: 'ephemeral', // phone-verdict chores: transcript deleted after success
          sessionId: null,
          projectPath: card.data?.project_path || '',
          model: card.data?.model || null,
          effort: card.data?.effort || null,
          schedule: { kind: 'once', at: new Date(Date.now() + 5000).toISOString() },
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          fromInterlinked: intent.id,
        })
        notifyChange?.()
        console.log(`[interlinked] intent ${intent.action_id} on "${card.title}" → task enqueued`)
      }
    } catch (e) { console.warn('[interlinked] poller:', e.message) }
  }

  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  tick() // immediate first pass
  return timer
}

module.exports = { taskStarted, taskFinished, startIntentPoller }
