# ADE CANONICAL DOCUMENT MAP

-------------------------------------------------------------------------------
ADE Documentation Metadata
-------------------------------------------------------------------------------

Document: CANONICAL_DOCUMENT_MAP.md
Canonical ID: ADE-DOC-REG-001
Created: 2026-07-31 18:00 WAT (UTC+1)
Last Updated: 2026-07-31 18:00 WAT (UTC+1)
Version: 1.0.0
Status: ACTIVE
Owner: ADE Architecture & Governance
Repository: ADE-APP-SYS
Branch: enterprise-modernization-v1
Engineering Pack: Repository Governance
Parent Document: INDEX.md
Related Documents:
- DOCUMENT_REGISTRY.md
- FOLDER_REGISTRY.md
- REPOSITORY_POLICY.md
- FILE_HISTORY.md
- RENAME_LOG.md
- DEPRECATION_LOG.md
Source: Documentation Normalization Phase

-------------------------------------------------------------------------------
PURPOSE
-------------------------------------------------------------------------------

This document is the Single Source of Truth (SSOT) for the location,
ownership, and responsibility of every major documentation artifact in the
ADE repository.

Every document shall have exactly one canonical location.

Duplicate documents are never considered authoritative.

If multiple copies exist, this document determines which copy is canonical.

-------------------------------------------------------------------------------
CANONICAL DOCUMENTS
-------------------------------------------------------------------------------

GOVERNANCE

Canonical:
docs/governance/ADE_CONSTITUTION.md

Owns:
ADE Constitution


Canonical:
docs/governance/PROJECT_CHARTER.md

Owns:
Project Charter


Canonical:
docs/governance/VISION_AND_MISSION.md

Owns:
Vision
Mission


Canonical:
docs/governance/FOUNDER_PRINCIPLES.md

Owns:
Founder Principles


Canonical:
docs/engineering/laws/ENGINEERING_LAWS.md

Owns:
Engineering Laws


Canonical:
docs/governance/REPOSITORY_POLICY.md

Owns:
Repository Policies


-------------------------------------------------------------------------------

ARCHITECTURE

Canonical:
docs/architecture/kernel/KERNEL_BIBLE.md

Owns:
Kernel Architecture


Canonical:
docs/architecture/platform/PLATFORM_BIBLE.md

Owns:
Platform Architecture


Canonical:
docs/architecture/SYSTEM_ARCHITECTURE.md

Owns:
System Architecture


Canonical:
docs/architecture/PRODUCT_ARCHITECTURE.md

Owns:
Product Architecture


Canonical:
docs/architecture/EVENT_ARCHITECTURE.md

Owns:
Event Architecture


-------------------------------------------------------------------------------

PLATFORM

Canonical:
docs/platform/PLATFORM_OVERVIEW.md

Owns:
Platform Overview


Canonical:
docs/platform/oracle/ORACLE_PLATFORM.md

Owns:
Oracle Platform


Canonical:
docs/platform/kernel/KERNEL_PLATFORM.md

Owns:
Kernel Runtime


Canonical:
docs/platform/knowledge/KNOWLEDGE_ENGINE.md

Owns:
Knowledge Engine


Canonical:
docs/platform/ai-workforce/AI_WORKFORCE.md

Owns:
AI Workforce


Canonical:
docs/platform/eventops/EVENTOPS.md

Owns:
EventOps


Canonical:
docs/platform/knowops/KNOWOPS.md

Owns:
KnowOps


Canonical:
docs/platform/growth-engine/GROWTH_ENGINE.md

Owns:
Growth Engine


-------------------------------------------------------------------------------

SDK

Canonical:
docs/sdk/SDK_OVERVIEW.md

Owns:
SDK Overview


Canonical:
docs/sdk/API_GUIDE.md

Owns:
Developer Guide


Canonical:
docs/sdk/api/API_SPEC.md

Owns:
API Specification


Canonical:
docs/sdk/api/API_REFERENCE.md

Owns:
API Reference


Canonical:
docs/sdk/plugins/PLUGIN_SDK.md

Owns:
Plugin SDK


Canonical:
docs/sdk/adapters/ADAPTER_SDK.md

Owns:
Adapter SDK


-------------------------------------------------------------------------------

ENGINEERING

Canonical:
docs/engineering/CODING_STANDARDS.md

Canonical:
docs/engineering/NAMING_CONVENTIONS.md

Canonical:
docs/engineering/REPOSITORY_STRUCTURE.md

Canonical:
docs/engineering/VERSIONING_POLICY.md


-------------------------------------------------------------------------------

ROADMAP

Canonical:
docs/roadmap/master/MASTER_ROADMAP.md

Canonical:
docs/roadmap/master/MASTER_EXECUTION_ROADMAP.md

Canonical:
docs/roadmap/master/MASTER_PHASE_INDEX.md

Canonical:
docs/roadmap/master/MASTER_DELIVERABLES.md


-------------------------------------------------------------------------------

MEDIA

All Media Bibles inside:

docs/media/


-------------------------------------------------------------------------------

ENGINEERING PACKS

Canonical Naming Convention:

ENGINEERING_PACK_001.md
ENGINEERING_PACK_002.md
ENGINEERING_PACK_003.md

Legacy descriptive pack names shall remain temporarily until migration is
complete.

-------------------------------------------------------------------------------

NORMALIZATION RULES

1. One document = One responsibility.

2. One responsibility = One canonical document.

3. Duplicate documents are deprecated rather than deleted until migration is
complete.

4. Every new document shall first be registered in:
   DOCUMENT_REGISTRY.md

5. Every new folder shall first be registered in:
   FOLDER_REGISTRY.md

6. Every rename shall be recorded in:
   RENAME_LOG.md

7. Every removal shall be recorded in:
   DEPRECATION_LOG.md

8. Every document shall include the standard ADE Documentation Metadata header.

9. No document shall be created outside the approved Repository Change Plan.

10. This document is the authoritative map for the ADE documentation system.

-------------------------------------------------------------------------------
END OF DOCUMENT
-------------------------------------------------------------------------------
- SERVICES.md (ID: ADE-ARCH-SERVICES-001) | Owner: ADE Platform Architecture