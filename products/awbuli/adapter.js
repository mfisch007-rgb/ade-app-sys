export class AwbuliAdapter {
  constructor() {
    this.id = "awbuli";
    this.mode = this.#detectMode();
    this.requiredConfig = [
      "AWBULI_API_URL",
      "AWBULI_API_KEY"
    ];
  }

  #detectMode() {
    const hasUrl = Boolean(process.env.AWBULI_API_URL);
    const hasKey = Boolean(process.env.AWBULI_API_KEY);
    if (hasUrl && hasKey) return "API_WEBHOOK_BRIDGE";
    return "UNCONFIGURED";
  }

  status() {
    return {
      id: this.id,
      mode: this.mode,
      configured: this.mode === "API_WEBHOOK_BRIDGE",
      requiredConfig: this.requiredConfig.filter((key) => !process.env[key]),
      note: "AWBULI external connection is only ESTABLISHED when AWBULI_API_URL and AWBULI_API_KEY are configured. Otherwise ADE uses its in-repo AWBULI Suite engine (lead capture + queued broadcast) with no external repository, database or API claim."
    };
  }

  // Never fabricate a connection. Returns a truthful readiness report.
  async connect() {
    return this.status();
  }
}