# Issue #100 Functional Audit (Pre-Base44): CrewBIQ

Date: 2026-08-30  
Branch: `agent/carrier-directory-framework-line-endings` (as checked out in workspace)  
Scope: read-only audit only; no behavior changes.

## Executive summary

CrewBIQ’s current runtime is operational and most core contracts are already present across extracted modules with orchestrated bootstrap behavior in `index.html`. The largest decomposition risk is not feature completeness but sequencing risk: key flows (boot/auth restore, PTI gate, OCR upload path, and legacy inlined UI state) are highly coupled to global state and startup order.  

Recommended first slice is an extraction of identity/session orchestration with a strict interface contract before any UI-surface module splits.

## Highest-risk issues

- Bootstrap coupling: `boot()`, `restoreSession()`, and PTI gate logic are mostly in `index.html` and are sensitive to execution order.
- Inlined business logic: Links/workspace/community module remains embedded in `index.html` (load/save/filter/search/favorites flow), increasing decomposition blast radius.
- Offline boundary assumptions: service worker caches and network exception rules are well-defined, but queue drain/order guarantees rely on current call flow in `offline-sync-queue`.
- Feature-flag edge behavior: PTI gating in `boot()` can short-circuit rendering; changing load order can accidentally bypass or over-trigger blocker UI.
- Non-modularized side-effects: migration and startup migration logic are centralized in index; moving this logic without tests risks token/session migration regressions.

## Functional contract status

| Domain | Contract | Status | Evidence | Gaps / Risks |
| --- | --- | --- | --- | --- |
| Identity + auth restore | Restore from persisted token, preserve migration path, apply role-based initialization, fallback on failures | Partially implemented, stable but coupled | `core-runtime.js`, `index.html` (`restoreSession`, `applyAuthRestoreData`, `authLogin`, `authSignup`) | Must extract contract first; session migration and role transitions are high risk if reordered. |
| Service worker shell + offline baseline | Cache static app shell and API-safe routing; keep transport behavior for POST/API paths predictable | Implemented | `sw.js` (cache list, `CACHE_NAME: crewbiq-driver-v78`, `POST`/`/api/`/`/v1/` network-first/only rules), module pre-cache | Decomposition should not alter caching semantics before a full PWA contract test pass. |
| Offline queue + sync integrity | Queue mutation-only payloads, bounded storage, retry on reconnect, preserve mutation order | Implemented in dedicated module | `offline-sync-queue.js`, `sync.js`, `pti.js`, `loads.js` | Need contract tests around queue replay + bounded eviction and offline-first transitions. |
| Fleet/load data workflows | CRUD and read workflows preserved under orchestrator transport | Implemented through extracted modules | `core.js` bootstrapped module list, `sync.js`, `loads.js`, module-specific test coverage | No single-file architecture map yet for module load dependencies. |
| Expenses + company/settlement | Domain logic persists existing transport contracts and rendering expectations | Implemented (including dedicated test coverage references) | `core.js`, domain modules and existing tests for projection/restore/sync coverage | Upcoming PR #94 claims workflow overlap but is draft; decomposition must account for merge interactions. |
| OCR/document intake | File selection, base64 encode, OCR extraction via orchestrator, clear user disclosure on non-storage | Implemented and behavior-constrained in index | `index.html` upload/scan flow (`/v1/ocr/extract`, `/v1/ocr/extract/pwa`), inline “file not stored” indicators | Need explicit contract docs around file-size and failure messaging before decoupling UI. |
| PTI lifecycle | PTI eligibility check, blockers, and lifecycle transitions enforced at startup | Implemented in dedicated module plus index boot gate | `pti.js`, `index.html` (`needsPTI`, `showPTIBlocker`, `boot`) | Must preserve exact show/dismiss sequencing with role/session state. |
| Links/work links/community | CRUD of curated links, favorites, search/filter and local persistence migration | Implemented inline, not yet extracted | `index.html` (`clinks` data structure and storage handling) | No explicit module boundary yet; this is a high-priority first extraction candidate after auth/session. |
| Settings + environment + navigation contract | Route rendering + shell state + applyRoleUI behavior remain cohesive with current app bootstrap | Implemented with heavy inline control flow | `index.html` + renderAll/module setup | High coupling means any split must preserve render order and role/UI invariants. |

## Pre-decomposition fixes required

- Extract and lock an explicit startup contract: initialize order for token restore, role bootstrap, role-based UI, PTI gating, and first render.
- Add/upgrade tests for:
  - session token migration and restore edge cases (missing/expired token, role transition),
  - PTI gate transitions under unauthenticated/authenticated+ineligible states,
  - offline queue replay after reconnect and bounded-queue eviction.
- Create module-level adapter for `clinks` storage format and operations before full module cut-over.
- Document service worker contract in a dedicated ADR (cache list, network exceptions, fallback behavior).

## Safe decomposition order

1. Extract auth/session and startup orchestration behind a narrow adapter (no DOM behavior changes).
2. Extract OCR intake adapter (file pick/encode/upload/error path + payload contract).
3. Extract work-links storage module (`clinks`) with pure helpers and migration.
4. Extract offline queue contract boundaries for enqueue/replay/reporting states.
5. Re-slice remaining UI modules (PTI/fleet/loads/settings) once contracts are validated.

## Issue/PR mapping

| Artifact | Relation to audit | Status | Dependency/sequence impact |
| --- | --- | --- | --- |
| Issue #100 | Required pre-Base44 audit and decomposition-ready baseline | Open | This audit output satisfies the issue’s documentation package. |
| Issue #98 | PWA standard invoice template consistency | Open | Keep open; avoid coupling template refactor into auth/boot extraction paths until this is triaged. |
| PR #94 | Company & Settlement workflow | Draft | Potentially overlapping domain; defer merge conflict checks until after session/auth contract is stabilized. |
| PR #91 | UI refresh | Draft | Should be reapplied after core contract boundaries are in place to avoid duplicated merge churn. |
| PR #82 | Load pencil/edit fix | Draft | Low coupling but coordinate with extracted load module ownership. |
| PR #77 | Security test | Draft | Safe to run after boundary contracts are codified. |
| PR #42 | e2e local UX smoke | Draft | Useful baseline after first slice; avoid using as pre-requisite. |

## First slice recommendation

First slice: `identity/session + startup bootstrap` extracted into a small coordinator module.

Target behavior to preserve:

- Token bootstrap and restore flow order.
- Session role resolution and migration path.
- PTI eligibility checks and block/unblock semantics.
- Initial render trigger with role-based UI guard.

This minimizes blast radius while enabling subsequent independent extraction of OCR and links modules.

## Open issue watch list to monitor before deeper cuts

- `#100` (active audit context)
- `#98`
- `#97`, `#90`, `#83`, `#75`
- `#50`, `#48`, `#46`, `#45`, `#41`
- `#21`, `#20`, `#19`, `#5`, `#2`

