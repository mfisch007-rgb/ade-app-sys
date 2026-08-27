/**
 * ADE SERVER-AUTHORITATIVE DEMO GUARD
 */

export type SideEffectType =
  | 'FINANCIAL_EXECUTION'
  | 'PRODUCTION_DB_MUTATION'
  | 'DESTRUCTIVE_DB_OPERATION'
  | 'REAL_PAYMENT_INITIATION'
  | 'MESSAGING_SEND_OUTBOUND'
  | 'EXTERNAL_API_MUTATION'
  | 'PRODUCTION_WEBHOOK_MUTATION'
  | 'CREDENTIAL_USAGE'
  | 'SECRET_BEARING_CALL'
  | 'DESTRUCTIVE_FILESYSTEM'
  | 'PRIVILEGED_ADMIN_ACTION'
  | 'IRREVERSIBLE_OPERATION';

export type PolicyEvaluationMode =
  | 'DEMO_BLOCKED'
  | 'DEMO_SIMULATED'
  | 'DEMO_SANDBOX'
  | 'PRODUCTION_POLICY';

export function isDemoModeActive(): boolean {
  return process.env.ADE_DEMO_MODE === 'true';
}

export function evaluateDemoPolicy(
  sideEffect: SideEffectType
): PolicyEvaluationMode {

  if (isDemoModeActive()) {
    return 'DEMO_BLOCKED';
  }

  return 'PRODUCTION_POLICY';
}

export function assertSafeExecution(
  sideEffect: SideEffectType
): void {

  const mode = evaluateDemoPolicy(sideEffect);

  if (mode === 'DEMO_BLOCKED') {
    throw new Error(
      `[ADE DEMO GUARD] Side-effect '${sideEffect}' is strictly BLOCKED when ADE_DEMO_MODE=true.`
    );
  }
}
