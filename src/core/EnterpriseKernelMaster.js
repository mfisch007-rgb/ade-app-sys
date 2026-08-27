/**
 * ADE-APEX CORE KERNEL COMPATIBILITY FACADE
 *
 * IMPORTANT:
 * The canonical runtime kernel lives at:
 *
 *   ../kernel/EnterpriseKernelMaster.js
 *
 * This file MUST NOT implement a second kernel.
 *
 * It exists only so legacy/core imports continue to resolve to the
 * canonical runtime architecture.
 */

import CanonicalEnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";

export class EnterpriseKernelMaster extends CanonicalEnterpriseKernelMaster {

  constructor(options = {}) {
    super(options);
  }

  static getInstance() {
    return CanonicalEnterpriseKernelMaster.getInstance();
  }

  /*
   * Legacy core API compatibility.
   */
  getSystemState() {
    return super.getSystemState();
  }

  registerSubsystemToKernel(moduleName, capabilitiesManifest = {}) {
    return super.registerSubsystemToKernel(
      moduleName,
      capabilitiesManifest
    );
  }
}

export default EnterpriseKernelMaster;
