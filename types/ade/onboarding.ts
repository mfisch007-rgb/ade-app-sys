/**
 * ADE SYSTEMIC ONBOARDING CONTRACT
 */

export type OnboardingPersona =
  | 'INDIVIDUAL'
  | 'SME'
  | 'DEVELOPER'
  | 'PARTNER'
  | 'COMMUNITY'
  | 'PILOT'
  | 'ENTERPRISE'
  | 'INVESTOR';

export interface OnboardingIntakePayload {
  persona: OnboardingPersona;

  identity: {
    fullName: string;
    email: string;
    organization?: string;
  };

  intent: {
    primaryUseCase: string;
    targetEdition?: string;
    expectedVolume?: string;
  };

  verificationState: string;

  consent: boolean;

  communicationPreference:
    | 'EMAIL'
    | 'DISCORD'
    | 'TELEGRAM'
    | 'WHATSAPP'
    | 'NONE';

  createdAt: string;
}
