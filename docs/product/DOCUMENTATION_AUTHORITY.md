# DOCUMENTATION AUTHORITY

## Purpose

This folder (`docs/product`) is the canonical planning source for future agents.  
It reconciles legacy open work, deferred plans, and current product direction before UI decomposition or auth/session extraction work proceeds.

## Source-of-truth hierarchy

1. `docs/product/PRODUCT_CONTRACT.md`
2. `docs/product/FEATURE_REGISTRY.md`
3. Current architecture/docs references in `docs/collaboration/ARCHITECTURE.md`, `docs/collaboration/DECISIONS.md`, and migration or ADR-style docs
4. Accepted GitHub issues/PRs explicitly marked current in this repo
5. Implementation code/tests only for historical validation
6. Historical issues/PRs/ADR artifacts for context
7. Chat logs / prompts / screenshots

### Authority rule

- If a historical artifact conflicts with `PRODUCT_CONTRACT.md` or `FEATURE_REGISTRY.md`, the canonical docs in this folder are binding unless a product owner explicitly approves reversal.

## Document states and ownership

- `ACTIVE`: canonical current behavior
- `IN_PROGRESS`: partially implemented and intended
- `PLANNED`: explicitly approved but not implemented
- `SUPERSEDED`: replaced by a newer approved decision
- `DEPRECATED`: should not be considered target behavior
- `ABANDONED`: historical experiment/experiment shell not intended for continuation
- `NEEDS_DECISION`: unresolved conflict needing owner decision
- `UNKNOWN`: insufficient evidence

## Reconciliation policy

- Old feature proposals and draft PRs are retained for history and should be linked, not hidden or closed by this slice.
- Supersession/deprecation must be explained with evidence, including:
  - why the old approach existed
  - what supersedes it
  - where canonical evidence now lives
- Marketplace, Truckpedia, and SIDR references are not removed; they are represented by explicit status in the registry/roadmap.

## Maintenance expectations

- Update `FEATURE_REGISTRY.md` and `ROADMAP.md` together when direction changes.
- Do not infer behavior from labels alone; cross-check issue/PR context, implementation evidence, and product docs before changing canonical statuses.
- No direct file/code edits are required in this Slice except these docs files.
