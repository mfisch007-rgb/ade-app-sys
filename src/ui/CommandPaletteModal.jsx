import React, { useEffect, useState } from 'react';

export function CommandPaletteModal({ isOpen, onClose, capabilities = [], onExecuteCommand }) {
  const [query, setQuery] = useState('');
  const filtered = capabilities.filter(cmd =>
    [cmd.intent, cmd.name, cmd.description, cmd.sourceModule].join(' ').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose(!isOpen);
      }
      if (e.key === 'Escape' && isOpen) onClose(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div style={styles.overlay} onMouseDown={e => e.target === e.currentTarget && onClose(false)}>
      <div style={styles.modal}>
        <input
          type="text"
          placeholder="Search server-owned capabilities..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={styles.input}
          autoFocus
        />
        <div style={styles.list}>
          {filtered.map(cmd => (
            <button key={cmd.intent} type="button" style={styles.item} onClick={() => { onExecuteCommand(cmd); onClose(false); }}>
              <span style={styles.cmdLabel}>{cmd.name || cmd.intent}</span>
              <span style={styles.cmdBadge}>RBAC {cmd.rbacLevel}</span>
            </button>
          ))}
          {!filtered.length && <div style={styles.empty}>No server-owned capability matches.</div>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '10vh', zIndex: 9999 },
  modal: { width: 'min(700px,92vw)', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,.5)', overflow: 'hidden' },
  input: { width: '100%', boxSizing: 'border-box', padding: '16px', backgroundColor: '#020617', border: 0, borderBottom: '1px solid #1e293b', outline: 'none', color: '#f8fafc', fontSize: '16px' },
  list: { maxHeight: '55vh', overflowY: 'auto' },
  item: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', cursor: 'pointer', border: 0, borderBottom: '1px solid rgba(30,41,59,.5)', background: 'transparent', color: '#e2e8f0', textAlign: 'left' },
  cmdLabel: { fontSize: '14px' },
  cmdBadge: { fontSize: '11px', color: '#60a5fa' },
  empty: { padding: 20, color: '#94a3b8' }
};

export default CommandPaletteModal;
