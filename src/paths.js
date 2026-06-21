'use strict'
// All filesystem locations Relay uses. app.getPath is only valid after app 'ready',
// so these are functions (called lazily from IPC / scheduler), never evaluated at require time.
const path = require('path')
const os = require('os')
const { app } = require('electron')

function dataDir() { return app.getPath('userData') }
function tasksFile() { return path.join(dataDir(), 'relay-data.json') }
function logsDir() { return path.join(dataDir(), 'logs') }

// Claude Code stores each conversation as ~/.claude/projects/<encoded-project>/<session-id>.jsonl
function claudeProjectsDir() { return path.join(os.homedir(), '.claude', 'projects') }

module.exports = { dataDir, tasksFile, logsDir, claudeProjectsDir }
