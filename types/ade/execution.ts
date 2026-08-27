/**
 * ADE EXECUTION STATE CONTRACT
 */

export type ExecutionState =
  | 'LIVE'
  | 'SIMULATED'
  | 'CONCEPT';

export interface ExecutionStateMetadata {
  label: string;
  symbol: string;
  description: string;
  badgeStyle: string;
}

export const EXECUTION_STATE_REGISTRY: Record<
  ExecutionState,
  ExecutionStateMetadata
> = {
  LIVE: {
    label: 'LIVE',
    symbol: '✓',
    description:
      'Actual ADE code and execution paths are executing.',
    badgeStyle:
      'border-emerald-500 text-emerald-400 bg-emerald-950/30',
  },

  SIMULATED: {
    label: 'SIMULATED',
    symbol: '⚗',
    description:
      'ADE workflow is executing through safe synthetic boundaries.',
    badgeStyle:
      'border-amber-500 text-amber-400 bg-amber-950/30',
  },

  CONCEPT: {
    label: 'CONCEPT',
    symbol: '◌',
    description:
      'Capability is architecturally represented but not executable.',
    badgeStyle:
      'border-slate-500 text-slate-400 bg-slate-900/40',
  },
};
