import {
  isDemoModeActive,
  evaluateDemoPolicy,
  assertSafeExecution,
} from '../../lib/core/demoGuard';

import { canExecuteCapability } from '../../lib/core/edition';

import {
  EXECUTION_STATE_REGISTRY,
} from '../../types/ade/execution';

import {
  evaluateVerificationRequirement,
} from '../../types/ade/verification';

import {
  ADE_MEDIA_REGISTRY,
} from '../../lib/core/mediaRegistry';

describe('ADE Block 01 — Architectural Foundation Suite', () => {

  const originalEnv = process.env.ADE_DEMO_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADE_DEMO_MODE;
    } else {
      process.env.ADE_DEMO_MODE = originalEnv;
    }
  });

  test('Demo mode activates correctly', () => {
    process.env.ADE_DEMO_MODE = 'true';

    expect(isDemoModeActive()).toBe(true);

    expect(
      evaluateDemoPolicy('FINANCIAL_EXECUTION')
    ).toBe('DEMO_BLOCKED');
  });

  test('Production delegates to production policy', () => {
    delete process.env.ADE_DEMO_MODE;

    expect(isDemoModeActive()).toBe(false);

    expect(
      evaluateDemoPolicy('FINANCIAL_EXECUTION')
    ).toBe('PRODUCTION_POLICY');
  });

  test('Demo mode blocks production side effects', () => {
    process.env.ADE_DEMO_MODE = 'true';

    expect(() =>
      assertSafeExecution('PRODUCTION_DB_MUTATION')
    ).toThrow('[ADE DEMO GUARD]');
  });

  test('Capability engine resolves FREE correctly', () => {
    expect(
      canExecuteCapability(
        { edition: 'FREE' },
        'PUBLIC_DEMO_EXPLORE'
      )
    ).toBe(true);

    expect(
      canExecuteCapability(
        { edition: 'FREE' },
        'ENTERPRISE_MULTI_ASSET'
      )
    ).toBe(false);
  });

  test('Capability engine resolves ENTERPRISE correctly', () => {
    expect(
      canExecuteCapability(
        { edition: 'ENTERPRISE' },
        'ENTERPRISE_MULTI_ASSET'
      )
    ).toBe(true);
  });

  test('Execution states contain explicit symbols', () => {
    expect(EXECUTION_STATE_REGISTRY.LIVE.symbol).toBe('✓');
    expect(EXECUTION_STATE_REGISTRY.SIMULATED.symbol).toBe('⚗');
    expect(EXECUTION_STATE_REGISTRY.CONCEPT.symbol).toBe('◌');
  });

  test('Verification remains progressive', () => {
    expect(
      evaluateVerificationRequirement(
        'INDIVIDUAL',
        'LOW'
      )
    ).toBe('UNVERIFIED');

    expect(
      evaluateVerificationRequirement(
        'ENTERPRISE',
        'CRITICAL'
      )
    ).toBe('ORGANIZATION_VERIFIED');
  });

  test('Media registry exists centrally', () => {
    expect(ADE_MEDIA_REGISTRY).toBeDefined();
  });
});
