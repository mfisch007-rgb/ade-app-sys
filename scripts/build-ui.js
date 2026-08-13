import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const rootLogoPath = path.join(rootDir, 'ADE-LOGO.png');
const publicLogoPath = path.join(publicDir, 'ADE-LOGO.png');

if (fs.existsSync(rootLogoPath)) {
  fs.copyFileSync(rootLogoPath, publicLogoPath);
  console.log('✅ Synchronized ADE-LOGO.png to public directory.');
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADE-APEX Enterprise Operating System (HHI v1.0.0)</title>
  <style>
    :root { 
      --quantum-bg: #03070c; 
      --shield-bg: #0b1222; 
      --border: #1e293b; 
      --anchor-cyan: #38bdf8; 
      --oracle-violet: #a855f7; 
      --guardian-green: #10b981; 
      --alert-red: #ef4444; 
      --ivory-text: #f8fafc; 
      --shield-grey: #64748b; 
      --blue-highlight: #1e3a8a; 
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background-color: var(--quantum-bg); color: var(--ivory-text); padding: 24px; min-height: 100vh; display: flex; flex-direction: column; gap: 20px; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--blue-highlight); padding-bottom: 20px; box-shadow: 0 4px 20px rgba(56, 189, 248, 0.15); }
    .brand-container { display: flex; align-items: center; gap: 16px; }
    .brand-logo-container { width: 54px; height: 54px; display: flex; align-items: center; justify-content: center; background: rgba(56, 189, 248, 0.05); border: 1px solid var(--blue-highlight); border-radius: 8px; }
    .brand-logo-img { max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8)); }
    .brand h1 { font-size: 22px; font-weight: 800; color: var(--ivory-text); letter-spacing: -0.5px; text-transform: uppercase; }
    .brand p { font-size: 11px; color: var(--shield-grey); margin-top: 2px; letter-spacing: 0.5px; }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .cmd-btn { background: var(--shield-bg); color: var(--anchor-cyan); border: 1px solid var(--border); padding: 10px 18px; border-radius: 6px; font-weight: 700; font-size: 12px; font-family: monospace; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 0 10px rgba(56, 189, 248, 0.1); }
    .cmd-btn:hover { background: var(--blue-highlight); color: #fff; border-color: var(--anchor-cyan); box-shadow: 0 0 15px rgba(56, 189, 248, 0.3); }
    .badge { background: rgba(16, 185, 129, 0.1); color: var(--guardian-green); border: 1px solid var(--guardian-green); padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 12px; font-family: monospace; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .card { background: var(--shield-bg); border: 1px solid var(--border); border-radius: 10px; padding: 20px; transition: border-color 0.2s; }
    .card:hover { border-color: var(--blue-highlight); }
    .card label { font-size: 11px; text-transform: uppercase; color: var(--shield-grey); font-weight: 700; display: block; margin-bottom: 6px; }
    .card .val { font-size: 22px; font-weight: 700; color: var(--anchor-cyan); font-family: monospace; }
    .main-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; flex-grow: 1; }
    @media (max-width: 900px) { .main-layout { grid-template-columns: 1fr; } }
    .panel { background: var(--shield-bg); border: 1px solid var(--border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
    .panel-title { font-size: 14px; font-weight: 700; color: var(--ivory-text); text-transform: uppercase; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--blue-highlight); padding-bottom: 10px; }
    .log-stream { background: #010204; border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: monospace; font-size: 12px; height: 350px; overflow-y: auto; color: var(--ivory-text); display: flex; flex-direction: column; gap: 8px; }
    .log-entry { display: flex; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 4px; }
    .log-tag-system { color: var(--shield-grey); }
    .log-tag-oracle { color: var(--oracle-violet); }
    .log-tag-guardian { color: var(--guardian-green); }
    .log-tag-alert { color: var(--alert-red); }
    .log-tag-data { color: var(--anchor-cyan); }
    .registry-list { display: flex; flex-direction: column; gap: 10px; font-size: 13px; font-family: monospace; }
    .registry-item { padding: 10px; background: #0a0f1d; border-radius: 6px; border: 1px solid var(--border); }
    footer { border-top: 2px solid var(--blue-highlight); padding-top: 15px; font-size: 11px; color: var(--shield-grey); display: flex; justify-content: space-between; align-items: center; }
    kbd { background: var(--blue-highlight); padding: 2px 6px; border-radius: 4px; color: var(--anchor-cyan); border: 1px solid rgba(56, 189, 248, 0.2); }
    .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(3, 7, 18, 0.95); backdrop-filter: blur(10px); display: none; justify-content: center; align-items: flex-start; padding-top: 80px; z-index: 9999; }
    .palette-modal { background: var(--shield-bg); border: 2px solid var(--anchor-cyan); width: 100%; max-width: 700px; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); overflow: hidden; }
    .palette-input { width: 100%; background: rgba(56, 189, 248, 0.05); border: none; border-bottom: 1px solid var(--blue-highlight); padding: 18px 20px; color: var(--ivory-text); font-size: 16px; outline: none; font-family: monospace; }
    .palette-results { max-height: 420px; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
    .result-row { padding: 12px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border: 1px solid transparent; background: rgba(255,255,255,0.02); transition: all 0.15s ease; user-select: none; }
    .result-row:hover, .result-row.selected { background: var(--blue-highlight); border-color: var(--anchor-cyan); box-shadow: 0 0 10px rgba(56, 189, 248, 0.2); }
    .result-label { font-size: 13px; font-family: monospace; color: var(--ivory-text); pointer-events: none; }
    .result-cat { font-size: 10px; text-transform: uppercase; background: #1a1f2e; color: var(--shield-grey); padding: 3px 8px; border-radius: 4px; font-weight: 700; font-family: monospace; pointer-events: none; }
  </style>
</head>
<body>
  <header>
    <div class="brand-container">
      <div class="brand-logo-container">
        <img src="/ADE-LOGO.png?v=1.0.8" alt="ADE Logo" class="brand-logo-img">
      </div>
      <div class="brand">
        <h1>ADE-APEX Enterprise Operating System</h1>
        <p>We Listened | We Observed | We Learnt | We Evolved</p>
      </div>
    </div>
    <div class="header-actions">
      <button class="cmd-btn" id="openPaletteBtn">⌘ Command OS (Ctrl+K)</button>
      <div class="badge" id="sseBadge">SYNCED LIVE</div>
    </div>
  </header>

  <div class="grid">
    <div class="card"><label>Kernel Status</label><div class="val">OPERATIONAL</div></div>
    <div class="card"><label>Oracle Intelligence</label><div class="val" style="color:var(--oracle-violet);">ACTIVE</div></div>
    <div class="card"><label>Guardian Shield</label><div class="val" style="color:var(--guardian-green);">PROTECTED</div></div>
    <div class="card"><label>Data Pipeline</label><div class="val">AGNOSTIC</div></div>
  </div>

  <div class="main-layout">
    <div class="panel">
      <div class="panel-title">Live Telemetry Stream</div>
      <div class="log-stream" id="telemetryLog"></div>
    </div>

    <div class="panel">
      <div class="panel-title">Agnostic Registry Engine</div>
      <div class="registry-list">
        <div class="registry-item">⚡ Universal Ingestion Pipeline</div>
        <div class="registry-item">⚙️ Procarta Workflow Engine</div>
        <div class="registry-item">🔗 Universal Webhook Router</div>
        <div class="registry-item">📈 Multi-Asset Aggregator</div>
        <div class="registry-item">🧩 Pluggable Strategy Marketplace</div>
      </div>
    </div>
  </div>

  <footer>
    <span>ADE Hybrid Human-AI Architecture &copy; 2026 ADE Enterprise Inc. All Rights Reserved.</span>
    <span>Press <kbd>Ctrl + K</kbd> anywhere to trigger Command Palette</span>
  </footer>

  <div class="overlay" id="paletteOverlay">
    <div class="palette-modal" id="paletteModal">
      <input type="text" class="palette-input" id="paletteSearch" placeholder="Type capability query or operational intent..." autocomplete="off">
      <div class="palette-results" id="paletteResults"></div>
    </div>
  </div>

  <script>
    const overlay = document.getElementById('paletteOverlay');
    const modal = document.getElementById('paletteModal');
    const searchInput = document.getElementById('paletteSearch');
    const resultsDiv = document.getElementById('paletteResults');
    const logDiv = document.getElementById('telemetryLog');
    const openBtn = document.getElementById('openPaletteBtn');

    let selectedIndex = 0;
    let currentResults = [];
    let lastRenderedCount = 0;

    async function syncLogs() {
      try {
        const res = await fetch('/api/telemetry/poll?t=' + Date.now());
        const data = await res.json();
        const logs = data.logs || [];
        
        if (logs.length !== lastRenderedCount) {
          logDiv.innerHTML = '';
          logs.forEach(item => appendLog(item.time, item.tag, item.message));
          lastRenderedCount = logs.length;
          logDiv.scrollTop = logDiv.scrollHeight;
        }
      } catch (err) {}
    }

    syncLogs();
    setInterval(syncLogs, 1000);

    function openPalette() {
      overlay.style.display = 'flex';
      setTimeout(() => searchInput.focus(), 50);
      fetchAndRenderCapabilities('');
    }

    function closePalette() { 
      overlay.style.display = 'none'; 
      searchInput.value = '';
      selectedIndex = 0;
    }

    openBtn.addEventListener('click', openPalette);
    
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) { closePalette(); }
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        overlay.style.display === 'flex' ? closePalette() : openPalette();
      }
      if (e.key === 'Escape') closePalette();
    });

    searchInput.addEventListener('keydown', (e) => {
      const rows = document.querySelectorAll('.result-row');
      if (e.key === 'ArrowDown' && rows.length > 0) {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % rows.length;
        updateHighlight(rows);
      } else if (e.key === 'ArrowUp' && rows.length > 0) {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + rows.length) % rows.length;
        updateHighlight(rows);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentResults.length > 0 && selectedIndex >= 0 && selectedIndex < currentResults.length) {
          const target = currentResults[selectedIndex];
          executeCmd(target.action, target.label, target.query);
        }
      }
    });

    searchInput.addEventListener('input', () => {
      fetchAndRenderCapabilities(searchInput.value.trim());
    });

    function updateHighlight(rows) {
      rows.forEach((row, idx) => {
        if (idx === selectedIndex) {
          row.classList.add('selected');
          row.scrollIntoView({ block: 'nearest' });
        } else {
          row.classList.remove('selected');
        }
      });
    }

    async function fetchAndRenderCapabilities(query) {
      try {
        const res = await fetch('/api/command/search?q=' + encodeURIComponent(query));
        const data = await res.json();
        const baseCommands = data.commands || [];
        
        currentResults = [...baseCommands];

        if (query.trim().length > 0) {
          currentResults.push({
            action: 'DYNAMIC_KERNEL_INTENT',
            label: '⚡ Dispatch Intent: "' + query + '"',
            category: 'Kernel Resolver',
            query: query
          });
        }

        selectedIndex = 0;

        if (currentResults.length > 0) {
          resultsDiv.innerHTML = currentResults.map((item, idx) => \`
            <div class="result-row \${idx === 0 ? 'selected' : ''}" data-idx="\${idx}">
              <span class="result-label">\${item.label}</span>
              <span class="result-cat">\${item.category}</span>
            </div>
          \`).join('');

          // Bind Mouse Left-Click Directly
          document.querySelectorAll('.result-row').forEach(row => {
            row.addEventListener('click', (e) => {
              e.stopPropagation();
              const idx = parseInt(row.getAttribute('data-idx'), 10);
              const target = currentResults[idx];
              if (target) {
                executeCmd(target.action, target.label, target.query);
              }
            });
          });
        } else {
          resultsDiv.innerHTML = '<div style="padding:15px; color:var(--shield-grey); font-family:monospace;">No capability matches found.</div>';
        }
      } catch (err) {}
    }

    async function executeCmd(action, label, query = '') {
      closePalette();
      await fetch('/api/command/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload: { label, query } })
      });
      syncLogs();
    }

    function appendLog(timeStr, tag, msg) {
      const entry = document.createElement('div'); 
      entry.className = 'log-entry';
      let tagClass = 'log-tag-system';
      if(tag.includes('ORACLE')) tagClass = 'log-tag-oracle';
      if(tag.includes('GUARDIAN')) tagClass = 'log-tag-guardian';
      if(tag.includes('DATA') || tag.includes('COMMAND') || tag.includes('RESOLVER')) tagClass = 'log-tag-data';
      entry.innerHTML = '<span class="' + tagClass + '">[' + timeStr + '] ' + tag + '</span><span>' + msg + '</span>';
      logDiv.appendChild(entry);
    }
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(publicDir, 'index.html'), html, 'utf8');
console.log('✅ Updated public/index.html with Left-Click Event Delegation & Dynamic Resolver UI.');