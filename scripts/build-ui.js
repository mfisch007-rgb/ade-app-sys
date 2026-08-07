import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADE Enterprise Command Center</title>
  <style>
    :root {
      --bg-ocean: #020817;
      --card-glass: rgba(6, 26, 64, 0.6);
      --crown-blue: #0A84FF;
      --electric-cyan: #00D4FF;
      --text-white: #F8FAFC;
      --text-dim: #94A3B8;
      --border-glow: rgba(0, 212, 255, 0.2);
      --coral-alert: #FF2D55;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background-color: var(--bg-ocean); color: var(--text-white); min-height: 100vh; display: flex; flex-direction: column; overflow-x: hidden; }
    
    header {
      padding: 18px 32px;
      border-bottom: 1px solid var(--border-glow);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(2, 8, 23, 0.85);
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .brand { font-size: 1.2rem; font-weight: 700; letter-spacing: 2px; color: var(--text-white); display: flex; align-items: center; gap: 10px; }
    .brand-dot { width: 10px; height: 10px; background-color: var(--electric-cyan); border-radius: 50%; box-shadow: 0 0 10px var(--electric-cyan); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    .motto { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1.5px; }

    main {
      padding: 32px;
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 24px;
    }

    nav {
      background: var(--card-glass);
      border: 1px solid var(--border-glow);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      backdrop-filter: blur(8px);
    }
    .nav-title { font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }
    .nav-item {
      padding: 10px 14px;
      border-radius: 8px;
      color: var(--text-white);
      text-decoration: none;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(10, 132, 255, 0.05);
      border: 1px solid transparent;
      transition: all 0.2s;
      cursor: pointer;
    }
    .nav-item:hover, .nav-item.active { border-color: var(--crown-blue); color: var(--electric-cyan); background: rgba(10, 132, 255, 0.15); }

    .content { display: flex; flex-direction: column; gap: 24px; }
    .mission-header {
      background: var(--card-glass);
      border: 1px solid var(--border-glow);
      border-radius: 12px;
      padding: 24px 28px;
      backdrop-filter: blur(8px);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .status-badge {
      background: rgba(0, 212, 255, 0.1);
      border: 1px solid var(--electric-cyan);
      color: var(--electric-cyan);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
    .card { background: var(--card-glass); border: 1px solid var(--border-glow); border-radius: 12px; padding: 20px; backdrop-filter: blur(8px); }
    .card-title { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .card-value { font-size: 1.5rem; font-weight: 700; color: var(--electric-cyan); font-family: monospace; }

    .log-box {
      background: rgba(2, 8, 23, 0.9);
      border: 1px solid var(--border-glow);
      border-radius: 12px;
      padding: 20px;
      font-family: monospace;
      font-size: 0.8rem;
      color: #38BDF8;
      height: 240px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .palette-modal {
      display: none;
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: rgba(2, 8, 23, 0.85);
      backdrop-filter: blur(16px);
      z-index: 1000;
      justify-content: center;
      align-items: flex-start;
      padding-top: 15vh;
    }
    .palette-box {
      background: var(--card-glass);
      border: 1px solid var(--crown-blue);
      width: 600px;
      max-width: 90%;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 0 30px rgba(10, 132, 255, 0.3);
    }
    .palette-input {
      width: 100%;
      background: rgba(2, 8, 23, 0.9);
      border: 1px solid var(--border-glow);
      padding: 14px 18px;
      border-radius: 8px;
      color: var(--text-white);
      font-size: 1rem;
      outline: none;
      margin-bottom: 12px;
    }
    .palette-input:focus { border-color: var(--electric-cyan); }
  </style>
</head>
<body>
  <header>
    <div class="brand"><div class="brand-dot"></div>ADE COMMAND CENTER</div>
    <div class="motto">We Listened | We Observed | We Learnt | We Evolved</div>
  </header>
  <main>
    <nav>
      <div class="nav-title">Missions</div>
      <a class="nav-item active">Telemetry Stream</a>
      <a class="nav-item">Oracle Intelligence</a>
      <a class="nav-item">Workflow Engine</a>
      <a class="nav-item">Guardian Security</a>
      <div class="nav-title">Discovered Capabilities</div>
      <div id="dynamic-nav"><div style="font-size:0.8rem;color:var(--text-dim);">Scanning Kernel...</div></div>
    </nav>
    <div class="content">
      <div class="mission-header">
        <div>
          <h2 style="font-weight:600;margin-bottom:4px;">Operating Environment Control Plane</h2>
          <p style="color:var(--text-dim);font-size:0.85rem;">Press <span style="color:var(--electric-cyan);font-weight:600;">Ctrl + K</span> to launch Command Palette</p>
        </div>
        <div class="status-badge" id="kernel-status">KERNEL ACTIVE</div>
      </div>
      <div class="grid-cards">
        <div class="card"><div class="card-title">Oracle State</div><div class="card-value" id="oracle-val">ACTIVE</div></div>
        <div class="card"><div class="card-title">Guardian Security</div><div class="card-value">PROTECTED</div></div>
        <div class="card"><div class="card-title">Memory Growth</div><div class="card-value" id="memory-val">+0</div></div>
        <div class="card"><div class="card-title">Active Plugins</div><div class="card-value" id="plugin-count">0</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:0.75rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">Live EventBus Telemetry Feed</div>
        <div class="log-box" id="logBox">
          <div>[SYSTEM] Listening to EventBus telemetry stream...</div>
        </div>
      </div>
    </div>
  </main>

  <div class="palette-modal" id="paletteModal">
    <div class="palette-box">
      <input type="text" class="palette-input" placeholder="Type a mission action... (e.g. EXECUTE_ZSCORE_TRADE, VERIFY_AFFILIATE_KEY)" id="paletteInput">
      <div style="font-size:0.75rem;color:var(--text-dim);display:flex;justify-content:space-between;">
        <span>Press ENTER to dispatch mission</span>
        <span>Press ESC to dismiss</span>
      </div>
    </div>
  </div>

  <script>
    function addLog(msg) {
      const logBox = document.getElementById("logBox");
      const div = document.createElement("div");
      div.innerText = "[" + new Date().toLocaleTimeString() + "] " + msg;
      logBox.appendChild(div);
      logBox.scrollTop = logBox.scrollHeight;
    }

    async function loadCapabilities() {
      try {
        const res = await fetch("/api/v1/capabilities");
        const data = await res.json();
        const keys = Object.keys(data.plugins || {});
        document.getElementById("plugin-count").innerText = keys.length;
        document.getElementById("dynamic-nav").innerHTML = keys.length > 0 
          ? keys.map(k => '<div class="nav-item">📦 ' + k + '</div>').join("")
          : '<div style="font-size:0.8rem;color:var(--text-dim);">No external plugins</div>';
      } catch (err) { console.error("Capabilities error:", err); }
    }

    // Connect to live telemetry SSE stream
    try {
      const evt = new EventSource("/api/v1/telemetry");
      evt.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.telemetry) {
            document.getElementById("oracle-val").innerText = d.telemetry.oracleState || "ACTIVE";
            document.getElementById("memory-val").innerText = d.telemetry.memoryGrowth || "+0";
          } else if (d.type === "EVENT_BUS_BROADCAST") {
            addLog("EVENT: " + (d.event.action || d.event.type || "BROADCAST"));
          }
        } catch (err) {}
      };
    } catch (err) {
      addLog("SSE Connection failed, fallback active.");
    }

    // Keyboard Command Palette (Ctrl + K)
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("paletteModal").style.display = "flex";
        document.getElementById("paletteInput").focus();
      } else if (e.key === "Escape") {
        document.getElementById("paletteModal").style.display = "none";
      }
    });

    document.getElementById("paletteInput").addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const action = e.target.value.trim();
        if (!action) return;
        try {
          const res = await fetch("/api/v1/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action })
          });
          const data = await res.json();
          addLog("DISPATCHED " + action + " -> Status: " + (data.status || "ACCEPTED"));
          e.target.value = "";
          document.getElementById("paletteModal").style.display = "none";
        } catch (err) {
          addLog("DISPATCH ERROR: " + err.message);
        }
      }
    });

    loadCapabilities();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent, 'utf8');
console.log('✅ UI HTML successfully written to public/index.html');