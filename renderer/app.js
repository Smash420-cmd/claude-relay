'use strict'
/* Relay renderer — vanilla JS talking to the main process over window.relay (preload bridge). */

const listEl = document.getElementById('list')
const modalHost = document.getElementById('modalHost')
const modalEl = document.getElementById('modal')

let TASKS = []
let SETTINGS = {}

// ── helpers ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `today ${t}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${t}`
}
function scheduleText(t) {
  const s = t.schedule || {}
  if (s.kind === 'once') return `once · ${fmtWhen(s.at)}`
  if (s.kind === 'at-next-reset') return `at next reset · ${fmtWhen(s.at)}`
  return s.kind || '—'
}
function modeText(t) {
  if (t.mode === 'fresh') return 'fresh session'
  if (t.mode === 'resume-full') return 'resume (full)'
  if (t.mode === 'resume-compact') return 'resume (compact)'
  return t.mode || '—'
}

function fmtTok(n) {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k'
  return String(n)
}
function fmtCountdown(toMs) {
  const ms = toMs - Date.now()
  if (ms <= 0) return 'now'
  const d = Math.floor(ms / 86400e3)
  const h = Math.floor((ms % 86400e3) / 3600e3)
  const m = Math.floor((ms % 3600e3) / 60000)
  if (d > 0) return `${d}d ${h}h ${m}m`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function barClass(pct) {
  if (pct == null) return 'none'
  if (pct >= 85) return 'high'
  if (pct >= 60) return 'warn'
  return 'ok'
}

// ── model + effort data ───────────────────────────────────────────────────────
const MODELS = [
  { id: '',                          label: 'Default · Sonnet 4.6',  group: null,      effort: ['low','medium','high','max'] },
  { id: 'claude-opus-4-8',           label: 'Opus 4.8',              group: 'Current', effort: ['low','medium','high','xhigh','max'] },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6',            group: 'Current', effort: ['low','medium','high','max'] },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',             group: 'Current', effort: null },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',              group: 'Legacy',  effort: ['low','medium','high','xhigh','max'] },
  { id: 'claude-opus-4-6',           label: 'Opus 4.6',              group: 'Legacy',  effort: ['low','medium','high','max'] },
  { id: 'claude-sonnet-4-5-20250929',label: 'Sonnet 4.5',            group: 'Legacy',  effort: ['low','medium','high','max'] },
]
const EFFORT_LABELS = { low: 'Low — fastest & cheapest', medium: 'Medium', high: 'High (default)', xhigh: 'xHigh — agentic / coding', max: 'Max — highest capability' }

function modelOptsHtml(selectedId) {
  let h = `<option value=""${!selectedId ? ' selected' : ''}>Default · Sonnet 4.6</option>`
  for (const g of ['Current', 'Legacy']) {
    h += `<optgroup label="${g}">`
    for (const m of MODELS.filter(m => m.group === g))
      h += `<option value="${esc(m.id)}"${selectedId === m.id ? ' selected' : ''}>${esc(m.label)}</option>`
    h += '</optgroup>'
  }
  return h
}
function effortOptsHtml(modelId, selectedEffort) {
  const m = MODELS.find(m => m.id === modelId) || MODELS[0]
  if (!m.effort) return '<option value="">N/A</option>'
  let h = `<option value=""${!selectedEffort ? ' selected' : ''}>Default</option>`
  for (const e of ['low','medium','high','xhigh','max']) {
    const avail = m.effort.includes(e)
    h += `<option value="${e}"${selectedEffort === e ? ' selected' : ''}${!avail ? ' disabled' : ''}>${esc(EFFORT_LABELS[e])}</option>`
  }
  return h
}
function syncEffortSelect(effortSel, modelId) {
  const m = MODELS.find(m => m.id === modelId) || MODELS[0]
  effortSel.disabled = !m.effort
  if (!m.effort) { effortSel.value = ''; return }
  const cur = effortSel.value
  effortSel.innerHTML = effortOptsHtml(modelId, cur)
}

// ── usage panel ──────────────────────────────────────────────────────────────
const usageEl = document.getElementById('usage')

function fmtAge(sec) {
  sec = Number(sec) || 0
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}

function gaugeHtml(label, sub, g, opts = {}) {
  const pct = g.pct
  const overPct = Math.max(0, (g.pct || 0) - 100)
  const fillW = Math.min(pct != null ? pct : 0, 100)
  let valTxt
  if (g.used != null && g.limit > 0) valTxt = `${fmtTok(g.used)} / ${fmtTok(g.limit)} <span class="gauge-pct">${pct}%</span>`
  else if (pct != null) valTxt = `<span class="gauge-pct">${pct}%</span>`
  else valTxt = `${fmtTok(g.used || 0)} <span style="color:var(--muted)">load</span>`
  if (overPct > 0) valTxt += ` <span style="color:#9f6ef5">· ${overPct}% extended</span>`
  let reset = ''
  if (opts.resetsAt) reset = `<span class="gauge-reset">resets in <b>${fmtCountdown(opts.resetsAt)}</b> · ${new Date(opts.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`
  else if (opts.rolling) reset = `<span class="gauge-reset">rolling ${esc(sub)}</span>`
  const capture = opts.captureSession
    ? `<button class="btn tiny" data-cap-session="${esc(opts.captureSession)}" ${opts.resetsAt ? `data-cap-reset="${esc(new Date(opts.resetsAt).toISOString())}"` : ''}>Resume at reset</button>`
    : ''
  const barFill = overPct > 0
    ? `<div class="bar-fill ${barClass(pct)}" style="flex:${fillW}"></div><div class="bar-fill over" style="flex:${overPct}"></div>`
    : `<div class="bar-fill ${barClass(pct)}" style="width:${fillW}%"></div>`
  return `<div class="gauge">
    <div class="gauge-head">
      <span class="gauge-label">${esc(label)}<span class="sub">${esc(sub)}</span></span>
      <span class="gauge-val">${valTxt}</span>
    </div>
    <div class="bar">${barFill}</div>
    <div class="gauge-foot">${reset || '<span></span>'}${capture}</div>
  </div>`
}

async function refreshUsage() {
  // Try the authoritative Claude API first (exact server-side numbers).
  // Fall back to the statusLine snapshot if not logged in or the call fails.
  const api = await window.relay.claudeUsage().catch(() => null)

  if (api && !api.error) {
    let html = `<div class="usage-grid">`
    html += gaugeHtml('Session', '5h window', { pct: api.sessionPct }, { resetsAt: api.sessionResetsAt })
    html += gaugeHtml('Weekly', '7d', { pct: api.weeklyPct }, { resetsAt: api.weeklyResetsAt, rolling: !api.weeklyResetsAt })
    html += `</div>`
    html += `<div class="usage-cap"><span style="color:var(--green)">● Live</span> from Claude.ai · exact server-side usage · <button class="btn tiny" id="claude-logout-btn">Log out</button></div>`
    usageEl.innerHTML = html
    document.getElementById('claude-logout-btn').addEventListener('click', async () => {
      await window.relay.claudeLogout()
      refreshUsage()
    })
    return
  }

  if (api && api.error === 'not_logged_in') {
    usageEl.innerHTML = `<div class="usage-cap">
      <span style="color:var(--amber)">⚠ Not connected to Claude</span> —
      <button class="btn tiny" id="claude-login-btn">Log in to Claude</button>
      to show exact usage. Tasks still run — only the usage bars are affected.
    </div>`
    document.getElementById('claude-login-btn').addEventListener('click', async () => {
      await window.relay.claudeLogin()
      setTimeout(refreshUsage, 3000)
    })
    return
  }

  // Fallback: statusLine snapshot
  let snap
  try { snap = await window.relay.usage() } catch { snap = null }
  if (!snap || snap.error) { usageEl.innerHTML = snap && snap.error ? `<div class="usage-err">usage: ${esc(snap.error)}</div>` : ''; return }
  const s = snap.session, w = snap.weekly, o = snap.weeklyOpus
  const live = snap.source === 'live'
  let html = `<div class="usage-grid">`
  html += gaugeHtml('Session', `${s.windowHours}h window`, s, {
    resetsAt: s.active ? s.resetsAt : null,
    rolling: !s.resetsAt,
    captureSession: s.active && s.sessionId ? s.sessionId : null,
  })
  html += gaugeHtml('Weekly', `${w.windowDays}d`, w, { resetsAt: w.resetsAt || null, rolling: !w.resetsAt })
  if (o && o.pct != null && o.limit > 0) html += gaugeHtml('Weekly · Opus', '7d', o, { rolling: true })
  html += `</div>`
  if (live) {
    html += `<div class="usage-cap"><span style="color:var(--green)">● Live</span> from Claude Code statusLine · updated ${fmtAge(snap.ageSec)} ago</div>`
  } else {
    const ll = snap.lastLive ? ` · last live: 5h ${snap.lastLive.session}% / 7d ${snap.lastLive.weekly}% (${fmtAge(snap.lastLive.ageSec)} ago)` : ''
    html += `<div class="usage-cap">Estimate (transcript) — set up the statusLine bridge for live %. Limits calibratable in Settings.${esc(ll)}</div>`
  }
  usageEl.innerHTML = html
}

usageEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-cap-session]')
  if (!btn) return
  await window.relay.captureSession({
    sessionId: btn.dataset.capSession,
    resetsAt: btn.dataset.capReset || null,
    prompt: 'continue',
  })
  await refresh()
})

// ── data ──────────────────────────────────────────────────────────────────
async function refresh() {
  TASKS = await window.relay.list()
  SETTINGS = await window.relay.getSettings()
  render()
  refreshUsage()
}

// ── render ──────────────────────────────────────────────────────────────────
function render() {
  if (!TASKS.length) {
    listEl.innerHTML = `<div class="empty">
      <h2>No tasks yet</h2>
      <p>Queue a prompt to fire into a Claude Code session — at a set time, or at your next limit reset.</p>
    </div>`
    return
  }
  listEl.innerHTML = TASKS.map(taskRow).join('')
}

function taskRow(t) {
  const canRunNow = t.status !== 'running'
  const canCancel = t.status === 'scheduled' || t.status === 'running'
  const canRetry  = t.status === 'failed' || t.status === 'stopped' || t.status === 'cancelled' || t.status === 'interrupted'
  const canResume = t.status === 'stopped' || t.status === 'failed' || t.status === 'interrupted'
  const hasLog    = !!t.lastLogPath

  const overdue = t.status === 'scheduled' && t.schedule && t.schedule.at && new Date(t.schedule.at) < new Date()

  // Human-readable single meta line: mode · folder · ran time · exit
  const folder = t.projectPath ? t.projectPath.replace(/\\/g, '/').split('/').pop() : ''
  const ranAt  = t.status === 'scheduled' ? scheduleText(t) : (t.lastRunAt ? `ran ${fmtWhen(t.lastRunAt)}` : scheduleText(t))
  const exit   = (t.lastExitCode != null && t.status !== 'scheduled') ? `exit ${t.lastExitCode}` : ''
  const extras = [modeText(t), folder, ranAt, exit, t.resetHint ? `resets ${esc(t.resetHint)}` : ''].filter(Boolean).join(' · ')

  return `<div class="task" data-id="${esc(t.id)}">
    <div class="task-main">
      <div class="task-title">
        <span class="pill ${overdue ? 'overdue' : esc(t.status)}">${overdue ? '⏸ waiting' : esc(t.status)}</span>
        <span class="title-text">${esc(t.title)}</span>
        ${t.prompt ? `<span class="task-expand">▶</span>` : ''}
      </div>
      <div class="task-meta">${esc(extras)}</div>
      ${t.prompt ? `<div class="task-body">
        <div class="task-prompt">${esc(t.prompt)}</div>
        <div class="task-info">
          <div><b>Mode</b>${esc(modeText(t))}</div>
          <div><b>Model</b>${esc(t.model ? (MODELS.find(m => m.id === t.model) || {label: t.model}).label : 'Default')}</div>
          <div><b>Effort</b>${esc(t.effort || 'Default')}</div>
        </div>
      </div>` : ''}
    </div>
    <div class="task-actions">
      ${canRunNow ? `<button class="btn tiny" data-action="run">Run now</button>` : ''}
      ${canResume ? `<button class="btn tiny" data-action="resume">Resume at reset</button>` : ''}
      ${canRetry ? `<button class="btn tiny" data-action="retry">Re-arm</button>` : ''}
      ${canCancel ? `<button class="btn tiny" data-action="cancel">Cancel</button>` : ''}
      ${hasLog ? `<button class="btn tiny" data-action="log">Log</button>` : ''}
      <button class="btn tiny" data-action="edit">Edit</button>
      <button class="btn tiny danger" data-action="delete">Delete</button>
    </div>
  </div>`
}

// ── list actions (delegated) ────────────────────────────────────────────────
listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]')
  if (!btn) {
    const card = e.target.closest('.task')
    if (card && e.target.closest('.task-main')) card.classList.toggle('expanded')
    return
  }
  const id = btn.closest('.task').dataset.id
  const action = btn.dataset.action
  const t = TASKS.find(x => x.id === id)
  if (action === 'edit') { if (t) openEditTask(t); return }
  if (action === 'retry')       await window.relay.retry(id)
  else if (action === 'run')    await window.relay.runNow(id)
  else if (action === 'cancel') await window.relay.cancel(id)
  else if (action === 'resume') await window.relay.resumeAtReset(id)
  else if (action === 'delete') await window.relay.remove(id)
  else if (action === 'log') {
    if (t) { const text = await window.relay.getLog(t.lastLogPath); openLog(t.title, text) }
  }
  await refresh()
})

document.addEventListener('contextmenu', (e) => {
  window.__ctxTaskId = e.target.closest('[data-id]')?.dataset.id ?? null
})

window.relay.onCtxAction(async (id, action) => {
  const t = TASKS.find(x => x.id === id)
  if (action === 'edit') { if (t) openEditTask(t); return }
  if (action === 'retry')       await window.relay.retry(id)
  else if (action === 'run')    await window.relay.runNow(id)
  else if (action === 'cancel') await window.relay.cancel(id)
  else if (action === 'resume') await window.relay.resumeAtReset(id)
  else if (action === 'delete') await window.relay.remove(id)
  else if (action === 'log') {
    if (t) { const text = await window.relay.getLog(t.lastLogPath); openLog(t.title, text) }
    return
  }
  await refresh()
})

// ── modal plumbing ──────────────────────────────────────────────────────────
function openModal(html) { modalEl.innerHTML = html; modalHost.hidden = false }
function closeModal() { modalHost.hidden = true; modalEl.innerHTML = '' }
modalHost.addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalHost.hidden) closeModal() })

// ── new task ────────────────────────────────────────────────────────────────
document.getElementById('newBtn').addEventListener('click', openNewTask)

async function openNewTask() {
  const sessions = await window.relay.listSessions()
  let mode = 'fresh'
  let scheduleKind = 'at-next-reset'
  let pickedSession = null
  let taskModel = SETTINGS.defaultModel || ''
  let taskEffort = SETTINGS.defaultEffort || ''

  openModal(`
    <h2>New task</h2>
    <div class="field">
      <label>Title <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <input type="text" id="f-title" placeholder="e.g. Continue the bench run" />
    </div>
    <div class="field">
      <label>Prompt</label>
      <textarea id="f-prompt" placeholder="What should Claude Code do when this fires? (e.g. resume bench run X from bench/state/X.json)"></textarea>
    </div>
    <div class="field">
      <label>Mode</label>
      <div class="radio-row" id="f-mode">
        <div class="radio-chip on" data-v="fresh">Fresh session</div>
        <div class="radio-chip" data-v="resume-full">Resume (full)</div>
      </div>
      <div class="hint">Fresh = any session, reads state from disk (cheapest). Resume = a specific conversation.</div>
    </div>
    <div class="field" id="f-session-wrap" hidden>
      <label>Session to resume</label>
      <div class="session-list" id="f-sessions">
        ${sessions.length ? sessions.map(s => `
          <div class="session-item${s.active ? ' active' : ''}" data-sid="${esc(s.sessionId)}">
            <div class="si-title">${s.active ? '<span class="si-live">● live</span>' : ''}${esc(s.preview || '(no preview)')}</div>
            <div class="sid">${esc(s.slug || s.sessionId.slice(0, 8))} · ${esc(s.project)} · ${esc(fmtWhen(new Date(s.modified).toISOString()))}</div>
          </div>`).join('')
          : `<div class="session-item">No Claude Code sessions found in ~/.claude/projects</div>`}
      </div>
    </div>
    <div class="field">
      <label>Project path <span style="color:var(--muted);font-weight:400">(cwd — optional)</span></label>
      <input type="text" id="f-project" placeholder="${esc(SETTINGS.defaultProjectPath || 'e.g. C:\\\\Users\\\\you\\\\project')}" />
    </div>
    <div class="row">
      <div class="field">
        <label>Model</label>
        <select id="f-model">${modelOptsHtml(taskModel)}</select>
      </div>
      <div class="field">
        <label>Effort</label>
        <select id="f-effort" ${!(MODELS.find(m=>m.id===taskModel)||MODELS[0]).effort ? 'disabled' : ''}>${effortOptsHtml(taskModel, taskEffort)}</select>
      </div>
    </div>
    <div class="field">
      <label>When</label>
      <div class="radio-row" id="f-sched">
        <div class="radio-chip on" data-v="at-next-reset">At next reset (${esc(SETTINGS.dailyResetTime || '02:20')})</div>
        <div class="radio-chip" data-v="once">At a specific time</div>
      </div>
      <div id="f-once-wrap" hidden style="margin-top:10px">
        <input type="datetime-local" id="f-once" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="f-create">Queue task</button>
    </div>
  `)

  const sessionWrap = modalEl.querySelector('#f-session-wrap')
  const onceWrap = modalEl.querySelector('#f-once-wrap')

  modalEl.querySelector('#f-mode').addEventListener('click', (e) => {
    const chip = e.target.closest('.radio-chip'); if (!chip) return
    mode = chip.dataset.v
    modalEl.querySelectorAll('#f-mode .radio-chip').forEach(c => c.classList.toggle('on', c === chip))
    sessionWrap.hidden = (mode === 'fresh')
  })
  modalEl.querySelector('#f-sessions')?.addEventListener('click', (e) => {
    const item = e.target.closest('.session-item[data-sid]'); if (!item) return
    pickedSession = item.dataset.sid
    modalEl.querySelectorAll('.session-item').forEach(s => s.classList.toggle('on', s === item))
  })
  modalEl.querySelector('#f-model').addEventListener('change', (e) => {
    taskModel = e.target.value
    syncEffortSelect(modalEl.querySelector('#f-effort'), taskModel)
  })
  modalEl.querySelector('#f-effort').addEventListener('change', (e) => { taskEffort = e.target.value })
  modalEl.querySelector('#f-sched').addEventListener('click', (e) => {
    const chip = e.target.closest('.radio-chip'); if (!chip) return
    scheduleKind = chip.dataset.v
    modalEl.querySelectorAll('#f-sched .radio-chip').forEach(c => c.classList.toggle('on', c === chip))
    onceWrap.hidden = (scheduleKind !== 'once')
  })

  modalEl.querySelector('#f-create').addEventListener('click', async () => {
    const prompt = modalEl.querySelector('#f-prompt').value.trim()
    if (!prompt) { modalEl.querySelector('#f-prompt').focus(); return }
    if (mode !== 'fresh' && !pickedSession) { alert('Pick a session to resume, or choose Fresh mode.'); return }
    let schedule
    if (scheduleKind === 'once') {
      const v = modalEl.querySelector('#f-once').value
      if (!v) { alert('Pick a date/time.'); return }
      schedule = { kind: 'once', at: new Date(v).toISOString() }
    } else {
      schedule = { kind: 'at-next-reset' }
    }
    await window.relay.create({
      title: modalEl.querySelector('#f-title').value.trim(),
      prompt,
      mode,
      sessionId: mode === 'fresh' ? null : pickedSession,
      projectPath: modalEl.querySelector('#f-project').value.trim(),
      model: taskModel || null,
      effort: modalEl.querySelector('#f-effort').value || null,
      schedule,
    })
    closeModal()
    await refresh()
  })
}

// ── edit task ───────────────────────────────────────────────────────────────
async function openEditTask(task) {
  const sessions = await window.relay.listSessions()
  let mode = task.mode || 'fresh'
  let scheduleKind = task.schedule?.kind || 'at-next-reset'
  let pickedSession = task.sessionId || null
  let taskModel = task.model || ''
  let taskEffort = task.effort || ''

  const localAt = (scheduleKind === 'once' && task.schedule?.at)
    ? new Date(new Date(task.schedule.at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : ''

  openModal(`
    <h2>Edit task</h2>
    <div class="field">
      <label>Title <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <input type="text" id="f-title" value="${esc(task.title || '')}" />
    </div>
    <div class="field">
      <label>Prompt</label>
      <textarea id="f-prompt">${esc(task.prompt || '')}</textarea>
    </div>
    <div class="field">
      <label>Mode</label>
      <div class="radio-row" id="f-mode">
        <div class="radio-chip${mode === 'fresh' ? ' on' : ''}" data-v="fresh">Fresh session</div>
        <div class="radio-chip${mode === 'resume-full' ? ' on' : ''}" data-v="resume-full">Resume (full)</div>
      </div>
    </div>
    <div class="field" id="f-session-wrap"${mode === 'fresh' ? ' hidden' : ''}>
      <label>Session to resume</label>
      <div class="session-list" id="f-sessions">
        ${sessions.length ? sessions.map(s => `
          <div class="session-item${s.active ? ' active' : ''}${s.sessionId === pickedSession ? ' on' : ''}" data-sid="${esc(s.sessionId)}">
            <div class="si-title">${s.active ? '<span class="si-live">● live</span>' : ''}${esc(s.preview || '(no preview)')}</div>
            <div class="sid">${esc(s.slug || s.sessionId.slice(0, 8))} · ${esc(s.project)} · ${esc(fmtWhen(new Date(s.modified).toISOString()))}</div>
          </div>`).join('')
          : `<div class="session-item">No sessions found</div>`}
      </div>
    </div>
    <div class="field">
      <label>Project path <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <input type="text" id="f-project" value="${esc(task.projectPath || '')}" placeholder="${esc(SETTINGS.defaultProjectPath || '')}" />
    </div>
    <div class="row">
      <div class="field">
        <label>Model</label>
        <select id="f-model">${modelOptsHtml(taskModel)}</select>
      </div>
      <div class="field">
        <label>Effort</label>
        <select id="f-effort" ${!(MODELS.find(m=>m.id===taskModel)||MODELS[0]).effort ? 'disabled' : ''}>${effortOptsHtml(taskModel, taskEffort)}</select>
      </div>
    </div>
    <div class="field">
      <label>When</label>
      <div class="radio-row" id="f-sched">
        <div class="radio-chip${scheduleKind === 'at-next-reset' ? ' on' : ''}" data-v="at-next-reset">At next reset (${esc(SETTINGS.dailyResetTime || '02:20')})</div>
        <div class="radio-chip${scheduleKind === 'once' ? ' on' : ''}" data-v="once">At a specific time</div>
      </div>
      <div id="f-once-wrap"${scheduleKind !== 'once' ? ' hidden' : ''} style="margin-top:10px">
        <input type="datetime-local" id="f-once" value="${esc(localAt)}" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="f-save">Save changes</button>
    </div>
  `)

  const sessionWrap = modalEl.querySelector('#f-session-wrap')
  const onceWrap = modalEl.querySelector('#f-once-wrap')

  modalEl.querySelector('#f-mode').addEventListener('click', (e) => {
    const chip = e.target.closest('.radio-chip'); if (!chip) return
    mode = chip.dataset.v
    modalEl.querySelectorAll('#f-mode .radio-chip').forEach(c => c.classList.toggle('on', c === chip))
    sessionWrap.hidden = (mode === 'fresh')
  })
  modalEl.querySelector('#f-sessions')?.addEventListener('click', (e) => {
    const item = e.target.closest('.session-item[data-sid]'); if (!item) return
    pickedSession = item.dataset.sid
    modalEl.querySelectorAll('.session-item').forEach(s => s.classList.toggle('on', s === item))
  })
  modalEl.querySelector('#f-model').addEventListener('change', (e) => {
    taskModel = e.target.value
    syncEffortSelect(modalEl.querySelector('#f-effort'), taskModel)
  })
  modalEl.querySelector('#f-effort').addEventListener('change', (e) => { taskEffort = e.target.value })
  modalEl.querySelector('#f-sched').addEventListener('click', (e) => {
    const chip = e.target.closest('.radio-chip'); if (!chip) return
    scheduleKind = chip.dataset.v
    modalEl.querySelectorAll('#f-sched .radio-chip').forEach(c => c.classList.toggle('on', c === chip))
    onceWrap.hidden = (scheduleKind !== 'once')
  })
  modalEl.querySelector('#f-save').addEventListener('click', async () => {
    const prompt = modalEl.querySelector('#f-prompt').value.trim()
    if (!prompt) { modalEl.querySelector('#f-prompt').focus(); return }
    let schedule
    if (scheduleKind === 'once') {
      const v = modalEl.querySelector('#f-once').value
      if (!v) { alert('Pick a date/time.'); return }
      schedule = { kind: 'once', at: new Date(v).toISOString() }
    } else {
      schedule = { kind: 'at-next-reset' }
    }
    await window.relay.update(task.id, {
      title: modalEl.querySelector('#f-title').value.trim(),
      prompt,
      mode,
      sessionId: mode === 'fresh' ? null : pickedSession,
      projectPath: modalEl.querySelector('#f-project').value.trim(),
      model: taskModel || null,
      effort: modalEl.querySelector('#f-effort').value || null,
      schedule,
      status: 'scheduled',
    })
    closeModal()
    await refresh()
  })
}


// ── welcome screen ───────────────────────────────────────────────────────────
let welcomePoller = null

async function openWelcome() {
  const scriptPath = await window.relay.statuslinePath().catch(() => '')
  const statusLineSnippet = `"statusLine": { "type": "command", "command": "node \\"${scriptPath}\\"" }`
  const api = await window.relay.claudeUsage().catch(() => null)
  const loggedIn = api && !api.error

  openModal(`
    <h2 style="margin-bottom:6px">Welcome to Claude Relay</h2>
    <p style="color:var(--subtle);margin:0 0 18px">Quick setup — takes about a minute.</p>

    <div class="field">
      <label>1 · Log in to Claude</label>
      <div id="welcome-login-state">
        ${loggedIn
          ? `<div style="color:var(--green);font-weight:600;padding:4px 0">✓ Logged in</div>`
          : `<button class="btn primary" id="welcome-login-btn">Log in to Claude</button>`}
      </div>
      <div class="hint">Lets Claude Relay read your exact session and weekly usage from Claude.ai.</div>
    </div>

    <div class="field">
      <label>2 · Enable live usage tracking <span style="color:var(--muted);font-weight:400">(recommended)</span></label>
      <div class="hint" style="margin-bottom:6px">Add this to <code>~/.claude/settings.json</code> — one-time setup, works for every Claude Code session on this machine:</div>
      <div style="display:flex;gap:6px;align-items:flex-start">
        <code id="welcome-snippet" style="flex:1;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:11px;word-break:break-all;display:block;line-height:1.5">${esc(statusLineSnippet)}</code>
        <button class="btn tiny" id="welcome-copy-btn" style="flex-shrink:0;margin-top:2px">Copy</button>
      </div>
    </div>

    <div class="field">
      <label>3 · Disable Extended usage in Claude.ai</label>
      <div class="hint">In your Claude.ai account settings, turn off <b>Extended usage</b> — otherwise Claude will spend credits past the free limit even while Claude Relay is paused waiting for a reset.</div>
    </div>

    <div class="field">
      <label>4 · Set up the <code>/relay</code> skill <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <div class="hint" style="margin-bottom:8px">Adds <code>relay</code> to your PATH and installs a Claude Code skill so you can type <code>/relay do X at 4pm</code> to schedule tasks without opening this app. No admin password needed.</div>
      <button class="btn" id="welcome-skill-btn">Set up /relay skill</button>
      <div id="welcome-skill-status" style="margin-top:6px;font-size:12px"></div>
    </div>

    <div class="modal-actions">
      <button class="btn ghost" id="welcome-skip-btn">Skip for now</button>
      <button class="btn primary" id="welcome-done-btn">All done</button>
    </div>
  `)

  const loginBtn = document.getElementById('welcome-login-btn')
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      await window.relay.claudeLogin()
      startWelcomePoller()
    })
  }

  document.getElementById('welcome-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(statusLineSnippet).catch(() => {})
    const btn = document.getElementById('welcome-copy-btn')
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { if (btn) btn.textContent = 'Copy' }, 2000) }
  })

  document.getElementById('welcome-skill-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('welcome-skill-status')
    statusEl.style.color = 'var(--subtle)'
    statusEl.textContent = 'Installing…'
    const res = await window.relay.setupSkill()
    if (res.ok) {
      statusEl.style.color = 'var(--green)'
      statusEl.textContent = '✓ Done — open a new terminal and try /relay in Claude Code'
    } else {
      statusEl.style.color = 'var(--red)'
      statusEl.textContent = `✗ ${res.error}`
    }
  })
  document.getElementById('welcome-done-btn').addEventListener('click', dismissWelcome)
  document.getElementById('welcome-skip-btn').addEventListener('click', dismissWelcome)

  if (!loggedIn) startWelcomePoller()
}

function startWelcomePoller() {
  if (welcomePoller) return
  welcomePoller = setInterval(async () => {
    if (modalHost.hidden) { clearInterval(welcomePoller); welcomePoller = null; return }
    const api = await window.relay.claudeUsage().catch(() => null)
    if (api && !api.error) {
      clearInterval(welcomePoller)
      welcomePoller = null
      const state = document.getElementById('welcome-login-state')
      if (state) state.innerHTML = `<div style="color:var(--green);font-weight:600;padding:4px 0">✓ Logged in</div>`
      setTimeout(dismissWelcome, 1200)
    }
  }, 2000)
}

function dismissWelcome() {
  if (welcomePoller) { clearInterval(welcomePoller); welcomePoller = null }
  window.relay.setSettings({ hasSeenWelcome: true })
  closeModal()
  refresh()
}

// ── settings ────────────────────────────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', openSettings)

async function openSettings() {
  const s = SETTINGS
  const launchAtLogin = await window.relay.getLoginItem().catch(() => false)
  openModal(`
    <h2>Settings <span id="s-version" style="font-size:12px;font-weight:400;color:var(--muted)"></span></h2>
    <div class="row">
      <div class="field">
        <label>Default model</label>
        <select id="s-model">${modelOptsHtml(s.defaultModel || '')}</select>
      </div>
      <div class="field">
        <label>Default effort</label>
        <select id="s-effort">${effortOptsHtml(s.defaultModel || '', s.defaultEffort || '')}</select>
        <div class="hint">Tasks can override both per-task. Effort is disabled for Haiku.</div>
      </div>
    </div>
    <div class="field">
      <label>Claude CLI command</label>
      <input type="text" id="s-cmd" value="${esc(s.claudeCommand || 'claude')}" />
      <div class="hint">The binary Relay spawns. Use a full path if <code>claude</code> isn't on PATH.</div>
    </div>
    <div class="field">
      <label>Default project path (cwd)</label>
      <input type="text" id="s-proj" value="${esc(s.defaultProjectPath || '')}" placeholder="optional" />
    </div>
    <div class="row">
      <div class="field">
        <label>Daily reset time</label>
        <input type="time" id="s-reset" value="${esc(s.dailyResetTime || '02:20')}" />
        <div class="hint">Drives "at next reset".</div>
      </div>
      <div class="field">
        <label>Scheduler interval (s)</label>
        <input type="number" id="s-interval" min="5" value="${esc(s.schedulerIntervalSec || 20)}" />
      </div>
    </div>
    <div class="field">
      <label class="toggle"><input type="checkbox" id="s-auto" ${s.autoResumeOnLimit ? 'checked' : ''}/> Auto-resume when limit is hit</label>
      <div class="note">When a running task is stopped by a session or weekly usage limit, Relay automatically re-schedules it to resume at the exact moment that limit resets — no action needed.</div>
    </div>
    <div class="field">
      <label class="toggle"><input type="checkbox" id="s-ext" ${s.allowExtendedUsage ? 'checked' : ''}/> Allow extended (paid) usage</label>
      <div class="note">ON: tasks run past your free limit and may spend credits. OFF: Relay pauses auto-runs at the threshold below and waits for the reset.</div>
      <div class="note" style="border-left-color:#e3b341;margin-top:6px">⚠ For this to prevent credit spending you must also disable <b>Extended usage</b> in your Claude.ai account settings — Relay cannot enforce this on its own.</div>
    </div>
    <div class="field"><label>Pause auto-runs at session % <span style="color:var(--muted);font-weight:400">(when extended usage is off)</span></label><input type="number" id="s-pause" min="1" max="100" value="${esc(s.pauseAtPct || 100)}" /></div>
    <div class="field">
      <label class="toggle"><input type="checkbox" id="s-skip" ${s.skipPermissions !== false ? 'checked' : ''}/> Autonomous execution (skip permission prompts)</label>
      <div class="note" style="border-left-color:var(--red)">ON: tasks run with <b>--dangerously-skip-permissions</b> — they can edit/run/<b>commit</b> unattended, with no approval gate. This is what makes tasks complete seamlessly. They run in the task's cwd and commit to git (reviewable/revertible), but only queue prompts you trust.</div>
    </div>
    <div class="field">
      <label class="toggle"><input type="checkbox" id="s-launch" ${launchAtLogin ? 'checked' : ''}/> Launch at login</label>
      <div class="hint">Start Relay automatically when you log in to Windows so the scheduler is always running and scheduled tasks never miss.</div>
    </div>
    <div class="field">
      <label>Claude Code integration</label>
      <div class="hint" style="margin-bottom:8px">Install the <code>/relay</code> skill so you can type <code>/relay do X at 4pm</code> in any Claude Code session to schedule tasks without opening this app.</div>
      <button class="btn" id="s-setup-skill">Set up /relay skill</button>
      <div id="s-skill-status" style="margin-top:6px;font-size:12px"></div>
    </div>
    <details style="margin-top:18px;border:1px solid var(--border);border-radius:8px;padding:10px 13px">
      <summary style="cursor:pointer;font-weight:650;font-size:13px;color:var(--subtle)">Security &amp; privacy</summary>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;font-size:12.5px;color:var(--subtle)">
        <div><b style="color:var(--text)">What does "skip permissions" mean?</b><br>
        Tasks run with <code>--dangerously-skip-permissions</code> — Claude Code can edit files, run commands, and commit code with no approval gate. Only queue prompts you trust. You can turn this off in Settings if you want to supervise each run.</div>
        <div><b style="color:var(--text)">Can other people on my machine see my tasks?</b><br>
        Yes. Tasks and settings are stored in a plain JSON file in the app's data folder. Anyone with access to your machine can read or modify them. Treat your machine access accordingly.</div>
        <div><b style="color:var(--text)">Why does Claude Relay access my Claude.ai session?</b><br>
        To read your exact usage % and reset times directly from Claude.ai. This data is only sent back to Claude.ai — never stored or shared elsewhere.</div>
        <div><b style="color:var(--text)">Does Claude Relay send my prompts anywhere?</b><br>
        No. Prompts go directly to the Claude Code CLI on your machine. Claude Relay is a local scheduler only — no cloud component, no telemetry.</div>
      </div>
    </details>
    <div class="modal-actions">
      <button class="btn ghost" id="s-open-logs">Open logs folder</button>
      <span style="flex:1"></span>
      <button class="btn ghost" data-close>Close</button>
      <button class="btn primary" id="s-save">Save</button>
    </div>
  `)
  window.relay.version().then(v => { const el = document.getElementById('s-version'); if (el) el.textContent = `v${v}` })
  modalEl.querySelector('#s-open-logs').addEventListener('click', () => window.relay.openLogs())
  modalEl.querySelector('#s-setup-skill').addEventListener('click', async () => {
    const statusEl = document.getElementById('s-skill-status')
    statusEl.style.color = 'var(--subtle)'
    statusEl.textContent = 'Installing…'
    const res = await window.relay.setupSkill()
    if (res.ok) {
      statusEl.style.color = 'var(--green)'
      statusEl.textContent = '✓ /relay skill installed — open a new terminal and try it in Claude Code'
    } else {
      statusEl.style.color = 'var(--red)'
      statusEl.textContent = `✗ ${res.error}`
    }
  })
  modalEl.querySelector('#s-model').addEventListener('change', (e) => {
    syncEffortSelect(modalEl.querySelector('#s-effort'), e.target.value)
  })
  modalEl.querySelector('#s-save').addEventListener('click', async () => {
    const num = (sel, d) => { const v = parseInt(modalEl.querySelector(sel).value, 10); return isNaN(v) ? d : v }
    await window.relay.setLoginItem(modalEl.querySelector('#s-launch').checked)
    await window.relay.setSettings({
      defaultModel: modalEl.querySelector('#s-model').value,
      defaultEffort: modalEl.querySelector('#s-effort').value,
      claudeCommand: modalEl.querySelector('#s-cmd').value.trim() || 'claude',
      defaultProjectPath: modalEl.querySelector('#s-proj').value.trim(),
      dailyResetTime: modalEl.querySelector('#s-reset').value || '02:20',
      schedulerIntervalSec: Math.max(5, num('#s-interval', 20)),
      autoResumeOnLimit: modalEl.querySelector('#s-auto').checked,
      allowExtendedUsage: modalEl.querySelector('#s-ext').checked,
      pauseAtPct: Math.min(100, Math.max(1, num('#s-pause', 100))),
      skipPermissions: modalEl.querySelector('#s-skip').checked,
    })
    closeModal()
    await refresh()
  })
}

// ── log viewer ────────────────────────────────────────────────────────────────
function openLog(title, text) {
  openModal(`
    <h2>Log — ${esc(title)}</h2>
    <div class="log-view">${esc(text)}</div>
    <div class="modal-actions"><button class="btn primary" data-close>Close</button></div>
  `)
}

// ── boot ──────────────────────────────────────────────────────────────────
window.relay.onChanged(() => refresh())
window.relay.version().then(v => { document.getElementById('appVersion').textContent = `v${v}` })
window.relay.onUpdateAvailable((version) => {
  const pill = document.getElementById('updatePill')
  pill.textContent = `↓ v${version} downloading…`
  pill.hidden = false
  pill.disabled = true
})
window.relay.onUpdateReady(() => {
  const pill = document.getElementById('updatePill')
  pill.textContent = '↑ Update ready — click to restart'
  pill.hidden = false
  pill.disabled = false
})
document.getElementById('updatePill').addEventListener('click', () => window.relay.installUpdate())
refresh().then(() => { if (!SETTINGS.hasSeenWelcome) openWelcome() })
setInterval(refreshUsage, 5000) // keep the gauges + reset countdowns live
