# CrewBIQ ROADMAP (Canonical - reconciled from legacy and current states)

## Principles

- This roadmap only includes domains already accepted or already scoped by canonical artifacts.
- It does **not** execute product behavior changes in this slice.
- Each item maps to one or more rows in [`FEATURE_REGISTRY.md`](./FEATURE_REGISTRY.md).
- `NEEDS_DECISION` items are explicitly blocked until product-owner decision.

## Phase 0 — Architecture / Documentation Stabilization (ACTIVE)

1. Complete reconciliation records in canonical docs (`PRODUCT_CONTRACT`, `FEATURE_REGISTRY`, `DOCUMENTATION_AUTHORITY`, `DEPRECATED_DECISIONS`).
   - Registry row: **Launch/Auth**, **CrewBIQ ID**, **Offline/Sync**, **Loads**, **Document Vault**.
2. Preserve loader ordering and startup contract controls before any auth/session extraction continuation.
   - Registry row: **Launch/Auth**, **Loads**.
3. Keep legacy UI/decomposition items clearly tagged as non-current.
   - Registry row: **Team**, **Marketplace**, **Community**, **Base44 redesign path**.

## Phase 1 — Preserve Safe Runtime Baseline (ACTIVE)

1. Maintain stable identity, auth, and restore behavior while hardening ambiguity-safe data paths.
   - Registry row: **CrewBIQ ID**, **Launch/Auth**, **Restore**, **Offline/Sync**.
2. Finish unresolved high-risk accounting correctness gates inherited from open legacy work.
   - Registry row: **Expenses**, **Fuel/DEF**, **Deductions**, **Service Invoice**.
3. Keep destructive actions explicit with confirmations and provenance-safe behavior.
   - Registry row: **Disputes**, **Fleet Overview**, **Settlement**, **Compliance/Audit Center**.

## Phase 2 — Document Vault + Evidence Foundation (PLANNED)

1. Implement/complete source evidence retention for OCR imports and service documents.
   - Registry row: **Document Vault**.
2. Tie OCR and maintenance ingestion to immutable source IDs and lineage markers.
   - Registry row: **OCR**, **Maintenance**.
3. Ensure all load/service workflows consume verified source IDs and avoid duplicate import accounting.
   - Registry row: **OCR**, **Service Invoice**, **Expenses**, **Disputes**.

## Phase 3 — PTI Evidence + Compliance (PLANNED)

1. Remove global mandatory PTI assumptions; enforce configurable workspace/fleet policy.
   - Registry row: **PTI**, **Weekly photo PTI**.
2. Require PTI linkage to relevant maintenance and repair evidence journeys.
   - Registry row: **PTI**, **Maintenance**.
3. Expand compliance review entry points for policy exceptions and dispute evidence.
   - Registry row: **Compliance/Audit Center**, **Disputes**.

## Phase 4 — IFTA/IRP Audit-Ready Evidence (PLANNED)

1. Add dedicated IFTA/IRP evidence domain with immutable trail and reviewability.
   - Registry row: **IFTA/IRP Evidence**.
2. Ensure settlement and fuel accounting expose audit evidence without double counting.
   - Registry row: **Service Invoice**, **Expenses**, **Disputes**, **Compliance/Audit Center**.

## Phase 5 — crewbiq.com Personal Cabinet (PLANNED)

1. Implement personal-cabinet domain with canonical identity/data layer and role/workspace boundaries.
   - Registry row: **crewbiq.com Personal Cabinet**, **CrewBIQ ID**.
2. Define stable API boundaries with orchestrator and cross-client consistency.
   - Registry row: **CrewBIQ ID**, **Offline/Sync**.

## Phase 6 — SIDR Core Integration (NEEDS_DECISION → PLANNED after approval)

1. Establish constrained SIDR API boundaries and provenance-aware governance.
   - Registry row: **SIDR Core integration**.
2. Reconcile direct AI-to-DB patterns as deprecated; allow only service-mediated integration.
   - Registry row: **SIDR Core integration**, **Compliance/Audit Center**.

## Phase 7 — Marketplace / Truckpedia / ecosystem (DEFERRED)

1. Keep truck/community marketplace concepts as deferred until canonical identity and evidence layers are complete.
   - Registry row: **Knowledge Engine / Truckpedia**, **Marketplace**, **Community**.
2. Revisit only after explicit product owner approval in subsequent slices.
   - Registry row: **Knowledge Engine / Truckpedia**.

## Sequencing justification

- This order protects runtime correctness first (identity/sync/accounting), then evidence foundations, then policy and compliance expansion, then web expansion and AI integration.
- It intentionally postpones exploratory or speculative domains (Marketplace/Truckpedia/SIDR runtime) until canonical invariants are in place.
