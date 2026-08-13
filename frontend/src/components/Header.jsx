export function Header({ onOpenPalette }) {
  return (
    <header className="header glass-panel">
      <div className="brand">
        <img src="/brand-mark.png" alt="ADE Logo" onError={(e) => { e.target.style.display = 'none'; }} />
        <img src="/logo.jpg" alt="Primary Logo" style={{ height: '32px' }} onError={(e) => { e.target.style.display = 'none'; }} />
        <span>ADE-APEX Operational Control Plane</span>
      </div>
      <div>
        <button 
          onClick={onOpenPalette} 
          style={{ background: 'rgba(0,242,254,0.1)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Press Ctrl + K (Search)
        </button>
      </div>
    </header>
  );
}
