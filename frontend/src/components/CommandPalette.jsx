export function CommandPalette({ isOpen, onClose, searchQuery, setSearchQuery, filteredCapabilities = [], onExecute }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box glass-panel" onClick={e => e.stopPropagation()}>
        <input
          type="text"
          className="search-input"
          placeholder="Search server-owned capabilities..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
        />
        {filteredCapabilities.map(item => (
          <button
            key={item.intent || item.id}
            className="search-result-item"
            type="button"
            onClick={() => { onExecute?.(item); onClose(); }}
          >
            <strong>{item.name || item.intent}</strong> <span>[{item.intent}]</span>
            <small>RBAC {item.rbacLevel} • {item.runtimeBound === false ? 'UNBOUND' : 'READY'}</small>
          </button>
        ))}
        {filteredCapabilities.length === 0 && (
          <div style={{ color: '#8892B0', textAlign: 'center', padding: '15px' }}>
            No server-owned capabilities found.
          </div>
        )}
      </div>
    </div>
  );
}
