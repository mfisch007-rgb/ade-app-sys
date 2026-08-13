export function CommandPalette({ isOpen, onClose, searchQuery, setSearchQuery, filteredCapabilities, kernelFallbacks }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box glass-panel" onClick={e => e.stopPropagation()}>
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search capabilities or query kernel (e.g. 'oracle', 'guardian')..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          autoFocus 
        />

        {filteredCapabilities.map(item => (
          <div key={item.id} className="search-result-item" onClick={() => { alert(`Selected capability: ${item.name}`); onClose(); }}>
            <strong>{item.name}</strong> [{item.category}]
          </div>
        ))}

        {kernelFallbacks.map(fb => (
          <div key={fb.id} className="search-result-item" onClick={() => { alert(`Triggered kernel synthesis for: ${fb.name}`); onClose(); }}>
            <strong>{fb.name}</strong> 
            <span className="fallback-tag">Kernel Self-Search Match</span>
          </div>
        ))}

        {filteredCapabilities.length === 0 && kernelFallbacks.length === 0 && (
          <div style={{ color: '#8892B0', textAlign: 'center', padding: '15px' }}>
            No exact capability or kernel matches found.
          </div>
        )}
      </div>
    </div>
  );
}
