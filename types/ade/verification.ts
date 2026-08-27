/**
 * ADE PROGRESSIVE VERIFICATION / COMPLIANCE FOUNDATION
 *
 * IMPORTANT:
 * This block establishes compliance-ready architecture.
 * It does NOT prematurely force KYC/KYB/AML collection on every user.
 *
 * Verification depth should be determined by:
 * persona + capability + transaction/action risk + jurisdiction + edition.
 */

export type VerificationState =
  | 'UNVERIFIED'
  | 'EMAIL_VERIFIED'
  | 'IDENTITY_PENDING'
  | 'IDENTITY_VERIFIED'
  | 'ORGANIZATION_PENDING'
  | 'ORGANIZATION_VERIFIED'
  | 'COMPLIANCE_REVIEW'
  | 'APPROVED'
  | 'RESTRICTED'
  | 'SUSPENDED';

export type RiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export interface VerificationRequirement {
  persona: string;
  riskLevel: RiskLevel;
  requiredVerification: VerificationState;
}

export function evaluateVerificationRequirement(
  persona: string,
  actionRisk: RiskLevel
): VerificationState {

  if (actionRisk === 'LOW') {
    return 'UNVERIFIED';
  }

  if (actionRisk === 'MEDIUM') {
    return 'EMAIL_VERIFIED';
  }

  if (actionRisk === 'HIGH') {
    return 'IDENTITY_VERIFIED';
  }

  return 'ORGANIZATION_VERIFIED';
}
