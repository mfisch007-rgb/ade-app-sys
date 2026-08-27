/**
 * ADE DESIGN SYSTEM
 * Document Ref: ADE-ARCH-2026-BLOCK01
 */

export const ADE_DESIGN_TOKENS = {
  colors: {
    surfaces: {
      deepVoid: '#020617',
      slateCommand: '#0f172a',
      cardSurface: '#1e293b',
    },
    accents: {
      oceanBlue: '#1e3a8a',
      electricCyan: '#38bdf8',
      royalCoral: '#ef4444',
      crystalWhite: '#f8fafc',
    },
    status: {
      live: '#10b981',
      simulated: '#f59e0b',
      concept: '#64748b',
    },
  },

  typography: {
    fontFamilyMono: 'JetBrains Mono, Menlo, monospace',
    fontFamilySans: 'Inter, system-ui, sans-serif',
  },

  accessibility: {
    wcagTarget: 'AA',
    contrastRatioMin: 4.5,
    nonColorIndicatorsRequired: true,
  },
} as const;

export type AdeDesignTokens = typeof ADE_DESIGN_TOKENS;
