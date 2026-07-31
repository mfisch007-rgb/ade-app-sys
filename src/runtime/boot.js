import { log } from "../core/logger.js";
import { runtimeState } from "../core/runtimeState.js";

export async function bootSystem() {
  log.info("Booting ADE-AWBULI Runtime Core...");

  runtimeState.mode = "FULL";

  log.info("Runtime Core Active");
}
