const BLOCKED = new Set([
  "FINANCIAL_EXECUTION", "PRODUCTION_DB_MUTATION", "DESTRUCTIVE_DB_OPERATION",
  "REAL_PAYMENT_INITIATION", "MESSAGING_SEND_OUTBOUND", "EXTERNAL_API_MUTATION",
  "PRODUCTION_WEBHOOK_MUTATION", "CREDENTIAL_USAGE", "SECRET_BEARING_CALL",
  "DESTRUCTIVE_FILESYSTEM", "PRIVILEGED_ADMIN_ACTION", "IRREVERSIBLE_OPERATION"
]);

export function isDemoModeActive() { return String(process.env.ADE_DEMO_MODE).toLowerCase() === "true"; }
export function evaluateDemoPolicy(sideEffect) {
  if (!BLOCKED.has(sideEffect)) return isDemoModeActive() ? "DEMO_SIMULATED" : "PRODUCTION_POLICY";
  return isDemoModeActive() ? "DEMO_BLOCKED" : "PRODUCTION_POLICY";
}
export function assertSafeExecution(sideEffect) {
  const mode = evaluateDemoPolicy(sideEffect);
  if (mode === "DEMO_BLOCKED") throw new Error(`[ADE DEMO GUARD] '${sideEffect}' is blocked while ADE_DEMO_MODE=true.`);
  return mode;
}
export default { isDemoModeActive, evaluateDemoPolicy, assertSafeExecution };
