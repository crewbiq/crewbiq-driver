# Decomposition Decisions (Read-Only Audit Notes)

## Decision 1: Treat auth/session as the first extraction slice

- Decision: Keep startup, restore, role, and PTI gating behavior under a single coordinator facade during first split.
- Why: These flows are the highest coupling point across app modules.
- Risk if reversed: unpredictable render ordering, role mismatches, or broken PTI blockers.

## Decision 2: Preserve offline transport rules during module extraction

- Decision: Keep `sw.js` POST/API/network-only rules and cache list semantics unchanged in the first phase.
- Why: This contract impacts all feature domains and is easy to regress indirectly.
- Risk if changed early: data-loss perception, stale shell state, and broken mutation sync.

## Decision 3: Extract links/scan as adapter-style modules before full UI split

- Decision: Wrap existing inline logic in adapters with the same input/output shape (`clinks`, OCR payload/result/error states) prior to moving view concerns.
- Why: These are clear domains currently inlined in `index.html` with no module-level isolation.
- Risk if moved without adapter: persistent storage format breakages and unexpected UI regressions.

## Decision 4: Decompose no behavior in this pass

- Decision: This pass creates only docs artifacts and planning output; no runtime changes.
- Why: Issue #100 explicitly asks for a pre-decomposition audit.
- Validation requirement: no files used to alter application behavior were edited.

## Decision 5: Keep branch-local status explicit

- Decision: Record branch and issue state directly in `CURRENT_STATUS.md` for handoff.
- Why: prevents context drift and makes future agents aware of review baseline.

