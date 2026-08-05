export class FaultInjector {
  constructor({ eventBus, logger = console } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.activeFaults = new Set();
  }

  injectFault(targetService, faultType, durationMs = 5000) {
    const faultKey = `${targetService}:${faultType}`;
    this.activeFaults.add(faultKey);
    this.logger.warn(`[FaultInjector] INJECTING FAULT: '${faultType}' on service '${targetService}' for ${durationMs}ms`);

    setTimeout(() => {
      this.activeFaults.delete(faultKey);
      this.logger.info(`[FaultInjector] RECOVERED FAULT: '${faultType}' on service '${targetService}'`);
    }, durationMs);
  }

  isFaultActive(targetService, faultType) {
    return this.activeFaults.has(`${targetService}:${faultType}`);
  }

  wrapWithResilience(targetService, methodName, fn) {
    const self = this;
    return async function (...args) {
      if (self.isFaultActive(targetService, 'SERVICE_UNAVAILABLE')) {
        throw new Error(`[FaultInjector] Simulated Outage: Service '${targetService}' is unreachable.`);
      }
      if (self.isFaultActive(targetService, 'LATENCY_SPIKE')) {
        await new Promise(r => setTimeout(r, 2000));
      }
      return fn.apply(this, args);
    };
  }
}