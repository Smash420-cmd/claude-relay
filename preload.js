'use strict'
// Secure IPC bridge. The renderer gets exactly this API on window.relay — nothing else.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('relay', {
  list:          () => ipcRenderer.invoke('relay:list'),
  create:        (input) => ipcRenderer.invoke('relay:create', input),
  cancel:        (id) => ipcRenderer.invoke('relay:cancel', id),
  remove:        (id) => ipcRenderer.invoke('relay:delete', id),
  retry:         (id) => ipcRenderer.invoke('relay:retry', id),
  runNow:        (id) => ipcRenderer.invoke('relay:run-now', id),
  resumeAtReset: (id) => ipcRenderer.invoke('relay:resume-at-reset', id),
  getSettings:   () => ipcRenderer.invoke('relay:settings:get'),
  setSettings:   (patch) => ipcRenderer.invoke('relay:settings:set', patch),
  listSessions:  () => ipcRenderer.invoke('relay:sessions:list'),
  getLog:        (logPath) => ipcRenderer.invoke('relay:logs:get', logPath),
  openLogs:      () => ipcRenderer.invoke('relay:logs:open'),
  onChanged:     (cb) => ipcRenderer.on('relay:changed', () => cb()),
})
