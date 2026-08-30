# DOCUMENTATION AUTHORITY

## Purpose

This folder (`docs/product`) is the canonical planning source for future agents.  
It reconciles legacy open work, deferred plans, and current product direction before UI decomposition or auth/session extraction work proceeds.

## Source-of-truth hierarchy

### TRACK A — IMPLEMENTED BEHAVIOR TRUTH

Authoritative evidence for what CrewBIQ actually does today:

1. current GitHub main
2. implementation-level tests/contracts that cover behavior
3. verified production/staging evidence where available
4. current architecture analysis of shipped code paths

This track is used to set feature `Status`, `Current behavior`, and `Current behavior` columns in canonical tables.

### TRACK B — PRODUCT INTENT TRUTH

Authoritative source for what CrewBIQ is intended to become:

1. `docs/product/PRODUCT_CONTRACT.md`
2. `docs/product/FEATURE_REGISTRY.md`
3. `docs/product/ROADMAP.md`
4. accepted current product decisions/issues explicitly approved for implementation
5. architecture target docs

This track is used to set `Current approved direction`, `Next action`, and planning status.

### Truth coupling rule

- `Approved requirement` does **not** mean `implemented`.
- `Implemented behavior` does **not** mean `approved long-term behavior`.
- If an artifact conflict exists between Track A and Track B, prefer the explicit canonical Track A/Track B evidence as described above before making changes.

### Authority rule

- If a historical artifact conflicts with Track B requirements, Track A evidence must be checked first before reclassifying behavior. 
- A historical artifact conflicts with Product direction only when it conflicts with both the current implementation truth and the approved intent truth.
- If Track A and Track B disagree, classify the feature state explicitly and request a product decision rather than inferring behavior from prose alone.

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
- Historical material is evidence only until canonicalized here.
- Supersession/deprecation must be explained with evidence, including:
  - why the old approach existed
  - what supersedes it
  - where canonical evidence now lives
- Marketplace, Truckpedia, and SIDR references are not removed; they are represented by explicit status in the registry/roadmap.

## Maintenance expectations

- Update `FEATURE_REGISTRY.md` and `ROADMAP.md` together when direction changes.
- Do not infer behavior from labels alone; cross-check issue/PR context, implementation evidence, and product docs before changing canonical statuses.
- No direct file/code edits are required in this Slice except these docs files.
