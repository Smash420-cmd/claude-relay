// Effort policy (Patrick, 2026-09-26): every Opus and Fable model is capped at high — xhigh/max
// burn the premium allowance. Opus 5.5 also defaults to medium when effort is unset. Enforced
// in the executor so no path — UI, CLI, /relay skill, tasks stored before the cap — can get around it.
// Lives in scripts/ (unpacked from the asar) with no Electron imports, so the installed relay.js CLI
// can load it under plain node.
// ponytail: name-pattern match, so future opus/fable ids are capped without a list update.
const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
function effortPolicy(model) {
  if (model === 'claude-opus-5-5') return { def: 'medium', max: 'high' }
  if (/opus|fable/i.test(model || '')) return { def: null, max: 'high' }
  return null
}

module.exports = { EFFORT_ORDER, effortPolicy }
