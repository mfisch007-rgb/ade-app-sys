export class CommandPaletteEngine {
  constructor() {
    this.registry = new Map();
    this.registerDefaultCommands();
  }

  registerCommand(id, metadata) {
    this.registry.set(id, metadata);
  }

  registerDefaultCommands() {
    // System & Health
    this.registerCommand('system:validate', { category: 'System', label: 'Run Platform Validation', action: 'ade validate' });
    this.registerCommand('system:health', { category: 'System', label: 'Check Platform Health Report', action: 'ade health' });
    this.registerCommand('system:doctor', { category: 'System', label: 'Run System Diagnostics', action: 'ade doctor' });

    // Kernel Controls
    this.registerCommand('kernel:boot', { category: 'Kernel', label: 'Boot Enterprise Ecosystem', action: 'boot' });
    this.registerCommand('kernel:shutdown', { category: 'Kernel', label: 'Graceful Shutdown Ecosystem', action: 'shutdown' });

    // Oracle Intelligence
    this.registerCommand('oracle:explain', { category: 'Oracle', label: 'Explain Recent Guardian Decision', action: 'explain' });
    this.registerCommand('oracle:ask', { category: 'Oracle', label: 'Prompt Oracle Intelligence AI', action: 'prompt' });

    // Extensions & Domain Plugins
    this.registerCommand('extension:finance:signal', { category: 'Trading Extension', label: 'Evaluate Multi-Asset Z-Score Signal', action: 'evaluate_signal' });
    this.registerCommand('extension:procarta:workflow', { category: 'Procarta Extension', label: 'Trigger Business Automation Flow', action: 'trigger_procarta' });
  }

  search(query) {
    if (!query) return Array.from(this.registry.values());
    const q = query.toLowerCase();
    return Array.from(this.registry.values()).filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.action.toLowerCase().includes(q)
    );
  }

  async executeCommand(id, payload = {}) {
    const command = this.registry.get(id);
    if (!command) {
      return { status: 'ERROR', message: `Command \${id}\` not found in registry.` };
    }
    console.log(`[CommandPalette] Executing ${command.category} -> ${command.label}`);
    return { status: 'SUCCESS', command: command.label, executedAt: Date.now(), payload };
  }
}
