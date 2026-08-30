# CrewBIQ Collaboration — Current Status

## Active focus
CrewBIQ is the active product focus. SIDR Factory development is secondary unless explicitly requested.

## Primary objective
Prepare the existing CrewBIQ product for release and a high-quality UI/UX rebuild without losing working behavior, data, accounting, sync, offline capability, or future platform architecture.

## Active work item
GitHub issue #100 — Pre-Base44 architecture audit and safe frontend decomposition.

## Current phase
Phase 1: read-only product and architecture audit.

Do not begin a broad UI rewrite yet.

## Required workflow
1. Read this file.
2. Read issue #100.
3. Read FUNCTIONAL_AUDIT.md and PRODUCT_CONTRACT.md when populated.
4. Inspect current `main`; do not rely on old chat context.
5. Work only on an explicitly bounded slice.
6. State before/after behavior.
7. Run relevant existing contracts/tests.
8. Record evidence and handoff.
9. Independent review before adoption for consequential refactors.

## Roles
- ChatGPT: architecture owner, product audit, requirements reconciliation, acceptance criteria and Base44 handoff.
- Codex: bounded implementation/refactor slices with tests.
- Claude: independent architecture/code/UX-risk review of Codex slices.
- Base44: optional later UI/UX implementation, only after functional contract and safe boundaries exist.

## Product architecture direction
- One canonical identity/data layer across PWA, mobile and crewbiq.com personal cabinet.
- CrewBIQ Orchestrator remains the server authority for auth, roles/capabilities, sync and canonical APIs.
- Binary evidence belongs in file/object storage, not PostgreSQL rows.
- Document Vault preserves original OCR sources.
- PTI is configurable; fleets may require scheduled weekly photo PTI.
- IFTA/IRP Audit-Ready Evidence is a first-class compliance domain.
- Compliance/Audit Center must be able to assemble evidence packages and identify missing evidence.
- Future SIDR Core integrates through stable tools/APIs and constrained capabilities, never direct database superuser access.

## Frontend direction
The current `index.html` is too monolithic. Decompose incrementally while preserving behavior. Presentation must become replaceable without rewriting business logic. This enables either an internal redesign or a later Base44 implementation.

## Base44 decision
Base44 is NOT a mandatory dependency. The project should be prepared so that:
- if Codex + Claude + ChatGPT can reach the approved product-quality UI efficiently, Base44 may be unnecessary;
- if UI quality/speed remains below the approved Base44 prototype, Base44 can be attached later to the clean presentation layer.

## Non-negotiable safety
No broad rewrite, data-schema replacement, accounting formula change, auth/sync redesign, localStorage key breakage, or production mutation is authorized by this collaboration document.