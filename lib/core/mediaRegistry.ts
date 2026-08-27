/**
 * ADE CENTRAL MEDIA REGISTRY
 *
 * Never hard-code media directly into random React components.
 *
 * Presentation modes:
 *   CINEMATIC
 *   COMPACT
 *   INLINE
 *   PREVIEW_POSTER
 *
 * Execution semantics:
 *   LIVE
 *   SIMULATED
 *   CONCEPT
 *
 * Media assets must be resolved through this registry.
 */

export type MediaPresentationMode =
  | 'CINEMATIC'
  | 'COMPACT'
  | 'INLINE'
  | 'PREVIEW_POSTER';

export type MediaExecutionState =
  | 'LIVE'
  | 'SIMULATED'
  | 'CONCEPT';

export interface AdeMediaItem {
  id: string;
  title: string;
  product:
    | 'ADE-APEX'
    | 'ADE-PROCARTA'
    | 'ADE-AWBULI'
    | 'ADE-NEXUS'
    | 'ADE-ORACLE'
    | 'ECOSYSTEM';

  posterUrl: string;

  mediaUrl?: string;

  presentationMode: MediaPresentationMode;

  executionState: MediaExecutionState;

  isLazyLoaded: boolean;

  status:
    | 'READY'
    | 'INCOMPLETE'
    | 'CONCEPT_POSTER';
}

/**
 * IMPORTANT:
 * Only register assets that actually exist.
 *
 * The Product Theater / trailer implementation must reconcile
 * these entries against the physical repository media inventory
 * before rendering production URLs.
 */
export const ADE_MEDIA_REGISTRY: Record<
  string,
  AdeMediaItem
> = {};
