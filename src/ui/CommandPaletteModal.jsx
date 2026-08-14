import React, { useState, useEffect } from 'react';

export function CommandPaletteModal({ isOpen, onClose, onExecuteCommand }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const availableCommands = [
    { id: 'SYS_HEALTH', label: 'Check Enterprise Kernel Telemetry', capability: 'SYSTEM_AUDIT' },
    { id: 'ISSUE_LIC', label: 'Issue Enterprise Admin License Key', capability: 'LICENSE_ISSUE' },
    { id: 'GHOST_START', label: 'Activate GhostBrain Multi-Asset Engine', capability: 'TRADING_EXECUTE' },
    { id: 'TIER_OVERRIDE', label: 'Escalate User Tier to MASTER_ADMIN', capability: 'ADMIN_OVERRIDE' }
  ];

  const filteredCommands = availableCommands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onClose(!isOpen);
      }
      if (e.key === 'Escape' && isOpen) {
        onClose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <input
            type="text"
            placeholder="Type a command or press ESC to close..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.input}
            autoFocus
          />
        </div>
        <div style={styles.list}>
          {filteredCommands.map((cmd, idx) => (
            <div
              key={cmd.id}
              style={{
                ...styles.item,
                backgroundColor: idx === selectedIndex ? 'rgba(59, 130, 246, 0.2)' : 'transparent'
              }}
              onClick={() => {
                onExecuteCommand(cmd);
                onClose(false);
              }}
            >
              <span style={styles.cmdLabel}>{cmd.label}</span>
              <span style={styles.cmdBadge}>{cmd.capability}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '100px',
    zIndex: 9999
  },
  modal: {
    width: '600px',
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden'
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #1e293b'
  },
  input: {
    width: '100%',
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f8fafc',
    fontSize: '16px'
  },
  list: {
    maxHeight: '300px',
    overflowY: 'auto'
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(30, 41, 59, 0.5)'
  },
  cmdLabel: { color: '#e2e8f0', fontSize: '14px' },
  cmdBadge: { fontSize: '11px', color: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)', padding: '2px 8px', borderRadius: '4px' }
};

export default CommandPaletteModal;
