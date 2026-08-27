/**
 * ADE-APEX Enterprise Master Orchestrator
 *
 * Orchestration layer only.
 *
 * It does not create a second kernel.
 * It consumes the canonical kernel.
 */

import { EnterpriseKernelMaster } from "../kernel/EnterpriseKernelMaster.js";
import { UniversalEventBus } from "./UniversalEventBus.js";
import { PluginLifecycleEngine } from "./PluginLifecycleEngine.js";
import {
  StrategyMarketplace,
  GenericForexAdapter
} from "./BrokerAdapterEngine.js";
import { CloudSignalPipelineEngine } from "./CloudSignalPipelineEngine.js";

export class EnterpriseMasterOrchestrator {

  constructor(options = {}) {

    this.kernel =
      options.kernel ||
      EnterpriseKernelMaster.getInstance();

    this.eventBus =
      options.eventBus ||
      new UniversalEventBus();

    this.pluginOS =
      options.pluginOS ||
      new PluginLifecycleEngine();

    this.marketplace =
      options.marketplace ||
      new StrategyMarketplace();

    this.brokerAdapter =
      options.brokerAdapter ||
      new GenericForexAdapter();

    this.cloudPipeline =
      options.cloudPipeline ||
      new CloudSignalPipelineEngine();

    this.status = "STOPPED";
  }

  async bootEcosystem() {

    console.log(
      "[MasterOrchestrator] Starting unified ADE ecosystem deployment sequence..."
    );

    await this.kernel.boot();

    try {
      if (
        this.brokerAdapter &&
        typeof this.brokerAdapter.connect === "function"
      ) {
        await this.brokerAdapter.connect();
      }
    } catch (error) {

      console.warn(
        "[MasterOrchestrator] Broker adapter unavailable:",
        error?.message || String(error)
      );
    }

    this.status = "ONLINE";

    console.log(
      "[MasterOrchestrator] All orchestration services bound to canonical kernel."
    );

    return {
      status: "ONLINE",
      timestamp: Date.now(),
      kernel: this.kernel.getHealth()
    };
  }

  async processIncomingWebhookSignal(payload = {}) {

    const pipelineRes =
      await this.cloudPipeline.processCloudSignal(payload);

    if (pipelineRes.status !== "ACCEPTED") {
      return pipelineRes;
    }

    const stratRes =
      this.marketplace.evaluate(
        "Z_SCORE_ANOMALY",
        {
          zScore: pipelineRes.signal.zScore
        }
      );

    if (stratRes.trigger) {

      const execRes =
        await this.brokerAdapter.executeOrder({
          asset: pipelineRes.signal.asset,
          amount: 100,
          action: pipelineRes.signal.action
        });

      if (
        this.eventBus &&
        typeof this.eventBus.publish === "function"
      ) {
        await this.eventBus
          .publish("trade:executed", execRes)
          .catch(error =>
            console.error(
              "[EventBus Async Error]",
              error
            )
          );
      }

      return {
        status: "EXECUTED",
        execution: execRes
      };
    }

    return {
      status: "HOLD",
      reason: "Strategy trigger threshold not met"
    };
  }

  async shutdownEcosystem() {

    await this.kernel.shutdown();

    this.status = "STOPPED";

    console.log(
      "[MasterOrchestrator] Ecosystem cleanly shutdown."
    );

    return {
      status: "OFFLINE",
      timestamp: Date.now()
    };
  }

  resolve(name) {
    return this.kernel.resolve(name);
  }

  getHealth() {
    return {
      status: this.status,
      kernel: this.kernel.getHealth()
    };
  }
}

export default EnterpriseMasterOrchestrator;
