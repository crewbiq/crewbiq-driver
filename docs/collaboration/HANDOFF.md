# Handoff: Issue #100 Pre-Base44 Audit

## Slice 2A handoff

Slice 2A contract-pins current Links behavior after the accepted URL-safety correction. Links is ACTIVE; page-community/renderCommunity is only the current technical container; historical Community and future Marketplace concepts do not own clinks data.

Readiness is READY_FOR_LINKS_EXTRACTION with no blocking findings. The proposed Slice 2B boundary is a global-compatible links.js module owning clinks storage/migration, URL policy, render state, and CRUD behind temporary compatibility shims. page-community markup, route, role entries, static controls, and mount point must remain until a later UI-shell slice.

Next actor: Claude. Do not begin Slice 2B before independent review and explicit authorization.

## Slice 1B handoff

startup-session.js now owns the bounded startup/session coordinator flow while consuming existing transport, restore, PTI, fleet, storage, and rendering contracts through injected dependencies. Existing callers continue through restoreSession(), boot(), and showApp() compatibility functions in index.html.

The core.js hotfix loader chain is unchanged. The coordinator loads as a normal script after the existing domain modules and is cached in the PWA app shell. logoutDevice() intentionally remains inline because extracting it would pull pay, archive, role, and continuity-storage behavior into this slice.

Next actor: Claude. Next bounded action: independent Slice 1B review. Do not begin the next decomposition slice before that verdict.

## Slice 1A.1 handoff

The ambiguous first-truck fallback is removed. Explicit valid assignment wins; invalid explicit assignment fails closed; zero or multiple trucks without assignment resolve no truck; exactly one active truck is retained as unambiguous only when no explicit assignment exists.

Read projections remain null-safe. Existing load/fuel/service/deduction selectors now surface `Truck assignment required`, and mutation paths refuse unresolved writes. Claude should independently review the call-site inventory, corrected-behavior tests, single-truck policy, and service-worker cache rotation.

Slice 1B readiness is `READY_FOR_SLICE_1B`, contingent on Claude accepting Slice 1A.1. Do not begin Slice 1B before that review.

## Slice 1A handoff

Slice 1A establishes a behavior-contract baseline without extracting or changing auth/session/startup runtime code. Claude should independently review the evidence classifications, source-order assertions, and coverage inventory.

Readiness is `NOT_READY_FOR_SLICE_1B`. The blocker is `AMBIGUOUS_FIRST_TRUCK_FALLBACK`: current `getDefaultTruck()` can select `activeTrucks()[0]` when assignment is ambiguous. This is documented as `KNOWN_UNSAFE_CURRENT_BEHAVIOR`, not behavior to preserve.

If Slice 1A is accepted, the next bounded action is Slice 1A.1: remove the ambiguous fallback safely, add explicit ambiguity handling, and contract-test the corrected behavior. Do not begin auth/session extraction in that slice.

## Canonical documentation correction pass

The canonical product documentation has been corrected against Claude's review findings and is ready for independent re-review. The next actor is Claude. Do not start decomposition, auth/session extraction, or Slice 1 until that review is complete.

Scope was documentation-only: no runtime/product code, tests, CI, deployment, issues, or pull requests were changed.

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

