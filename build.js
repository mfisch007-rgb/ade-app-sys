import fs from 'fs';
import path from 'path';

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

function pushLog(tag, message, userId = 'SYSTEM_ADMIN', metadata = {}) {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
  const logItem = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp,
    userId,
    tag,
    message,
    metadata
  };
  recentLogs.push(logItem);
  if (recentLogs.length > 100) recentLogs.shift();
  return logItem;
}

pushLog('[SYSTEM]', 'ADE-APEX Master Kernel booted. Security PIN Engine & Glassmorphic OS Active.', 'KERNEL_INIT');

app.get('/api/telemetry/poll', (req, res) => res.json({ logs: recentLogs }));

app.get('/api/command/search', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const commands = commandPalette.search(q);
  res.json({ query: q, commands });
});

app.post('/api/command/execute', (req, res) => {
  const { action, payload, pinConfirmed, pin, userId = 'ADMIN_OPERATOR' } = req.body;
  const rawIntent = (payload?.query || action || '').toString().trim().toUpperCase();
  
  const sensitiveActions = ['KERNEL_SHUTDOWN', 'SHUTDOWN', 'SYSTEM_RESET', 'FLUSH_LEDGER'];
  const isSensitive = sensitiveActions.includes(action) || sensitiveActions.includes(rawIntent);

  if (isSensitive && !pinConfirmed) {
    return res.json({ 
      status: 'PIN_REQUIRED', 
      action, 
      message: 'CRITICAL INTENT DETECTED: 2-Step Authorization Required.' 
    });
  }

  if (isSensitive && pinConfirmed) {
    if (pin !== ADMIN_PIN) {
      pushLog('[SECURITY-ALERT]', 'Unauthorized PIN attempt detected and logged for audit.', userId, { action: rawIntent });
      return res.status(403).json({ status: 'PIN_FAILED', message: 'INVALID AUTHORIZATION PIN. Action rejected.' });
    }
    pushLog('[AUDIT-LOG]', 'ACTION AUTHORIZED VIA VERIFIED ADMIN PIN: ' + rawIntent, userId, { pinMasked: '******' });
  }

  let tag = '[COMMAND-EXEC]';
  let logMessage = 'Executed: ' + (payload?.query || action);

  if (rawIntent === 'ECHO OFF' || rawIntent === 'PAUSE') {
    pulseActive = false;
    logMessage = 'Telemetry Heartbeat SUSPENDED (ECHO OFF)';
  } else if (rawIntent === 'ECHO ON' || rawIntent === 'RESUME') {
    pulseActive = true;
    logMessage = 'Telemetry Heartbeat RESUMED (ECHO ON)';
  } else if (rawIntent === 'CLEAR') {
    recentLogs = [];
    logMessage = 'Telemetry Buffer Flushed';
  } else if (rawIntent.includes('ORACLE') || rawIntent.includes('DIAGNOSTIC')) {
    tag = '[ORACLE-DIAGNOSTIC]';
    logMessage = 'Human/AI Hybrid Diagnostic -> Status: 100% Operational | Query: ' + rawIntent;
  } else if (rawIntent === 'SHUTDOWN' || action === 'KERNEL_SHUTDOWN') {
    pushLog('[SYSTEM]', 'CRITICAL: Kernel Shutdown Initiated via Verified PIN.', userId);
    res.json({ status: 'SUCCESS', message: 'System terminating gracefully...' });
    setTimeout(() => process.exit(0), 1000);
    return;
  } else if (action === 'DYNAMIC_KERNEL_INTENT') {
    tag = '[KERNEL-RESOLVER]';
    logMessage = 'Resolved Smart Query -> ' + rawIntent;
  }

  const entry = pushLog(tag, logMessage, userId, payload);
  res.json({ status: 'SUCCESS', action, logged: entry });
});

app.use(express.static(publicDir));
app.use((req, res) => res.sendFile(path.join(publicDir, 'index.html')));

let pulseCount = 0;
setInterval(() => {
  if (!pulseActive) return;
  pulseCount++;
  pushLog('[KERNEL-PULSE]', 'System Health 100% | Heartbeat #' + pulseCount, 'KERNEL_DAEMON');
}, 3000);

app.listen(PORT, () => console.log('🚀 ADE-APEX Universal Command Center running on port ' + PORT));
`;

// 2. Write public/index.html
const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ADE-APEX Enterprise Operating System</title>
<style>
  :root {
    --bg-grad: linear-gradient(135deg, #020617 0%, #080f26 50%, #030712 100%);
    --glass-bg: rgba(15, 23, 42, 0.65);
    --glass-border: rgba(56, 189, 248, 0.2);
    --glass-card: rgba(30, 41, 59, 0.5);
    --cyan: #38bdf8;
    --neon-blue: #60a5fa;
    --red: #ef4444;
    --text: #f8fafc;
    --text-dim: #94a3b8;
  }

  body {
    background: var(--bg-grad);
    color: var(--text);
    font-family: 'Segoe UI', Roboto, monospace;
    margin: 0;
    padding: 24px;
    min-height: 100vh;
    box-sizing: border-box;
  }

  /* Glassmorphism Header */
  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 16px 24px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  }

  .logo-box {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, var(--cyan), var(--neon-blue));
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    color: #020617;
    font-size: 18px;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
  }

  .btn {
    background: var(--glass-card);
    color: var(--cyan);
    border: 1px solid var(--glass-border);
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-family: monospace;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
  }

  .btn:hover {
    background: rgba(56, 189, 248, 0.15);
    border-color: var(--cyan);
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
  }

  /* Log Telemetry Screen */
  .log-box {
    background: rgba(2, 6, 23, 0.75);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    height: 480px;
    overflow-y: auto;
    padding: 16px;
    margin-top: 20px;
    font-family: 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.6;
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
  }

  .log-row {
    display: flex;
    gap: 12px;
    padding: 3px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }

  .log-time { color: var(--text-dim); }
  .log-user { color: var(--neon-blue); font-weight: bold; }
  .log-tag { color: var(--cyan); }
  .log-audit { color: #f59e0b; font-weight: bold; }
  .log-alert { color: var(--red); font-weight: bold; }

  /* Glass Overlay Modal */
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(2, 6, 23, 0.8);
    backdrop-filter: blur(12px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 999;
  }

  .modal {
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(20px);
    border: 1px solid var(--cyan);
    width: 540px;
    padding: 24px;
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(56, 189, 248, 0.25);
  }

  input[type="text"], input[type="password"] {
    width: 100%;
    background: rgba(2, 6, 23, 0.8);
    border: 1px solid var(--glass-border);
    color: #fff;
    padding: 12px;
    margin-top: 10px;
    border-radius: 8px;
    outline: none;
    font-family: monospace;
    box-sizing: border-box;
  }

  input[type="password"] {
    -webkit-text-security: disc !important;
    letter-spacing: 4px;
  }

  .pin-box {
    border: 1px solid var(--red) !important;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 8px;
    padding: 16px;
  }

  .cmd-item {
    padding: 10px 14px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    border-radius: 6px;
    transition: background 0.15s;
  }

  .cmd-item:hover { background: rgba(56, 189, 248, 0.15); }
</style>
</head>
<body>

<div class="hdr">
  <div class="logo-box">
    <div class="logo-icon">ADE</div>
    <div>
      <h3 style="margin:0; font-size:16px; color:var(--text);">ADE-APEX Enterprise Operating System</h3>
      <span style="font-size:11px; color:var(--text-dim);">Live Kernel Stream • Multi-Asset Control Hub</span>
    </div>
  </div>
  <button class="btn" onclick="openCmd()">⌘ Command OS (Ctrl+K)</button>
</div>

<div class="log-box" id="logs"></div>

<div class="overlay" id="overlay">
  <div class="modal">
    <h3 id="mTitle" style="margin-top:0; color:var(--cyan); font-family:monospace;">Command Palette</h3>
    <input type="text" id="cmdIn" placeholder="Type command or dynamic intent..." autofocus>
    
    <div id="pinSec" class="pin-box" style="margin-top:15px; display:none;">
      <p style="color:var(--red); font-size:12px; font-weight:bold; margin:0;">⚠️ CRITICAL INTENT DETECTED: 2-Step Authorization Required</p>
      <p style="font-size:11px; margin-top:8px; margin-bottom:4px;">Are you sure you want to execute this action? (Y/N)</p>
      <input type="text" id="confirmIn" placeholder="Type Y to confirm...">
      <p style="font-size:11px; margin-top:8px; margin-bottom:4px;">Enter 6-Digit Authorization PIN:</p>
      <input type="password" id="pinIn" maxlength="6" placeholder="******" autocomplete="off">
      <button class="btn" style="margin-top:14px; width:100%; background:var(--red); color:#fff; border:none; padding:12px;" onclick="submitPin()">AUTHORIZE & EXECUTE</button>
    </div>

    <div id="res" style="margin-top:10px; max-height:220px; overflow-y:auto;"></div>
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

  cmdIn.addEventListener("keydown", e => {
    if (e.key === "Enter" && cmdIn.value.trim()) {
      exec("DYNAMIC_KERNEL_INTENT", cmdIn.value.trim());
    }
  });

  cmdIn.addEventListener("input", async () => {
    const q = cmdIn.value;
    const r = await fetch("/api/command/search?q=" + encodeURIComponent(q));
    const d = await r.json();
    let h = "";
    (d.commands || []).forEach(c => {
      h += \`<div class="cmd-item" onclick="exec('\${c.action}', '\${c.label}')">\${c.label} <span style="font-size:10px; opacity:0.6;">(\${c.category})</span></div>\`;
    });
    if (q.trim()) {
      h += \`<div class="cmd-item" style="color:var(--cyan);" onclick="exec('DYNAMIC_KERNEL_INTENT', '\${q}')">⚡ Dispatch Dynamic Intent: "\${q}"</div>\`;
    }
    res.innerHTML = h;
  });

  async function exec(action, query, pinConfirmed = false, pin = "") {
    const r = await fetch("/api/command/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload: { query }, pinConfirmed, pin, userId: "ADMIN_OPERATOR" })
    });
    const d = await r.json();
    
    if (d.status === "PIN_REQUIRED") {
      pendingAction = action;
      pendingQuery = query;
      res.innerHTML = "";
      pinSec.style.display = "block";
      document.getElementById("confirmIn").focus();
      return;
    }
    if (d.status === "PIN_FAILED") {
      alert(d.message);
      return;
    }
    overlay.style.display = "none";
    cmdIn.value = "";
    res.innerHTML = "";
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
      logs.innerHTML = (d.logs || []).map(l => {
        let tagClass = "log-tag";
        if (l.tag.includes("AUDIT")) tagClass = "log-audit";
        if (l.tag.includes("SECURITY")) tagClass = "log-alert";
        return \`<div class="log-row">
          <span class="log-time">[\${l.timestamp}]</span>
          <span class="log-user">[\${l.userId}]</span>
          <span class="\${tagClass}">\${l.tag}</span>
          <span>\${l.message}</span>
        </div>\`;
      }).join("");
      logs.scrollTop = logs.scrollHeight;
    } catch(e) {}
  }, 1000);
</script>
</body>
</html>`;

fs.writeFileSync('src/server.js', serverCode, 'utf8');
fs.writeFileSync('public/index.html', htmlCode, 'utf8');
console.log('✅ Rebuilt ADE-APEX OS with Glassmorphism, PIN Masking, and Full Timestamp/User Audit Logging.');