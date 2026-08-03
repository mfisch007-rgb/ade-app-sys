import { EventContractRegistry } from '../../kernel/events/EventContractRegistry.js';
import eventBus from '../core/eventBus.js';

export async function bootRuntime() {
    console.log('[SYSTEM INIT] Starting ADE-APEX enterprise runtime kernel...');
    
    // Wire contract subscriptions
    const registry = new EventContractRegistry(eventBus);
    registry.registerAllSubscriptions();

    // Await system.boot publish to satisfy topological contracts cleanly
    if (eventBus && typeof eventBus.publish === 'function') {
        await eventBus.publish('system.boot', { 
            timestamp: Date.now(), 
            status: 'INITIALIZED' 
        });
    }

    console.log('[SYSTEM INIT] Runtime boot completed successfully.');
}

export default bootRuntime;