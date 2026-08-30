# Handoff: Issue #100 Pre-Base44 Audit

## Current state

- Audit complete, documentation-only changes made.
- `docs/collaboration/*` artifacts now exist for the next agent.

## Immediate next steps

1. Convert issues identified in `FUNCTIONAL_AUDIT.md` into concrete sprint tasks.
2. Start first slice extraction around startup/auth/session contract.
3. Add contract tests for session restore + PTI gate behavior before refactor.
4. Re-audit after first slice and repeat table for residual in-module coupling.

Current hard dependency now documented:

- `core.js` hotfix loader chain order is the top-priority non-negotiable contract.
- `docs/collaboration/HOTFIX_LOAD_ORDER_CONTRACT.md` must be read before any module reordering.

## Acceptance checks before refactor starts

- No behavior modifications in existing index-level flows while splitting slices.
- Snapshot of token/session restore, PTI gating, and exact hotfix loader contract captured in tests.
- Service worker caching behavior unchanged during first slice.

## Watch for

- PR merge conflicts: PR #94, #91, #82, #77, #42.
- Open issue #98 alignment before template or invoice-domain rewrites.

## Exit criteria for this handoff

- If the first slice lands with tests and smoke checks green, continue with OCR and links module splits.
- If any startup regression appears, abort and restore ordering contract first.

