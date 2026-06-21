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
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function barClass(pct) {
  if (pct == null) return 'none'
  if (pct >= 85) return 'high'
  if (pct >= 60) return 'warn'
  return 'ok'
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
  const fillW = pct != null ? pct : (g.used ? Math.min(100, Math.round((g.used / (opts.fallbackMax || g.used)) * 100)) : 0)
  let valTxt
  if (g.used != null && g.limit > 0) valTxt = `${fmtTok(g.used)} / ${fmtTok(g.limit)} <span class="gauge-pct">${pct}%</span>`
  else if (pct != null) valTxt = `<span class="gauge-pct">${pct}%</span>`
  else valTxt = `${fmtTok(g.used || 0)} <span style="color:var(--muted)">load</span>`
  let reset = ''
  if (opts.resetsAt) reset = `<span class="gauge-reset">resets in <b>${fmtCountdown(opts.resetsAt)}</b> · ${new Date(opts.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`
  else if (opts.rolling) reset = `<span class="gauge-reset">rolling ${esc(sub)}</span>`
  const capture = opts.captureSession
    ? `<button class="btn tiny" data-cap-session="${esc(opts.captureSession)}" ${opts.resetsAt ? `data-cap-reset="${esc(new Date(opts.resetsAt).toISOString())}"` : ''}>Resume at reset</button>`
    : ''
  return `<div class="gauge">
    <div class="gauge-head">
      <span class="gauge-label">${esc(label)}<span class="sub">${esc(sub)}</span></span>
      <span class="gauge-val">${valTxt}</span>
    </div>
    <div class="bar"><div class="bar-fill ${barClass(pct)}" style="width:${fillW}%"></div></div>
    <div class="gauge-foot">${reset || '<span></span>'}${capture}</div>
  </div>`
}

async function refreshUsage() {
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
  const canRetry  = t.status === 'failed' || t.status === 'stopped' || t.status === 'cancelled'
  const canResume = t.status === 'stopped' || t.status === 'failed'
  const hasLog    = !!t.lastLogPath
  const exit = (t.lastExitCode != null && t.status !== 'scheduled') ? `exit ${esc(t.lastExitCode)}` : ''
  const reset = t.resetHint ? `reset hint: ${esc(t.resetHint)}` : ''

  return `<div class="task" data-id="${esc(t.id)}">
    <div class="task-main">
      <div class="task-title">
        <span class="pill ${esc(t.status)}">${esc(t.status)}</span>
        ${esc(t.title)}
        <span class="mode-tag">${esc(modeText(t))}</span>
      </div>
      ${t.prompt ? `<div class="task-prompt">${esc(t.prompt)}</div>` : ''}
      <div class="task-meta">
        <span>${esc(scheduleText(t))}</span>
        ${t.projectPath ? `<span><b>cwd</b> ${esc(t.projectPath)}</span>` : ''}
        ${t.sessionId ? `<span><b>session</b> ${esc(String(t.sessionId).slice(0, 8))}…</span>` : ''}
        ${t.lastRunAt ? `<span><b>ran</b> ${esc(fmtWhen(t.lastRunAt))}</span>` : ''}
        ${exit ? `<span>${exit}</span>` : ''}
        ${reset ? `<span>${reset}</span>` : ''}
        ${t.resumeOf ? `<span>↻ resume of ${esc(String(t.resumeOf).slice(0, 6))}</span>` : ''}
      </div>
    </div>
    <div class="task-actions">
      ${canRunNow ? `<button class="btn tiny" data-action="run">Run now</button>` : ''}
      ${canResume ? `<button class="btn tiny" data-action="resume">Resume at reset</button>` : ''}
      ${canRetry ? `<button class="btn tiny" data-action="retry">Re-arm</button>` : ''}
      ${canCancel ? `<button class="btn tiny" data-action="cancel">Cancel</button>` : ''}
      ${hasLog ? `<button class="btn tiny" data-action="log">Log</button>` : ''}
      <button class="btn tiny danger" data-action="delete">Delete</button>
    </div>
  </div>`
}

// ── list actions (delegated) ────────────────────────────────────────────────
listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]')
  if (!btn) return
  const id = btn.closest('.task').dataset.id
  const action = btn.dataset.action
  if (action === 'run') await window.relay.runNow(id)
  else if (action === 'cancel') await window.relay.cancel(id)
  else if (action === 'retry') await window.relay.retry(id)
  else if (action === 'resume') await window.relay.resumeAtReset(id)
  else if (action === 'delete') await window.relay.remove(id)
  else if (action === 'log') {
    const t = TASKS.find(x => x.id === id)
    const text = await window.relay.getLog(t.lastLogPath)
    openLog(t.title, text)
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
        <div class="radio-chip" data-v="resume-compact">Resume (compact)</div>
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
      schedule,
    })
    closeModal()
    await refresh()
  })
}

// ── settings ────────────────────────────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', openSettings)

function openSettings() {
  const s = SETTINGS
  openModal(`
    <h2>Settings</h2>
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
      <label class="toggle"><input type="checkbox" id="s-auto" ${s.autoResumeOnLimit ? 'checked' : ''}/> Auto-resume on limit</label>
      <div class="note">Off by default. Auto-resume depends on reliable limit detection, which is a Phase-0 unknown (DESIGN.md §9). Until verified, use the <b>Resume at reset</b> button on a stopped task — that works today.</div>
    </div>
    <h2 style="font-size:14px;margin:18px 0 10px;color:var(--subtle)">Usage tracker (estimate)</h2>
    <div class="row">
      <div class="field"><label>Session window (h)</label><input type="number" id="s-swin" min="1" value="${esc(s.sessionWindowHours || 5)}" /></div>
      <div class="field"><label>Weekly window (d)</label><input type="number" id="s-wwin" min="1" value="${esc(s.weeklyWindowDays || 7)}" /></div>
    </div>
    <div class="row">
      <div class="field"><label>Session load limit</label><input type="number" id="s-slim" min="0" value="${esc(s.sessionLoadLimit || 0)}" /></div>
      <div class="field"><label>Weekly load limit</label><input type="number" id="s-wlim" min="0" value="${esc(s.weeklyLoadLimit || 0)}" /></div>
    </div>
    <div class="field"><label>Weekly Opus load limit <span style="color:var(--muted);font-weight:400">(0 = hide)</span></label><input type="number" id="s-olim" min="0" value="${esc(s.weeklyOpusLoadLimit || 0)}" /></div>
    <div class="note" style="border-left-color:var(--accent)">"Load" = input + output + cache-creation tokens. The limits are estimates — set them where the bar reads ~100% when you actually hit the wall, and they'll be accurate for you.</div>
    <div class="modal-actions">
      <button class="btn ghost" id="s-open-logs">Open logs folder</button>
      <span style="flex:1"></span>
      <button class="btn ghost" data-close>Close</button>
      <button class="btn primary" id="s-save">Save</button>
    </div>
  `)
  modalEl.querySelector('#s-open-logs').addEventListener('click', () => window.relay.openLogs())
  modalEl.querySelector('#s-save').addEventListener('click', async () => {
    const num = (sel, d) => { const v = parseInt(modalEl.querySelector(sel).value, 10); return isNaN(v) ? d : v }
    await window.relay.setSettings({
      claudeCommand: modalEl.querySelector('#s-cmd').value.trim() || 'claude',
      defaultProjectPath: modalEl.querySelector('#s-proj').value.trim(),
      dailyResetTime: modalEl.querySelector('#s-reset').value || '02:20',
      schedulerIntervalSec: Math.max(5, num('#s-interval', 20)),
      autoResumeOnLimit: modalEl.querySelector('#s-auto').checked,
      sessionWindowHours: Math.max(1, num('#s-swin', 5)),
      weeklyWindowDays: Math.max(1, num('#s-wwin', 7)),
      sessionLoadLimit: Math.max(0, num('#s-slim', 0)),
      weeklyLoadLimit: Math.max(0, num('#s-wlim', 0)),
      weeklyOpusLoadLimit: Math.max(0, num('#s-olim', 0)),
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
refresh()
setInterval(refreshUsage, 30000) // keep the gauges + reset countdowns live
