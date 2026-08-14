import React, { useState, useEffect } from 'react';
import CommandPaletteModal from './CommandPaletteModal.jsx';

export function SpatialCommandCenter() {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [telemetryEvents, setTelemetryEvents] = useState([]);
  const [userTier, setUserTier] = useState("ENTERPRISE_ADMIN");

  useEffect(() => {
    // Mock or Live SSE Event Listener Hook
    const timer = setInterval(() => {
      const mockEvent = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        type: "GHOSTBRAIN_TICK",
        asset: "EURUSD_OTC",
        zScore: (Math.random() * 4 - 2).toFixed(2)
      };
      setTelemetryEvents(prev => [mockEvent, ...prev.slice(0, 9)]);
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const handleExecuteCommand = (cmd) => {
    console.log(`[SPATIAL UI]: Executed Command ${cmd.id} (${cmd.capability})`);
  };

  return (
    <div style={uiStyles.container}>
      <header style={uiStyles.header}>
        <h1 style={uiStyles.title}>ADE APEX SYSTEM ENGINE</h1>
        <div style={uiStyles.tierBadge}>Active Tier: {userTier}</div>
        <button style={uiStyles.paletteBtn} onClick={() => setIsPaletteOpen(true)}>
          Press <kbd style={uiStyles.kbd}>Ctrl + K</kbd> for Commands
        </button>
      </header>

      <main style={uiStyles.mainGrid}>
        <section style={uiStyles.card}>
          <h3>Live Telemetry SSE Stream</h3>
          <div style={uiStyles.streamBox}>
            {telemetryEvents.map(evt => (
              <div key={evt.id} style={uiStyles.streamRow}>
                <span>[{evt.timestamp}]</span>
                <span style={{ color: '#38bdf8' }}>{evt.type}</span>
                <span>{evt.asset}</span>
                <span style={{ color: Math.abs(evt.zScore) >= 2 ? '#ef4444' : '#22c55e' }}>
                  Z: {evt.zScore}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <CommandPaletteModal
        isOpen={isPaletteOpen}
        onClose={setIsPaletteOpen}
        onExecuteCommand={handleExecuteCommand}
      />
    </div>
  );
}

const uiStyles = {
  container: { minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc', padding: '24px', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },
  title: { fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' },
  tierBadge: { backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '6px 12px', borderRadius: '20px', fontSize: '12px' },
  paletteBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' },
  kbd: { backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #475569', color: '#f1f5f9' },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '24px' },
  card: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' },
  streamBox: { marginTop: '16px', backgroundColor: '#020617', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '13px' },
  streamRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b' }
};

export default SpatialCommandCenter;
