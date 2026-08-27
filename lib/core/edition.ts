import type { AdeEdition, AdeCapability } from "../../types/ade/edition.ts";
import { EDITION_CAPABILITY_MATRIX } from '../../types/ade/edition.ts';

/**
 * ADE CAPABILITY-ORIENTED ENTITLEMENT RESOLVER
 *
 * Identity/Persona
 *      ↓
 * Edition / Entitlement
 *      ↓
 * Capability
 *      ↓
 * Policy Decision
 */

export function canExecuteCapability(
  identityContext: { edition: AdeEdition },
  capability: AdeCapability
): boolean {

  const allowedCapabilities =
    EDITION_CAPABILITY_MATRIX[identityContext.edition] || [];

  return allowedCapabilities.includes(capability);
}
