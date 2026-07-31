# ADE REPOSITORY POLICY

-------------------------------------------------------------------------------
ADE Documentation Metadata
-------------------------------------------------------------------------------

Document: REPOSITORY_POLICY.md
Canonical ID: ADE-GOV-001
Created: 2026-07-31 18:15 WAT (UTC+1)
Last Updated: 2026-07-31 18:15 WAT (UTC+1)
Version: 1.0.0
Status: ACTIVE
Owner: ADE Architecture & Governance
Repository: ADE-APP-SYS
Branch: main
Engineering Pack: Repository Governance
Parent Document: CANONICAL_DOCUMENT_MAP.md
Related Documents:
- ADE_CONSTITUTION.md
- ENGINEERING_LAWS.md
- DOCUMENT_REGISTRY.md
- FOLDER_REGISTRY.md
- FILE_HISTORY.md
- RENAME_LOG.md
- DEPRECATION_LOG.md
Source: Documentation Normalization Phase

-------------------------------------------------------------------------------
1. PURPOSE
-------------------------------------------------------------------------------

This document defines the governing rules for the ADE repository.

Its purpose is to ensure that the repository remains consistent,
maintainable, auditable, scalable, and understandable by both humans and AI
systems.

Every contributor, engineer, reviewer, automation agent, and AI coding
assistant shall comply with these policies.

-------------------------------------------------------------------------------
2. SINGLE SOURCE OF TRUTH
-------------------------------------------------------------------------------

Every responsibility shall have exactly one canonical document.

Duplicate documents shall never become authoritative.

The canonical location for every document shall be defined in:

CANONICAL_DOCUMENT_MAP.md

-------------------------------------------------------------------------------
3. DOCUMENT CREATION POLICY
-------------------------------------------------------------------------------

No documentation file shall be created unless it has first been approved in
the active Repository Change Plan.

Every new document shall:

• have a defined purpose
• have one owner
• have one canonical location
• include ADE Documentation Metadata
• be registered in DOCUMENT_REGISTRY.md

-------------------------------------------------------------------------------
4. FOLDER CREATION POLICY
-------------------------------------------------------------------------------

Every newly created folder shall be recorded in:

FOLDER_REGISTRY.md

Each folder shall include:

• Folder Name
• Parent Folder
• Purpose
• Creation Date
• Creation Time
• Canonical Owner
• Status

-------------------------------------------------------------------------------
5. DOCUMENT METADATA POLICY
-------------------------------------------------------------------------------

Every Markdown document shall begin with the standard ADE Documentation
Metadata header.

Minimum required fields:

Document
Canonical ID
Created
Last Updated
Version
Status
Owner
Repository
Branch
Engineering Pack
Parent Document
Related Documents
Source

-------------------------------------------------------------------------------
6. CHANGE MANAGEMENT
-------------------------------------------------------------------------------

Every structural repository change shall be traceable.

The following registries are mandatory:

DOCUMENT_REGISTRY.md

FOLDER_REGISTRY.md

FILE_HISTORY.md

RENAME_LOG.md

DEPRECATION_LOG.md

ENGINEERING_PACK_INDEX.md

-------------------------------------------------------------------------------
7. RENAME POLICY
-------------------------------------------------------------------------------

Files shall never be renamed without recording:

Old Name

New Name

Reason

Date

Author

Affected Documents

All renames shall be logged inside:

RENAME_LOG.md

-------------------------------------------------------------------------------
8. DEPRECATION POLICY
-------------------------------------------------------------------------------

Deprecated files shall not be deleted immediately.

Instead they shall:

Remain in repository

Be marked Deprecated

Reference their replacement

Be recorded inside:

DEPRECATION_LOG.md

-------------------------------------------------------------------------------
9. VERSIONING POLICY
-------------------------------------------------------------------------------

Documentation shall evolve using semantic versioning.

Major

Minor

Patch

Example:

1.0.0

1.1.0

1.1.1

-------------------------------------------------------------------------------
10. ENGINEERING PACK POLICY
-------------------------------------------------------------------------------

Engineering Packs shall follow a controlled execution order.

Every Engineering Pack shall define:

Objective

Scope

Deliverables

Dependencies

Completion Criteria

Status

-------------------------------------------------------------------------------
11. GIT POLICY
-------------------------------------------------------------------------------

Major repository milestones shall be anchored using Git tags.

Examples:

DOCS-ANCHOR-YYYY-MM-DD

DOCS-MAP-YYYY-MM-DD

ARCH-V1

PLATFORM-V1

SDK-V1

-------------------------------------------------------------------------------
12. AI CONTRIBUTION POLICY
-------------------------------------------------------------------------------

AI-generated content shall not become authoritative until reviewed.

AI assistants shall:

follow repository standards

respect canonical documents

avoid duplicate files

follow engineering laws

follow repository policy

-------------------------------------------------------------------------------
13. AUDIT POLICY
-------------------------------------------------------------------------------

Periodic repository audits shall verify:

Duplicate documents

Broken references

Naming consistency

Canonical ownership

Folder organization

Metadata compliance

Registry completeness

-------------------------------------------------------------------------------
14. GOVERNING PRINCIPLE
-------------------------------------------------------------------------------

Repository organization is considered part of the system architecture.

A well-governed repository reduces technical debt, improves onboarding,
supports AI-assisted engineering, and preserves long-term maintainability.

-------------------------------------------------------------------------------
END OF DOCUMENT
-------------------------------------------------------------------------------