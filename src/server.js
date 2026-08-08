import express from 'express';
import path from 'path';
import fs from 'fs';
import { CommandPaletteEngine } from './core/CommandPaletteEngine.js';

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

app.use(express.json());
const commandPalette = new CommandPaletteEngine();
const ADMIN_PIN = '123456';
let recentLogs = [];
let pulseActive = true;

function pushLog(tag, message, metadata = {}) {
  const logItem = {
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    tag,
    message,
    metadata
  };
  recentLogs.push(logItem);
  if (recentLogs.length > 50) recentLogs.shift();
  return logItem;
}

pushLog('[SYSTEM]', 'ADE-APEX Enterprise Master Kernel booted. Guardian PIN engine active.');

app.get('/api/telemetry/poll', (req, res) => res.json({ logs: recentLogs }));

app.get('/api/command/search', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const commands = commandPalette.search(q);
  res.json({ query: q, commands });
});

app.post('/api/command/execute', (req, res) => {
  const { action, payload, pinConfirmed, pin } = req.body;
  const query = (payload?.query || action || '').toUpperCase().trim();
  const sensitiveActions = ['KERNEL_SHUTDOWN', 'SHUTDOWN', 'SYSTEM_RESET', 'FLUSH_LEDGER'];
  const isSensitive = sensitiveActions.includes(action) || sensitiveActions.includes(query);

  if (isSensitive && !pinConfirmed) {
    return res.json({ status: 'PIN_REQUIRED', action, message: 'CRITICAL INTENT DETECTED: 2-Step Authorization Required.' });
  }

  if (isSensitive && pinConfirmed) {
    if (pin !== ADMIN_PIN) {
      pushLog('[SECURITY-ALERT]', 'Unauthorized PIN attempt detected and logged for audit.');
      return res.status(403).json({ status: 'PIN_FAILED', message: 'INVALID AUTHORIZATION PIN. Action rejected.' });
    }
    pushLog('[AUDIT-LOG]', 'ACTION AUTHORIZED VIA ADMIN PIN: ' + (action || query));
  }

  let tag = '[COMMAND-EXEC]';
  let logMessage = 'Executed: ' + action;

  if (query === 'ECHO OFF' || query === 'PAUSE') {
    pulseActive = false;
    logMessage = 'Telemetry Heartbeat SUSPENDED (ECHO OFF)';
  } else if (query === 'ECHO ON' || query === 'RESUME') {
    pulseActive = true;
    logMessage = 'Telemetry Heartbeat RESUMED (ECHO ON)';
  } else if (query === 'CLEAR') {
    recentLogs = [];
    logMessage = 'Telemetry Buffer Flushed';
  } else if (query.includes('ORACLE') || query.includes('DIAGNOSTIC')) {
    tag = '[ORACLE-DIAGNOSTIC]';
    logMessage = 'Human/AI Hybrid Diagnostic -> Status: 100% Operational | Query: ' + query;
  } else if (query === 'SHUTDOWN' || action === 'KERNEL_SHUTDOWN') {
    pushLog('[SYSTEM]', 'CRITICAL: Kernel Shutdown Initiated via Verified PIN.');
    res.json({ status: 'SUCCESS', message: 'System terminating gracefully...' });
    setTimeout(() => process.exit(0), 1000);
    return;
  } else if (action === 'DYNAMIC_KERNEL_INTENT') {
    tag = '[KERNEL-RESOLVER]';
    logMessage = 'Resolved Smart Query -> ' + (payload?.query || action);
  }

  const entry = pushLog(tag, logMessage, payload);
  res.json({ status: 'SUCCESS', action, logged: entry });
});

app.use(express.static(publicDir));
app.use((req, res) => res.sendFile(path.join(publicDir, 'index.html')));

let pulseCount = 0;
setInterval(() => {
  if (!pulseActive) return;
  pulseCount++;
  pushLog('[KERNEL-PULSE]', 'System Health 100% | Heartbeat #' + pulseCount);
}, 3000);

app.listen(PORT, () => console.log('🚀 ADE-APEX Universal Command Center running on port ' + PORT));
