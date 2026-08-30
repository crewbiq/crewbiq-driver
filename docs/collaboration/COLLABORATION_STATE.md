# CrewBIQ Collaboration State

This is the single durable coordination entry point for ChatGPT, Codex, and Claude. GitHub is authoritative; chat history is supplementary.

## Coordination rules

Every agent MUST follow this protocol.

### BEFORE WORK

1. Read the live state bounded by the `CURRENT_START` and `CURRENT_END` marker names.
2. Replace only the content between those markers with the active task state.
3. Set Status to `IN_PROGRESS`, Current owner to the active agent, and Next required actor to that agent/current task.

### AFTER PUBLICATION

1. Replace only the content between the `CURRENT_START` and `CURRENT_END` marker names with the new authoritative state.
2. Append a historical entry below the `HISTORY_START` marker.
3. Never update HISTORY without updating CURRENT.
4. Never append a new status only to the bottom of the file.
5. CURRENT always wins over HISTORY for coordination.

Agents must replace ONLY content between `CURRENT_START` and `CURRENT_END`. Never search/replace on the first occurrence of "## CURRENT".

If an agent cannot update CURRENT, the task is NOT considered published.

Keep CURRENT concise and normally under approximately 30 lines. Long explanations, audit narratives, and full test logs belong in HISTORY, WORK_LOG.md, or review documents.

### ChatGPT check rule

When the user says "готово", ChatGPT should:

1. Read the live marked CURRENT block.
2. Inspect the latest commits on the collaboration branch.
3. If commits are newer than CURRENT, reconcile them before responding.
4. Never rely only on stale history headings.

<!-- CURRENT_START -->
## CURRENT

Phase: Slice 2A.0 — Links URL Safety Correction
Status: IN_PROGRESS
Current owner: Codex
Branch: agent/pre-base44-audit
Product truth: current main
Latest implementation commit: f85038747037e4bf3c625064a660df552db294c9
Latest correction commit: fdd6902de35ddc9760bd2285966ebe300b654509
Latest review commit: 5af4de0c5dd39296aa8e6643462a4ed459da7031
Latest state commit: a711da14d21519a850e2c34bee1dd9c43c4c0b87
Blocking findings: UNSAFE_LINK_URL_SCHEME_ACCEPTANCE
Queued non-blocking findings:
- resolveDefaultTruck case/whitespace sensitivity
- deduction-template save branch without truckId guard
- cosmetic `}function boot()` formatting artifact
Next required actor: Codex
Next bounded action: apply bounded URL validation correction and tests
<!-- CURRENT_END -->

<!-- HISTORY_START -->
## HISTORY
### Codex
- Task: Legacy Roadmap & Documentation Reconciliation
- Status: PUBLISHED / AWAITING REVIEW
- Commit: `e8822806713d2c3644880d1c88f3c603ffe7e029`
- Branch: `agent/pre-base44-audit`
- Output: canonical docs under `docs/product/`

### Claude
- Agent: Claude
- Task: Canonical Documentation Reconciliation Review
- Verdict: NEEDS FIX
- Branch: `agent/pre-base44-audit`
- Commit SHA: `7cc255d07e2d1b5c204e2a1111bd2437420fbb9c` (appended review section to `docs/collaboration/CLAUDE_REVIEW.md`; Codex commit reviewed was `e8822806713d2c3644880d1c88f3c603ffe7e029`)
- Files/artifacts reviewed: `docs/product/{PRODUCT_CONTRACT,FEATURE_REGISTRY,ROADMAP,DEPRECATED_DECISIONS,DOCUMENTATION_AUTHORITY,LEGACY_ARTIFACT_MATRIX}.md`; cross-checked against `docs/collaboration/{CLAUDE_REVIEW,FUNCTIONAL_AUDIT,ARCHITECTURE,CURRENT_STATUS}.md`, current `main` code (`index.html`, `pti.js`, `manifest.json`, `package.json`), and live GitHub issue/PR state across `crewbiq-driver`, `crewbiq-docs`, `crewbiq-orchestrator`.
- Blocking findings (4): (B1) Document Vault marked `IN_PROGRESS` but confirmed 0% implemented — UI explicitly states source files are "not stored"; should be `PLANNED`. (B2) "Weekly photo PTI" conflates a real, working weekly-schedule mechanism (`ptiSchedule`, Monday auto-detect, confirmed in `pti.js`) with photo-evidence capture, which has zero code anywhere (no `photo`/`camera`/`image` reference found) — needs to be split or footnoted. (B3) "Community" row states "no active community surface in runtime," which is false — `page-community`/`renderCommunity()` is the live technical container for the `ACTIVE` Links feature; needs an explicit non-removal caveat. (B4) `DOCUMENTATION_AUTHORITY.md` doesn't separate PRODUCT INTENT authority from IMPLEMENTED BEHAVIOR authority, which is the root cause of B1/B2.
- Positive finding: Slice 0/0b CI-wiring closure claimed in this file was independently re-verified TRUE — `tests/hotfix-load-order-contract.test.mjs` is now wired into both `package.json` and `.github/workflows/pwa-auth-contract.yml` on this branch.
- Next required actor: Codex (or ChatGPT as coordinator) to apply the 8 recommended corrections listed in `CLAUDE_REVIEW.md`'s "Canonical Documentation Reconciliation Review" section.
- Next bounded action: Docs-only correction pass on the 4 blocking findings (B1–B4) in `docs/product/FEATURE_REGISTRY.md` and `docs/product/DOCUMENTATION_AUTHORITY.md`, plus the non-blocking cleanups (Mobile packaging disclaimer, `LEGACY_ARTIFACT_MATRIX.md` #29 citation, Marketplace status re-examination, CI step style normalization). No code, no decomposition, no auth/session work until this lands and canonical docs are re-reviewed.

### Codex — Canonical Documentation Correction Pass
- Agent: Codex
- Task: Canonical Documentation Correction Pass
- Status: REVIEWED — see Claude re-review entry below
- Branch: `agent/pre-base44-audit`
- Correction commit SHA: `41aeb7e`
- Files/artifacts corrected: canonical product documentation and collaboration status/handoff/work-log records.
- Blocking findings addressed: B1 Document Vault status and storage pipeline; B2 PTI scheduling/photo-evidence split; B3 active Links technical-container non-removal caveat; B4 two-track documentation authority.
- Additional corrections: mobile packaging evidence disclaimer, exact `crewbiq-docs` issue #29 citation, Marketplace legacy-shell/future-concept separation, and issue #21 reconciliation.
- CI step style normalization remains deferred to a future appropriate slice; CI was not modified.
- Scope confirmation: documentation only; no product/runtime code, tests, CI, deployment, issues, or pull requests changed — independently re-verified by Claude.

### Claude — Canonical Documentation Re-Review
- Agent: Claude
- Task: Canonical Documentation Re-Review
- Verdict: NEEDS FIX
- Reviewed commit: `41aeb7e` (`41aeb7ec05a4ab5a34847128ab7f08a3b1267ba7`)
- Review commit SHA: `2ef2090b8aeefc71c0196dff6866ffe09c2d94bf` (appended re-review section to `docs/collaboration/CLAUDE_REVIEW.md`)
- Blocking findings: B1 RESOLVED. B2 RESOLVED. B3 RESOLVED. B4 RESOLVED. One residual item carried forward from the prior addendum (B5, not part of the original B1–B4 scope): `LEGACY_ARTIFACT_MATRIX.md`'s "Issue #90" and "PR #91" rows still recommend `DEPRECATE` for guardrailed, contract-compliant, currently-open Base44-visual-refresh work — status was actually moved further in the wrong direction (`NEEDS_DECISION` → `DEPRECATED`) despite this finding being published 39 minutes before the correction commit landed. Recommended fix: reclassify both rows to `IN_PROGRESS`. This is a two-row edit, not a framework-level problem.
- Canonical documentation gate: OPEN (pending the single Issue #90 / PR #91 row correction; all other reviewed content, including two fixes beyond what was strictly asked — mobile packaging disclaimer and a pre-existing #29/#32 issue-citation mix-up — is gate-ready).
- Next required actor: ChatGPT
- Next bounded action: apply the Issue #90 / PR #91 status correction in `LEGACY_ARTIFACT_MATRIX.md` (docs-only, two table cells), then close the documentation gate. No code, no decomposition, no auth/session work, no Slice 1 until that lands and is confirmed.

### Codex — Final B5 Documentation Gate Correction
- Agent: Codex
- Task: Final B5 Documentation Gate Correction
- Status: PUBLISHED / READY FOR GATE CLOSURE
- Branch: `agent/pre-base44-audit`
- Commit SHA: `efba9423de3c992cbbf3a4715d11eef497741ba9`
- Correction: Issue #90 + PR #91 → `IN_PROGRESS`
- Preserved distinction: the Base44-inspired approved visual/product direction is in progress; mandatory Base44 runtime migration/dependency is not required and is superseded; existing CrewBIQ business logic, canonical data, and architecture remain authoritative.
- Next required actor: ChatGPT
- Next bounded action: verify correction and close canonical documentation gate
- Scope confirmation: only `docs/product/LEGACY_ARTIFACT_MATRIX.md` and this collaboration state were changed; no code, tests, CI, package, issues, or PRs were modified.

### Codex — Slice 1A Auth/Session/Startup Baseline
- Agent: Codex
- Task: Slice 1A — Auth/Session/Startup Behavior Contract Baseline
- Status: PUBLISHED / AWAITING CLAUDE REVIEW
- Branch: `agent/pre-base44-audit`
- Commit SHA: `c8aaf45b207064fbd9db93a96ab73a539a1fa0ed`
- Files changed: `docs/collaboration/AUTH_SESSION_STARTUP_CONTRACT.md`, `docs/collaboration/CURRENT_STATUS.md`, `docs/collaboration/WORK_LOG.md`, `docs/collaboration/HANDOFF.md`, `tests/auth-session-startup-contract.test.mjs`, `package.json`, and this state record.
- Tests added/updated: added `tests/auth-session-startup-contract.test.mjs`; wired it into `npm run test:e2e:tooling` in `package.json`.
- Test result: `node --test tests/auth-session-startup-contract.test.mjs` — PASS, 5 tests, 0 failures, 0 skipped.
- Runtime files changed: NONE
- Slice 1B readiness: `NOT_READY_FOR_SLICE_1B`
- Blocking unknowns / blockers: `AMBIGUOUS_FIRST_TRUCK_FALLBACK`
- Classification: `activeTrucks()[0]` is `KNOWN_UNSAFE_CURRENT_BEHAVIOR`, not an approved behavior invariant.
- Next required actor: Claude
- Next bounded action: independent Slice 1A review, followed by Slice 1A.1 if accepted
- Slice 1A.1 boundary: remove ambiguous first-truck fallback safely, add explicit ambiguity handling, and contract-test corrected behavior; do not extract auth/session/startup.

### Claude — Slice 1A Independent Review
- Agent: Claude
- Task: Slice 1A Independent Review
- Verdict: ACCEPT
- Reviewed commit: `c8aaf45b207064fbd9db93a96ab73a539a1fa0ed`
- Review commit SHA: `60a351c4cc6741d3a6fb96b3485ddecff534025a` (appended review section to `docs/collaboration/CLAUDE_REVIEW.md`)
- Method: read every function `AUTH_SESSION_STARTUP_CONTRACT.md` and the new test cite directly from `main`'s `index.html`/`core-runtime.js` and byte-compared against the claims (startup init order, `restoreSession()`, `boot()`/`showApp()`, `logoutDevice()`, `getDefaultTruck()`/`activeTrucks()[0]`, role-persistence keys, no-`sessionStorage`-dependency) — every claim checked matched `main` exactly.
- Blocking findings: none.
- Non-blocking: the contract doesn't surface an existing code comment in `logoutDevice()` noting the "switch" identity-transition classification is effectively dead code (only "initial" ever fires in the shipped UI); doesn't affect correctness of the contract's observable-behavior claims, just worth knowing for a future slice.
- Confirmed: no runtime/product files changed (docs + `package.json` one-line addition + new test file only); test correctly wired into `test:e2e:tooling` from the same commit; `activeTrucks()[0]` correctly classified `KNOWN_UNSAFE_CURRENT_BEHAVIOR` and excluded from `PRESERVE_IN_EXTRACTION`; no additional unsafe behavior found that should newly block Slice 1B.
- Slice 1A: CLOSED
- Slice 1B readiness: NOT_READY — blocked on `AMBIGUOUS_FIRST_TRUCK_FALLBACK`, correctly identified; Slice 1A.1 (remove the fallback, add explicit ambiguity handling + corrected-behavior contract tests, no auth/session/startup extraction) is the correct next bounded step.
- Next required actor: ChatGPT
- Next bounded action: authorize Slice 1A.1 (ambiguous first-truck fallback fix) as the next bounded implementation slice; Slice 1B remains blocked until Slice 1A.1 lands and is independently re-reviewed.

### Claude — Slice 1A.1 Independent Review
- Agent: Claude
- Task: Slice 1A.1 Independent Review
- Verdict: ACCEPT
- Reviewed commit: `f16534a009fc2e84e14509ddd87b473dfd05425f`
- Review commit SHA: `20826de65529e7993eba6b66b5616d8534a0c0ed` (appended review section to `docs/collaboration/CLAUDE_REVIEW.md`)
- Method: fetched `index.html`, `loads.js`, `sw.js`, `fleet-load-resolution.js`, and both test files directly from this commit and traced every changed mutation/selector/read-only-projection call-site, plus a broader search of `fleet-load-resolution.js` (unchanged, checked anyway) for any residual first-truck fallback.
- Blocking findings: none.
- Non-blocking findings: (1) `resolveDefaultTruck()`'s explicit-assignment match is case/whitespace-sensitive, unlike `findTruckByIdOrUnit()` used everywhere else — fails safe (blocks rather than misattributes) but is a real functional-regression risk for a driver/truck unit-number pair differing only by case; recommend it call `findTruckByIdOrUnit()` directly. (2) `saveDedModal()`'s template-save branch has no `!truckId` guard (its sibling current-week-deduction branch does) — low severity, no financial-mutation hazard, just an unscoped "generic" template saved instead of blocked. (3) The new `unresolvedTruck:true` sentinel flag on `getCurrentWeekDed()` isn't yet consumed by any rendering — harmless, currently inert.
- Confirmed: old `activeTrucks()[0]` fallback (and a second, previously-unnoticed `|| trucks[0]` fallback in `renderTruckSelect`) fully removed at every call-site; every mutation path (fuel/service/deduction/load save) fails closed instead of silently mutating against the wrong truck; new test proves the core resolver via real execution (not string matching); CI/npm wiring landed in the same commit, including a valuable side-fix (`index.html`/`loads.js` added to the workflow's path-filter triggers, which were previously missing); cache-version bump v79→v80 correctly justified and complete; no loader-order or auth/session code touched.
- Slice 1A.1: CLOSED
- Slice 1B readiness: READY_FOR_SLICE_1B — independently confirmed, not merely accepted on Codex's self-assessment.
- Next required actor: ChatGPT
- Next bounded action: authorize Slice 1B. Optionally queue the two non-blocking follow-ups (case-sensitivity harmonization in `resolveDefaultTruck`, the unguarded template-save branch) as a small future cleanup — neither blocks Slice 1B.

### Codex — Slice 1B Auth/Session/Startup Coordinator Extraction
- Agent: Codex
- Task: Slice 1B — Auth/Session/Startup Coordinator Extraction
- Status: IN_PROGRESS
- Branch: `agent/pre-base44-audit`
- Boundary: orchestration extraction only; no auth, identity, role, PTI, loader, storage, or product redesign.

### ChatGPT
- Role: architecture/product coordinator and reconciliation authority
- Next action: read this file plus the latest Claude/Codex artifacts after user says only `готово`.

### Slice 1B publication

- Agent: Codex
- Task: Slice 1B Auth / Session / Startup Coordinator Extraction
- Status: PUBLISHED / AWAITING CLAUDE REVIEW
- Branch: agent/pre-base44-audit
- Commit SHA: this publication commit; exact SHA is reported in the Codex handoff response
- Result: SLICE_1B_COMPLETE
- Runtime files changed: index.html, startup-session.js, sw.js
- Runtime files explicitly unchanged: core.js, hotfix files, auth transport, offline queue, PTI internals, business logic, and schemas
- Validation: 41 passed, 0 failed
- Slice 1B readiness: COMPLETE
- Blocking unknowns: NONE
- Next required actor: Claude
- Next bounded action: independent Slice 1B review
- Deferred and not fixed: resolveDefaultTruck case/whitespace sensitivity; unguarded deduction-template save

### Slice 1B Blocking Correction

- Agent: Codex
- Task: Slice 1B Blocking Correction
- Status: PUBLISHED / AWAITING CLAUDE REVIEW
- Branch: agent/pre-base44-audit
- Correction commit SHA: fdd6902de35ddc9760bd2285966ebe300b654509
- Composition guard commit SHA: b9d49cc12c6f518a3c05b46159f7068787376adf
- Malformed restoreSession fixed: YES; index.html now contains only the compatibility shim
- Duplicate PTI/showApp routing fixed: YES; startup-session.js boot is the single owner
- Parse smoke added: tests/index-startup-composition.test.mjs using node:vm
- Composition guards: one PTI decision, one showApp, one scheduleAutoSync, and one delayed pull
- Exact tests: node --test tests/auth-session-startup-contract.test.mjs tests/startup-session-coordinator.test.mjs tests/index-startup-composition.test.mjs tests/first-truck-fallback.test.mjs tests/hotfix-load-order-contract.test.mjs tests/.slice1b-correction-runtime-contract.mjs tests/full_restore_transport.test.mjs tests/settings_restore_transport.test.mjs tests/driver_projections.test.mjs tests/e2e/service-worker-path.test.mjs
- Test result: 44 passed, 0 failed, 0 skipped
- Cache version: crewbiq-driver-v82; rotated because corrected index.html is cache-first and published v81 clients must receive it
- Behavior differences: NONE intended
- Next required actor: Claude
- Next bounded action: independent review of the Slice 1B blocking correction

### Claude — Slice 1B Independent Review

- Agent: Claude
- Task: Slice 1B Independent Review
- Verdict: ACCEPT
- Reviewed final state: `54655e461c3357f9e6af07bf2f2145f5d7bfe84e`
- Original extraction: `f85038747037e4bf3c625064a660df552db294c9`
- Blocking correction: `fdd6902de35ddc9760bd2285966ebe300b654509`
- Review commit SHA: `5af4de0c5dd39296aa8e6643462a4ed459da7031` (appended review section to `docs/collaboration/CLAUDE_REVIEW.md`)
- Method: fetched `index.html`, `startup-session.js`, `loads.js`, `sw.js`, `core.js`, `package.json`, and all four relevant test files directly from the final composed commit (not the original extraction in isolation); ran the extracted inline script and `startup-session.js` through Node's own parser independently of the repo's own test; diffed the complete `index.html` and `loads.js` against the Slice 1A.1 baseline to see the full change surface; independently inspected the original uncorrected extraction commit to confirm the actual bugs the correction fixed.
- Blocking findings: none.
- Non-blocking findings: a cosmetic formatting artifact (`}function boot(){...}` on one line, no functional effect, confirmed via parse checks) left over from the mechanical edit process; the two previously-flagged Slice 1A.1 non-blocking items (case-sensitivity in `resolveDefaultTruck`, unguarded template-save branch) remain unchanged, carried forward, not newly introduced.
- Confirmed: original extraction's real bug (leftover `if(needsPTI()){showPTIBlocker();}else{showApp();}` line still inside `renderStartupShell()`, causing duplicate PTI/showApp/auto-sync/pull routing on every `boot()` call, plus a malformed dangling-token `restoreSession` shim) is genuinely fixed in the final state, and the fix is backed by real `node:vm`-executed tests (not string matching) that would catch a regression of either issue. Complete diffs confirm index.html changes are scoped to exactly 4 locations plus one new `<script src>` tag; `loads.js` is byte-identical to the Slice 1A.1 baseline; `core.js` is byte-identical to `main`; logout, first-truck-fallback fix, role/identity keys, and offline/network-only SW rules are all untouched. Cache version correctly rotated v80→v81→v82 across the chain, `startup-session.js` present in `APP_SHELL`.
- Slice 1B: CLOSED
- Next required actor: ChatGPT
- Next bounded action: authorize the next decomposition slice — recommend Links/`clinks` storage-and-render extraction (self-contained, no auth/session/PTI/accounting coupling, no open product dependency like OCR's Document Vault gap) over an OCR-adapter extraction next.
### Codex — Collaboration State v2

- Agent: Codex
- Task: Collaboration State v2 documentation/coordination refactor
- Status: PUBLISHED
- Branch: `agent/pre-base44-audit`
- Scope: `docs/collaboration/COLLABORATION_STATE.md` only
- Result: one authoritative `CURRENT` block and append-only `HISTORY`; no runtime/product files changed
- Next required actor: ChatGPT
- Next bounded action: use `CURRENT` as the sole coordination state and authorize the next bounded slice when ready

### Codex — Slice 2A started

- Agent: Codex
- Task: Slice 2A — Links / clinks Behavior Contract + Extraction Readiness
- Status: IN_PROGRESS
- Branch: `agent/pre-base44-audit`
- Scope: behavior discovery, ownership mapping, contract documentation, and deterministic tests only; no runtime extraction
- Next required actor: Codex
- Next bounded action: map and contract-pin live Links behavior before extraction

### Codex — Slice 2A discovery stopped on unsafe URL handling

- Agent: Codex
- Task: Slice 2A — Links / clinks Behavior Contract + Extraction Readiness
- Status: BLOCKED / COORDINATOR DECISION REQUIRED
- Branch: `agent/pre-base44-audit`
- Finding: `normalizeLinkUrl()` explicitly recognizes HTTP(S), `tg:`, `mailto:`, and bare domains, but returns every other non-empty value unchanged; `renderCommunity()` writes the normalized value to a clickable anchor `href`.
- Additional evidence: an empty value normalizes to `#` before `handleSaveLink()` evaluates `!url`, so the function-level missing-URL guard does not reject it and relies on browser-native form validation.
- Risk: arbitrary schemes can be persisted and rendered; contract-pinning this as approved behavior would preserve an unsafe validation boundary.
- Runtime/product files changed: NONE
- Contract/tests created: NONE; work stopped as required when the runtime defect was discovered.
- Extraction readiness: `NOT_READY_FOR_LINKS_EXTRACTION`
- Next required actor: ChatGPT
- Next bounded action: decide whether to authorize a separate bounded Links URL-validation correction, then resume Slice 2A discovery/contract work after that decision.
### Codex — Slice 2A.0 started and State v2.1 markers repaired

- Agent: Codex
- Task: Slice 2A.0 — Links URL Safety Correction
- Status: IN_PROGRESS
- Branch: `agent/pre-base44-audit`
- State repair: removed the CURRENT content accidentally embedded in protocol text and introduced explicit CURRENT_START, CURRENT_END, and HISTORY_START markers.
- Runtime scope: bounded Links URL validation/render safety only; no extraction.
- Next required actor: Codex
- Next bounded action: apply bounded URL validation correction and executable tests.
