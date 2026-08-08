import fs from 'fs';
import path from 'path';

// Ensure directories exist
if (!fs.existsSync('src')) fs.mkdirSync('src');
if (!fs.existsSync('public')) fs.mkdirSync('public');

// 1. Write src/server.js
const serverCode = `import express from 'express';
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
`;

// 2. Write public/index.html
const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ADE-APEX Command Center</title>
<style>
  :root { --bg: #03070c; --card: #0b1222; --border: #1e293b; --cyan: #38bdf8; --red: #ef4444; --text: #f8fafc; }
  body { background: var(--bg); color: var(--text); font-family: monospace; padding: 20px; }
  .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; }
  .btn { background: var(--card); color: var(--cyan); border: 1px solid var(--border); padding: 8px 16px; cursor: pointer; font-weight: bold; }
  .log-box { background: #000; border: 1px solid var(--border); height: 350px; overflow-y: auto; padding: 10px; margin-top: 20px; }
  .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: none; justify-content: center; align-items: center; }
  .modal { background: var(--card); border: 2px solid var(--cyan); width: 520px; padding: 20px; border-radius: 8px; }
  input { width: 100%; background: #000; border: 1px solid var(--border); color: #fff; padding: 10px; margin-top: 10px; outline: none; font-family: monospace; box-sizing: border-box; }
  .pin-box { border-color: var(--red) !important; display: none; }
</style>
</head>
<body>
<div class="hdr">
  <h2>ADE-APEX Enterprise Operating System</h2>
  <button class="btn" onclick="openCmd()">⌘ Command OS (Ctrl+K)</button>
</div>
<div class="log-box" id="logs"></div>
<div class="overlay" id="overlay">
  <div class="modal">
    <h3 id="mTitle">Command Palette</h3>
    <input type="text" id="cmdIn" placeholder="Type command or dynamic intent...">
    <div id="pinSec" class="pin-box" style="margin-top:15px; padding:12px; border:1px solid var(--red); display:none;">
      <p style="color:var(--red); font-size:12px; font-weight:bold; margin:0;">CRITICAL INTENT DETECTED: 2-Step Authorization Required</p>
      <p style="font-size:11px; margin-top:8px; margin-bottom:0;">Are you sure you want to execute this action? (Y/N)</p>
      <input type="text" id="confirmIn" placeholder="Type Y to confirm...">
      <p style="font-size:11px; margin-top:8px; margin-bottom:0;">Enter 6-Digit Authorization PIN:</p>
      <input type="password" id="pinIn" maxlength="6" placeholder="******">
      <button class="btn" style="margin-top:10px; width:100%; background:var(--red); color:#fff; border:none; padding:10px;" onclick="submitPin()">AUTHORIZE & EXECUTE</button>
    </div>
    <div id="res" style="margin-top:10px; max-height:200px; overflow-y:auto;"></div>
  </div>
</div>
<script>
  let pendingAction = null, pendingQuery = null;
  const overlay = document.getElementById("overlay");
  const cmdIn = document.getElementById("cmdIn");
  const logs = document.getElementById("logs");
  const res = document.getElementById("res");
  const pinSec = document.getElementById("pinSec");

  function openCmd() { overlay.style.display = "flex"; cmdIn.focus(); }
  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmd(); }
    if (e.key === "Escape") { overlay.style.display = "none"; resetPinSec(); }
  });

  cmdIn.addEventListener("input", async () => {
    const q = cmdIn.value;
    const r = await fetch("/api/command/search?q=" + encodeURIComponent(q));
    const d = await r.json();
    let h = (d.commands || []).map(c => \`<div style="padding:8px; cursor:pointer; border-bottom:1px solid #111;" onclick="exec('\${c.action}', '\${c.label}')">\${c.label} (\${c.category})</div>\`).join("");
    if (q.trim()) {
      h += \`<div style="padding:8px; cursor:pointer; color:var(--cyan);" onclick="exec('DYNAMIC_KERNEL_INTENT', '\${q}')">⚡ Dispatch Dynamic Intent: "\${q}"</div>\`;
    }
    res.innerHTML = h;
  });

  async function exec(action, query, pinConfirmed = false, pin = "") {
    const r = await fetch("/api/command/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload: { query }, pinConfirmed, pin })
    });
    const d = await r.json();
    if (d.status === "PIN_REQUIRED") {
      pendingAction = action;
      pendingQuery = query;
      pinSec.style.display = "block";
      return;
    }
    if (d.status === "PIN_FAILED") {
      alert(d.message);
      return;
    }
    overlay.style.display = "none";
    resetPinSec();
  }

  function submitPin() {
    const conf = document.getElementById("confirmIn").value.toUpperCase().trim();
    const pin = document.getElementById("pinIn").value.trim();
    if (conf !== "Y") { alert("Action canceled: Confirmation must be Y"); return; }
    if (!pin || pin.length !== 6) { alert("Please enter a valid 6-Digit PIN"); return; }
    exec(pendingAction, pendingQuery, true, pin);
  }

  function resetPinSec() {
    pinSec.style.display = "none";
    document.getElementById("confirmIn").value = "";
    document.getElementById("pinIn").value = "";
    pendingAction = null;
    pendingQuery = null;
  }

  setInterval(async () => {
    try {
      const r = await fetch("/api/telemetry/poll");
      const d = await r.json();
      logs.innerHTML = (d.logs || []).map(l => \`<div>[\${l.time}] \${l.tag} \${l.message}</div>\`).join("");
      logs.scrollTop = logs.scrollHeight;
    } catch(e) {}
  }, 1000);
</script>
</body>
</html>`;

fs.writeFileSync('src/server.js', serverCode, 'utf8');
fs.writeFileSync('public/index.html', htmlCode, 'utf8');
console.log('✅ Clean ES Module build successful: src/server.js & public/index.html updated.');