# CLAUDE_REVIEW.md — Independent Review of Issue #100 (Pre-Base44 Audit)

Reviewer: Claude (independent architecture/product/regression reviewer)
Date: 2026-08-30
Repository truth used: GitHub `crewbiq/crewbiq-driver` `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418`
Codex audit source: GitHub branch `agent/pre-base44-audit` @ commit `e1a6e3727af176947ae7501f72c15f9484c572cd`

**Methodology note:** All findings below were verified against live GitHub content via the GitHub API (`gh api`), not against any local working copy. This was necessary because the local workspace at `D:/CrewBIQ/crewbiq-driver` was found mid-review to be checked out at the exact Codex audit commit (not `main`), and a local `git fetch origin main` returned a stale ref (`41fbb8f`, 2026-07-27) rather than the true current `main` HEAD (`86b8b4d`, 2026-07-30, merge of PR #96). This discrepancy is itself a finding — see §3.

---

## 1. Executive verdict

CrewBIQ's `main` is a **functioning, single-file-dominant application** (`index.html`, 6,998 lines / ~390KB) with a **secondary layer of 18 sequentially-loaded "hotfix" scripts** injected via `document.write` from a 24-line loader (`core.js`). This loader pattern is not documented anywhere in the Codex audit and is a materially different architecture than what `ARCHITECTURE.md` describes.

The Codex audit is **partially accurate on risk framing** (bootstrap/session coupling is real and correctly flagged as highest-risk) but **materially inaccurate on the current module map** — it describes domain modules (`expenses.js`, `settings.js`, `company.js`, `fleet-stats.js`, `deductions.js`) that **do not exist anywhere in the repository**, on `main` or on the audit commit itself. It also does not surface the `document.write`-based hotfix loader, which is the single most important coupling/ordering hazard in the codebase for a decomposition effort.

Independently, I found **five orphaned page fragments** (`page-work`, `page-truck`, `page-money`, `page-team`, `page-marketplace`) that are fully built in the DOM and have render logic, but have **zero reachable navigation entry points** — evidence of an abandoned prior information-architecture redesign that regrouped the flat menu into Work/Truck/Money/Team domains. Codex's audit does not mention these at all.

**GO/NO-GO: NO-GO for any UI-surface decomposition. Conditional GO for a narrow, contract-first identity/session extraction — but only after the hotfix-loader ordering is documented and pinned (see §17–19).**

---

## 2. Codex audit reconciliation summary

| # | Codex claim | Verdict | Basis |
|---|---|---|---|
| 1 | Module map: `expenses.js`, `settings.js`, `company.js`, `fleet-stats.js`, `deductions.js` exist as extracted domain modules | **INCORRECT** | None of these files exist in the repo tree on `main` or on commit `e1a6e372`. Verified via `git/trees` API on both refs — zero matches. |
| 2 | `core.js` described as "transport compatibility layer" | **INCORRECT / INCOMPLETE** | `core.js` (main, 1,317 bytes) is a `document.write` script loader that chain-loads 18 files (`core-runtime.js`, `offline-sync-queue.js`, and 16 "hotfix"/"fix" files) in a fixed sequence. It contains no transport logic itself. |
| 3 | `index.html` still holds orchestration, routing, and "several domain workflows" | **STILL VALID** | Confirmed: single `<script>` block, lines 1269–6996 (~5,727 lines), holding `boot()`, `restoreSession()`, PTI gating, Links/community, Marketplace, and role-based nav config. |
| 4 | Links/community "Implemented inline, not yet extracted" | **STILL VALID, but incomplete** | Confirmed reachable, functional (`renderCommunity()`, `loadCLinks()`/`saveCLinks()`, localStorage key `clinks` with a documented migration from a bad key `fiqD__clinks`). See §8 for full verdict — Codex's classification is correct but doesn't capture the adjacent orphaned Marketplace page (§5). |
| 5 | OCR "clear user disclosure on non-storage" | **STILL VALID and important** | Confirmed: UI literally displays "File is not stored." (fuel invoice OCR) and "not stored" (single-document OCR: BOL/receipts/service invoices) at index.html:5583 and :5594. This is accurate and is the single clearest piece of evidence for the Document Vault gap (§9). |
| 6 | Service worker: `CACHE_NAME: crewbiq-driver-v78` | **STALE DUE TO NEWER MAIN COMMITS** | `main`'s `sw.js` is now `crewbiq-driver-v79`. Minor by itself, but demonstrates the audit commit is measurably behind `main` and any line-number or version-string citations in Codex's docs should be re-verified before being used as extraction anchors. |
| 7 | Recommended first slice: identity/session + startup bootstrap | **PARTIALLY VALID — see §17-19** | Coupling claim is correct, but the recommendation doesn't weigh the hotfix-loader risk, which I judge to be a bigger and more separable hazard than session/PTI logic itself. |
| 8 | PR/issue mapping (#94, #91, #82, #77, #42, #98) | **STILL VALID** | Verified live via `gh api`: all listed PRs are open/draft against `main` (or `fix/durable-dispute-deactivation` for #77); #98 is an open issue, not a PR, matching Codex's usage. #91 is titled "style: begin CrewBIQ Base44-inspired UI refresh" — directly relevant to the Base44 optionality question (§13). |
| 9 | Offline queue / sync integrity "Implemented in dedicated module" | **NEEDS LIVE/STAGING VERIFICATION** | `offline-sync-queue.js` exists and is loaded via the hotfix chain (not a `<script src>` in `index.html` — Codex's own architecture doc doesn't note this indirection). Queue *presence* is confirmed; ordering/eviction guarantees Codex claims are "implemented" were not independently re-verified against test output (no test run was performed per the read-only mandate). |

---

## 3. Current-main product status (selected high-signal items)

| Domain | Status | Evidence |
|---|---|---|
| `index.html` scale | **PARTIAL (monolith confirmed)** | 6,998 lines total; inline `<style>` ~251 lines (17–268); inline `<script>` ~5,727 lines (1269–6996); only 5 `<script src>` tags (`core.js`, `sync.js`, `pti.js`, `loads.js`, `fleet-load-resolution.js`). |
| Hotfix loader chain | **NEW risk, not previously documented** | `core.js` uses `document.write` to inject, in fixed order: `core-runtime.js`, `offline-sync-queue.js`, `restore-hotfix.js`, `settings-hotfix.js`, `owner-snapshot-hotfix.js`, `load-order-hotfix.js`, `deduction-policy-hotfix.js`, `deduction-period-hotfix.js`, `settlement-week-hotfix.js`, `deduction-trip-resolution.js`, `accounting-action-guard.js`, `deduction-policy-ui-fix.js`, `ocr-hotfix.js`, `ocr-invoice-review.js`, `ocr-item-alias-hotfix.js`, `ocr-service-invoice-review.js`, `service-invoice-legacy-upgrade.js`, `dispute-tombstone-hotfix.js`. |
| Links / `community` page | **READY** (functionally) | Reachable from every role's nav menu (`page:'community', label:'Links'`), backed by `loadCLinks()`/`saveCLinks()` with an explicit bad-key migration comment ("repairs the temporary wrong key `fiqD__clinks`"). |
| Marketplace page | **BROKEN-REGRESSED (orphaned)** | `page-marketplace` div + `renderMarketplace()` + `MKT_MODULES` array all exist and are wired to the router dispatch (`if(name==='marketplace') renderMarketplace()`), but **no code path calls `showPage('marketplace')`** anywhere in `index.html`. Dead page. |
| Work/Truck/Money/Team domain pages | **BROKEN-REGRESSED (orphaned)** | `page-work`, `page-truck`, `page-money`, `page-team` are fully built "domain hub" landing pages that fan out into existing feature pages (e.g. Truck hub links to PTI/Fuel/Service). None are reachable — no `showPage('work'/'truck'/'money'/'team')` call exists anywhere. This is evidence of an **abandoned in-progress IA redesign** that pre-dates this audit and pre-dates Base44. |
| OCR original-file retention | **MISSING** | Confirmed by direct UI text: OCR review screens explicitly tell the user the file "is not stored," for both fuel-invoice and standard (BOL/receipt/service-invoice) document types. No object storage, hash, or provenance field observed adjacent to this flow. |
| Service worker cache/network rules | **READY, but silently drifted from audit doc** | `main`: `CACHE_NAME = 'crewbiq-driver-v79'`; POST/API routed network-only. Functionally intact; version string mismatch vs. Codex doc is the concrete "audit is behind main" proof point. |
| Accounting guard module | **PARTIAL** | `accounting-action-guard.js` implements a specific, narrow protection (zero-deduction week exception requires confirmation, stored as a durable marker inside a weekly snapshot item — not a delete). This is a genuine double-counting/omission safeguard for *one* accounting edge case, not a general guard. Broader Real Net/ROI double-counting protection was not verifiable by reading this file alone (see §4 for scope limits). |

---

## 4. Areas where Codex audit is well supported

- **Bootstrap/session/PTI coupling is real and high-risk.** `boot()` (index.html:2563) and `restoreSession()` (index.html:2373) are both large, order-sensitive functions inside the single script block, consistent with Codex's framing.
- **OCR non-storage disclosure** is accurately described and is good evidence, correctly used.
- **PR/issue dependency list** is accurate and current as of this review.
- **General thesis** — "feature completeness is not the biggest risk, sequencing/coupling is" — is directionally correct and matches independent evidence (the hotfix loader is exactly this kind of sequencing risk, arguably more severe than what Codex cited).

## 5. Areas where evidence is insufficient

- Codex's claims about offline-queue "bounded storage" and "retry on reconnect" behavior are asserted from reading `offline-sync-queue.js` but not demonstrated against a running app or test output. I did not run tests either (per read-only/no-build mandate), so this remains **UNKNOWN-NEEDS-VERIFICATION** on both sides — flag for the next agent with build/test access, not a settled fact.
- Deduction/settlement-week accounting correctness (the actual arithmetic, not just the guard file) requires reading `deduction-policy-hotfix.js`, `deduction-period-hotfix.js`, `deduction-trip-resolution.js`, and `settlement-week-hotfix.js` together with their load order — this review confirms the *load order exists and is fixed by `core.js`* but does not re-derive the formulas (out of scope per the task's "do not rewrite formulas" instruction, and would require deeper code reading than a read-only architecture pass budgets for).

## 6. Incorrect classifications

- Codex's `ARCHITECTURE.md` "Current module map (high confidence)" listing `expenses.js`, `settings.js`, `company.js`, `fleet-stats.js`, `deductions.js`, `sync.js` as extracted domain modules is **factually wrong** for `sync.js`'s neighbors — those five files do not exist. `sync.js` itself does exist and is correctly listed. This is a "high confidence" label attached to fabricated evidence and should not be trusted as a starting map for decomposition planning.
- Codex's `FUNCTIONAL_AUDIT.md` table entry for "Fleet/load data workflows" cites `core.js` as containing a "bootstrapped module list" implying it's a manifest of domain modules — in reality it is a `document.write` loader for the 18-file hotfix chain, a very different and riskier thing than a "module list."

## 7. Missing product risks not captured by Codex

1. **The `document.write` hotfix loader itself.** `document.write` is a blocking, synchronous, deprecated browser API. Any future async/deferred script loading, bundler, or CSP tightening will break this chain silently. This is a decomposition blocker that must be resolved *before* touching any of the 18 chained files, and Codex's plan doesn't mention it once.
2. **Five orphaned/dead pages** (`work`, `truck`, `money`, `team`, `marketplace`) — not a functional regression today (nothing depends on them), but a real hazard *during* decomposition: an agent extracting "UI modules" by grepping `page-*` divs will pull in dead code and may accidentally re-wire it into the live nav, changing behavior in ways the "no behavior changes" constraint forbids.
3. **Local workspace/branch drift risk** (see Methodology note above) — a real, just-observed failure mode where an agent's local checkout silently pointed at an old audit commit while believing it was on `main`. This is exactly the kind of hidden-coupling/unsafe-assumption risk the issue asks to review, applied to the audit process itself.

## 8. Links current-state verdict

**READY**, contrary to any suggestion that Links was removed or regressed. It is present in the nav for all three roles (driver/owner_op/fleet), backed by `clinks` storage with an explicit legacy-key migration path, has search/filter (`linkSearchQuery`, filter chips), and a copy-invite-link affordance. No evidence of removal in `main` vs. the audit commit. The **only** Links-adjacent problem is the unrelated, unreachable `MKT_MODULES` "Links Manager" marketplace tile (§3), which is cosmetic dead code, not a Links regression.

## 9. OCR/document evidence verdict

**MISSING** (Document Vault requirement, per Issue #100 Phase 3, is 0% implemented). Current behavior actively discards the source file after extraction and tells the user so. This is the single cleanest, most unambiguous gap in the entire audit — no interpretation required, it's in the UI copy itself. Building the Document Vault (binary → local-first storage → object storage → hash/provenance in canonical record → link from operational record) is new-build work, not a refactor of existing retention logic, because no retention logic exists to refactor.

## 10. PTI architecture verdict

**PARTIAL.** A dedicated `pti.js` module exists and is loaded via `<script src>` (not the hotfix chain), and `boot()` gates on `needsPTI()`/`showPTIBlocker()`. This supports the "configurable, can be scheduled weekly" future requirement structurally (a gate function that can be extended with a policy check), but the full evidence-binding chain the issue describes (PTI↔Truck/VIN↔Driver↔timestamp↔odometer↔section↔photo↔defect↔repair) was not found as a single connected data model — PTI today appears to be a pass/fail gate plus checklist, not yet an evidence graph. Building the full binding is additive work, not a decomposition risk per se, but should happen after Document Vault exists since PTI photos are exactly the kind of evidence Document Vault must retain.

## 11. IFTA/IRP readiness verdict

**MISSING (new domain), with partial substrate.** Trucks, Drivers, and Loads/Trips exist as concepts with data; Fuel logging exists. What's absent: jurisdiction-mile computation, a GPS/ELD/odometer source-of-truth designation, and any IFTA-quarter aggregation or audit-package export. This is consistent with treating IFTA/IRP as a first-class new domain rather than an extension of existing code — there is little to "decompose," mostly new modeling to add once Document Vault and PTI evidence-binding exist as dependencies.

## 12. crewbiq.com readiness verdict

**UNKNOWN-NEEDS-VERIFICATION** from this repository alone. `crewbiq-driver` shows a role-config object (`ROLE_CONFIG` with `driver`/`owner_op`/`fleet`) that is a reasonable seed for a capability/role model, but this repo has no visible identity/orchestrator server code — that lives in `crewbiq-orchestrator` (per prior project context, not re-verified in this pass). A real verdict on "one identity, one canonical data layer, role-controlled views across PWA/mobile/web" requires reviewing `crewbiq-orchestrator` directly; scoping that was outside this repo-focused pass. Flag as a required follow-up, not a finding.

## 13. SIDR integration readiness verdict

**PARTIAL.** The `accounting-action-guard.js` pattern (explicit confirmation before a significant accounting mutation, durable marker instead of silent delete) is a good structural precedent for the "confirmation policy" and "no silent mutation" requirements SIDR will need. But there is no visible tool/API boundary in this repo — SIDR-facing integration, if it exists, is likely orchestrator-side. Within `crewbiq-driver`, nothing currently exposes a constrained read/write tool surface; all mutation happens through direct function calls inside the monolith. This is compatible with *building* a SIDR-safe API layer later, but confirms none exists yet.

## 14. index.html coupling map

**Presentation logic:** ~1,000 lines of page-fragment HTML (lines ~269–1268), including 5 orphaned page divs.
**Business logic:** embedded in the single script block (1269–6996) — PTI gating, Links/`clinks` CRUD, Marketplace (dead), deduction/settlement helpers that call into the hotfix chain.
**Accounting:** split between inline `index.html` logic and the 8 accounting-related hotfix files (`deduction-*`, `settlement-week-hotfix.js`, `accounting-action-guard.js`, `service-invoice-legacy-upgrade.js`), loaded in a fixed, currently undocumented order.
**Identity:** `restoreSession()`, `boot()`, and role bootstrap live inline in `index.html`; `core-runtime.js` (loaded first in the hotfix chain) appears to be the transport layer Codex described (correctly, for this one file).
**Persistence:** `localStorage` via scoped helpers (`scopedLoad`/`scopedSave` seen in Marketplace code, `clinks` key for Links) plus `offline-sync-queue.js` for the durable mutation queue — itself loaded via the hotfix chain, not a `<script src>`.
**Sync:** `sync.js` (proper `<script src>` module) plus the queue.
**Globals:** heavy reliance on `window`/`global`-scoped functions called across files (`accounting-action-guard.js` reaches into `global.selectedTruckId`, `global.findTruckByIdOrUnit`, `global.loadTrucks`, `global.CrewBIQSettlementWeek`, `global.escHtml` — a wide, implicit cross-file contract with no explicit interface).
**Module boundaries:** only 5 files are real `<script src>` modules (`core.js`, `sync.js`, `pti.js`, `loads.js`, `fleet-load-resolution.js`); everything else is either inline or hotfix-chain-injected.
**Hotfix dependencies:** 18 files, order fixed by `core.js`, order not documented or tested as a contract anywhere found.

## 15. SAFE extraction boundaries

- **Marketplace + orphaned domain-hub pages (`work`/`truck`/`money`/`team`)**: safe to extract or delete first — zero live reachability means zero behavior-change risk. (Deletion is a product decision, not this review's call, but *isolating* them for inspection is safe.)
- **Pure helper functions with no shared-state reads** (e.g., `esc`/escaping helpers, date formatting) — low risk, easy to unit test in isolation.
- **`clinks` (Links) storage adapter** — as Codex also concluded, this is a genuinely self-contained CRUD domain with its own storage key and no accounting/identity coupling visible.
- **OCR transport adapter** (encode/upload/error path) — as long as the "not stored" disclosure behavior is preserved verbatim (it's both a UX and possibly a legal/compliance statement).

## 16. DANGEROUS extraction boundaries

- **The `core.js` hotfix loader itself.** Reordering, parallelizing, or converting these 18 `document.write` loads to ES modules/async script tags without first writing down and testing the *required* order is the single highest-risk action available in this codebase. Accounting hotfixes in particular (`deduction-policy-hotfix.js` → `deduction-period-hotfix.js` → `settlement-week-hotfix.js` → `deduction-trip-resolution.js` → `accounting-action-guard.js`) are loaded in an order that looks intentional (policy before period before settlement before trip-resolution before the guard that depends on settlement/period helpers) but is nowhere asserted as a contract.
- **`restoreSession()`/`boot()`/PTI gate**, as Codex flagged — still valid, still dangerous, just not uniquely more dangerous than the hotfix loader.
- **Anything touching the 5 orphaned pages without first confirming with product** whether they represent abandoned work to delete or a design intent to finish (they look like a genuine draft of the Work/Truck/Money/Team IA that a Base44-informed redesign might want to *resume* rather than discard).

## 17. Recommended FIRST decomposition slice

**Document and pin the `core.js` hotfix load order as an explicit, tested contract — before extracting anything else, including identity/session.**

Concretely: write a manifest (even just a JSON/JS array with an explanation per entry) of the 18 files' required order and *why*, add a smoke test that loads them in that order and asserts no runtime error / no missing-global, and only then proceed to Codex's proposed identity/session extraction.

## 18. Explicit reason why that slice is safer than alternatives

Codex's proposed first slice (identity/session/startup) is *already partially understood* — `restoreSession()` and `boot()` are named, readable functions in one file. The hotfix loader, by contrast, is **currently invisible to any decomposition plan that only reads `index.html`** (its own `<script src>` list is 5 entries, not 23) — an agent could easily start extracting "auth" without realizing `restore-hotfix.js` is a same-purpose file loaded through a completely different mechanism, or that `accounting-action-guard.js` depends on load order relative to three other deduction-hotfix files. Locking this contract first makes every later extraction (including identity/session) strictly safer, because the agent doing that later work will have an explicit map instead of having to rediscover the `document.write` chain the way this review did.

## 19. Preconditions before any decomposition work

1. Hotfix load-order contract documented and smoke-tested (§17).
2. A decision (product, not engineering) on the 5 orphaned pages: delete, or resume as the target IA.
3. Session/PTI/restore behavior snapshotted by tests, as Codex also recommended — still valid.
4. Service worker cache-name/version-string discipline reconfirmed (the v78→v79 drift shows this is already loosely tracked; a decomposition pass will bump it further and needs a clear rule for when).
5. Explicit confirmation that `crewbiq-orchestrator`'s identity model is understood before any identity/session extraction here, since `core-runtime.js` is a transport-compatibility layer to that external system, not a self-contained identity implementation.

## 20. GO / NO-GO decision

**NO-GO for UI-surface or business-logic decomposition of `index.html` at this time.**

**Conditional GO** for a narrow, non-behavioral documentation-and-test slice: writing down and testing the hotfix load-order contract (§17). This is the safest possible next action, produces the evidence every subsequent decomposition step needs, and matches the issue's "no rewrite of business logic during extraction" and "add source/behavior contracts for extracted boundaries" rules exactly — because it adds a contract without extracting anything yet.

Do not begin identity/session extraction, Links extraction, or any UI-module split until the precondition in §19.1 is met.

---

## Addendum — 2026-08-30: Review of Slice 0 (bounded commit `6c32cd7de64f2ecd77311847485fd2e483a48448`)

Reviewer: Claude. Product truth: GitHub `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` (`core.js` on `main` re-verified byte-identical to the copy read in the original review above). Commit under review: `6c32cd7` on `agent/pre-base44-audit`.

### Verdict: **NEEDS FIX**

Files changed in `6c32cd7`: `docs/collaboration/{ARCHITECTURE,CURRENT_STATUS,FUNCTIONAL_AUDIT,HANDOFF,HOTFIX_LOAD_ORDER_CONTRACT,README,WORK_LOG}.md`, `tests/hotfix-load-order-contract.test.mjs`. No product/runtime file (`index.html`, `core.js`, any hotfix `.js`, `sw.js`, `package.json`, `.github/workflows/*`) appears in the commit's file list. **Requirement 1 (no product/runtime code changed): confirmed.**

### Verification performed

- **Sequence exactness (req. 2–3):** Extracted the live `load('...')` argument list from `core.js` on `main` via regex; it is 18 entries, exact strings, exact order, and matches `HOTFIX_LOAD_ORDER_CONTRACT.md` and the updated `ARCHITECTURE.md` line-for-line. Confirmed.
- **Dependency claims (req. 4):** Spot-checked 10 of the 18 per-file dependency claims in `HOTFIX_LOAD_ORDER_CONTRACT.md` against the actual source of each file on `main` (`core-runtime.js` → exports `CrewBIQCore`; `restore-hotfix.js` → exports `CrewBIQRestoreHotfix`; `settlement-week-hotfix.js` → exports `CrewBIQSettlementWeek`; `deduction-trip-resolution.js` → consumes `CrewBIQSettlementWeek`/`CrewBIQDeductionPolicies`; `deduction-policy-hotfix.js` → exports `CrewBIQDeductionPolicies`/`effectivePolicies`/`buildWeeklySnapshot`; `load-order-hotfix.js` → touches `CrewBIQLoads`; `ocr-hotfix.js` → uses `orchestratorTransport`; `ocr-item-alias-hotfix.js` → uses `CrewBIQInvoiceReview`/`renderScanReview`; `service-invoice-legacy-upgrade.js` → uses `CrewBIQServiceInvoice`/`saveServiceLogs`; `dispute-tombstone-hotfix.js` → uses `getDriverDisputed`/`doSync`). All confirmed present in the named files. No fabricated dependency claims found.
- **Test correctness (req. 5):** Read `tests/hotfix-load-order-contract.test.mjs` in full. Reasoned through each required failure mode against its actual assertion logic:
  - *Reorder* → caught by the positional `observed[i] === expected[i]` loop.
  - *Removal* → caught by the leading `assert.equal(observed.length, expected.length)` (18 ≠ 17).
  - *Addition* → same length check (18 ≠ 19).
  - *Duplicate* (same length, one entry replacing another) → any duplicate that preserves length 18 necessarily shifts a later position, which the positional loop catches (the dedicated `Set`-based duplicate check is real but structurally unreachable as the *first* failure in most duplicate scenarios — cosmetic, not a correctness gap).
  - *Missing referenced file* (string unchanged in `core.js` but the physical `.js` file deleted from the repo) → caught by the per-entry `fs.existsSync` check.
  All five scenarios verified to fail correctly. **Confirmed.**
- **Fabrication cleanup (req. 6):** `ARCHITECTURE.md`'s "Current module map" no longer lists `expenses.js`, `settings.js`, `company.js`, `fleet-stats.js`, or `deductions.js` (the five fabricated files flagged in the original review) — the module map now lists only files that actually exist in the repo tree. `FUNCTIONAL_AUDIT.md`'s `sw.js` citation was also corrected from the stale `v78` to the current `v79`. **Confirmed fixed.**
- **New claims (req. 7):** No new fabricated file/function claims were introduced in this pass. One **internal inconsistency** was introduced, not a fabrication against the codebase: `CURRENT_STATUS.md`'s "Recommended next action" still reads *"Execute first slice: auth/session/startup coordinator extraction..."*, unchanged from before — but `FUNCTIONAL_AUDIT.md`'s "Safe decomposition order" in this same commit was correctly revised to put "Lock hotfix loader contract with a dedicated test and contract map" as step 1 and auth/session extraction as step 2. The two docs in the same commit now disagree on what to do next.

### Blocking findings

1. **The new contract test is not wired into any CI workflow or npm script.** `package.json` and every `.github/workflows/*.yml` file are unchanged in this commit. `pwa-auth-contract.yml` is the workflow that runs this exact class of bare-script contract test (e.g. `node tests/orchestrator_transport.test.mjs`) via an explicit hard-coded file list in both its path-filter trigger and its `run:` steps — `tests/hotfix-load-order-contract.test.mjs` appears in neither. `package.json`'s `test:e2e:tooling` (which uses `node --test ...`) also does not reference it. As written, the test is logically correct (see above) but **inert** — nothing invokes it, so it currently enforces nothing. This directly undercuts the stated purpose of Slice 0 ("add a smoke test... before proceeding").
2. **Stale cross-document recommendation.** `CURRENT_STATUS.md` was not reconciled with `FUNCTIONAL_AUDIT.md`/`HANDOFF.md` in the same commit — it still points the next agent at auth/session extraction first, contradicting the corrected priority order elsewhere in this same commit set. Low severity on its own, but exactly the kind of doc drift this audit exercise exists to prevent, and it's self-inflicted within one commit.

### Non-blocking findings

- Test file style (bare script using `node:assert/strict`, no `node:test` wrapper) correctly matches the existing convention for this class of contract test (`tests/orchestrator_transport.test.mjs` and siblings run the same way in `pwa-auth-contract.yml`), rather than the `node --test`-discovered style used elsewhere in `tests/*.test.mjs`. Consistent with precedent — no action needed once wired in.
- The `document.write`-based script-injection mechanism itself (flagged as a distinct hazard in the original review — blocking/deprecated API, invisible to CSP/bundler tooling) is still not named as its own risk category in the updated docs; only generic "loader contract coupling" is called out. Doesn't affect the contract's correctness, but worth carrying forward into whichever slice eventually touches `core.js`'s loading mechanism itself.
- `HOTFIX_LOAD_ORDER_CONTRACT.md`'s "Hidden non-chain dependencies" section (`sw.js` pre-caching `core.js` + all 18 hotfix files) was not independently re-verified line-by-line against `sw.js` in this pass; flagged as a residual UNKNOWN-NEEDS-VERIFICATION rather than a finding either way.

### Can Slice 0 be considered closed?

**Not yet.** The documentation and dependency-mapping work is sound and the fabricated claims from the original review are genuinely fixed — that part of Slice 0 is done. But a contract test that isn't wired into CI provides no actual protection against the exact failure mode (silent reorder/removal in a future PR) that Slice 0 exists to prevent. Slice 0 should not be marked closed until: (a) the test is added to `pwa-auth-contract.yml` (path filter + `run:` step, matching its sibling tests) or `package.json`'s `test:e2e:tooling`, and (b) `CURRENT_STATUS.md`'s next-action line is reconciled with the corrected decomposition order. Both are doc/CI-config-only changes — no product code involved — and should be a very small follow-up, not a new slice in its own right.

### Recommended safest next bounded slice

**Slice 0b (closing, not new): wire `tests/hotfix-load-order-contract.test.mjs` into CI** (`pwa-auth-contract.yml` run step + path filter, or `package.json` `test:e2e:tooling`) **and reconcile `CURRENT_STATUS.md`'s recommendation with `FUNCTIONAL_AUDIT.md`'s revised order.** No other files should change. Only once this lands and is confirmed by re-review should Slice 1 (auth/session/startup extraction, per the now-corrected priority order) begin.

---

## Canonical Documentation Reconciliation Review — 2026-08-30

Reviewer: Claude. Product truth: GitHub `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418`, cross-checked with live `main` re-fetches for `pti.js`, `manifest.json`, `package.json`, and `.github/workflows/*` during this pass. Codex commit under review: `e8822806713d2c3644880d1c88f3c603ffe7e029` on `agent/pre-base44-audit` (docs-only: all 6 `docs/product/*` files added, no other file touched — confirmed via commit file list). Also independently re-verified the Slice 0/0b CI-wiring status referenced in `COLLABORATION_STATE.md`.

### VERDICT: **NEEDS FIX**

All 6 required canonical docs exist (`PRODUCT_CONTRACT.md`, `FEATURE_REGISTRY.md`, `ROADMAP.md`, `DEPRECATED_DECISIONS.md`, `DOCUMENTATION_AUTHORITY.md`, `LEGACY_ARTIFACT_MATRIX.md`). The reconciliation work is substantially sound — every one of the ~17 GitHub issue citations (across `crewbiq-driver`, `crewbiq-docs`, `crewbiq-orchestrator`) and ~13 PR citations checked against live GitHub state were accurate (correct numbers, titles, open/closed/merged/draft states). But two of the five explicitly-flagged hotspots (Document Vault, Weekly photo PTI) are genuinely overstated relative to runtime evidence, one hotspot (Community) still contains the exact factual claim the task warned could cause future harm, and the authority-hierarchy document doesn't yet encode the safeguard that would have caught the first two.

### 1. Blocking findings

**B1 — Document Vault: CODEX CLASSIFICATION IN_PROGRESS is not supportable.**
- CODEX CLAIM: `FEATURE_REGISTRY.md` "Document Vault" row — Status `IN_PROGRESS`, current behavior "required by policy, not fully implemented in current runtime."
- CURRENT EVIDENCE: `index.html` (main) lines 5583 and 5594 display, verbatim, to the user: *"Review every field. OCR can be wrong. Fuel Log entries will be created per transaction. File is not stored."* and *"not stored"* — for every OCR document type (fuel invoice, BOL, receipt, service invoice). No object storage, hash, or provenance field exists adjacent to this flow. Implementation is 0%, not partial.
- YOUR VERDICT: Misclassified. `IN_PROGRESS` implies partial implementation exists; none does. This is an approved *requirement* with zero *implementation* — the two are being conflated.
- RISK: A future agent reading `IN_PROGRESS` could assume there's existing Document Vault code to extend or preserve during decomposition, when in fact this is 100% new-build work with an active behavioral contradiction (the UI explicitly promises non-retention) that must be changed.
- RECOMMENDED RESOLUTION: Change status to `PLANNED` (the closest fit in the allowed vocabulary; there is no `MISSING` state) and add an explicit note: "current runtime: 0% implemented; UI explicitly discards source files (see `index.html:5583,5594`)."

**B2 — "Weekly photo PTI": the row's two halves have different implementation states, hidden behind one status.**
- CODEX CLAIM: `FEATURE_REGISTRY.md` "Weekly photo PTI" row — Status `IN_PROGRESS`, "support exists in partial flows."
- CURRENT EVIDENCE: `pti.js` (main) genuinely implements a working weekly-schedule mechanism: a per-driver `ptiSchedule` setting (`daily`/`weekly`), Monday auto-detection (`new Date().getDay() === 1`), a `DEFAULT_WEEKLY` checklist array, a dedicated `ptiWeeklySection` UI block, and a `type: useWeekly ? 'weekly' : 'daily'` marker persisted on each PTI record. This part of "IN_PROGRESS" is accurate and, if anything, more built than the original review assumed. However: `pti.js` and the PTI page section contain **zero occurrences** of `photo`, `camera`, or `image`. There is no photo-capture code anywhere in the PTI flow, and no `defect`/`repair` status fields either — only odometer capture and pass/fail checklist items exist.
- YOUR VERDICT: Partially misclassified. The row name is "Weekly **photo** PTI," and the single `IN_PROGRESS` status implies the whole named feature — including the photo evidence half, which is the actually novel/harder part of the future requirement — has begun. It hasn't; the photo-binding chain (photo↔defect↔repair/resolution) is 0% implemented. Only the scheduling half is real.
- RISK: Same failure mode as B1 — a future agent could treat "photo evidence capture" as already-started work to extend, when it needs to be built from nothing, on top of the (real) Document Vault gap in B1, since PTI photos are exactly the evidence type Document Vault must retain.
- RECOMMENDED RESOLUTION: Split into two registry lines (or a footnote): "PTI weekly schedule: `IN_PROGRESS`, confirmed in `pti.js` (`ptiSchedule`, Monday auto-detect, `DEFAULT_WEEKLY`)" and "PTI photo evidence capture: `PLANNED`, 0% implemented, depends on Document Vault (B1)."

**B3 — "Community" row still states the exact false claim the task named as a hazard.**
- CODEX CLAIM: `FEATURE_REGISTRY.md` "Community" row — Status `DEPRECATED`, current behavior: "no active community surface in runtime."
- CURRENT EVIDENCE: `index.html` (main): the nav nodes `{page:'community', icon:'🔗', label:'Links'}` appear in all three role menus (driver/owner_op/fleet); `<div id="page-community" class="page">` (line 1048) is the DOM container; `if(name==='community') renderCommunity();` (line 2667) is the router dispatch; `renderCommunity()` (line 5953) is the actual Links-rendering function, backed by `loadCLinks()`/`saveCLinks()`. The page ID `community` **is** the live technical container for the `ACTIVE`-classified "Links" feature in the very same registry table. "No active community surface in runtime" is factually false — the surface is active every time a user opens Links.
- YOUR VERDICT: Misclassified claim (not the status label itself — `Links` is correctly `ACTIVE` two rows above — but the Community row's factual description). Note: `DEPRECATED_DECISIONS.md`'s "Abandoned IA pages" list correctly does **not** include `page-community` alongside `page-work`/`page-truck`/`page-money`/`page-team`/`page-marketplace` — that part was handled correctly. The error is confined to the Community row's own "current behavior" text.
- RISK: Exactly as the task anticipated — an agent optimizing on the Community row alone, without cross-referencing the Links row, could remove or gut `page-community`/`renderCommunity()`/the `community` router branch believing it dead code, which would delete the live Links feature.
- RECOMMENDED RESOLUTION: Rewrite the Community row's "current behavior" to something like: "The historical 'social/community' product concept is deprecated; the `page-community` DOM container, `renderCommunity()` function, and `community` router branch are **not** dead — they are the current live implementation of the `ACTIVE` Links feature (see Links row) and must not be removed or altered as part of deprecating the community concept."

**B4 — `DOCUMENTATION_AUTHORITY.md` doesn't separate "product intent" from "implemented behavior," which is the root cause of B1–B2.**
- CODEX CLAIM: Source-of-truth hierarchy ranks `PRODUCT_CONTRACT.md`/`FEATURE_REGISTRY.md` at positions 1–2 and "implementation code/tests" at position 5, "for historical validation," with an "Authority rule" that canonical docs are binding over historical artifacts unless a product owner reverses them.
- CURRENT EVIDENCE: As written, this hierarchy gives no special standing to code as evidence of *current implemented behavior* — only as a historical artifact, ranked below issues/PRs. That framing is exactly consistent with how Document Vault and Weekly-photo-PTI ended up overstated: the docs' stated intent was trusted for an implementation-state field without a code re-check being structurally required.
- YOUR VERDICT: Gap confirmed — the task's requested distinction is genuinely absent from the document.
- RISK: Without this split, every future FEATURE_REGISTRY update risks the same conflation, and any future agent following `DOCUMENTATION_AUTHORITY.md` literally would be justified in preferring a stale doc-claimed status over contradicting code.
- RECOMMENDED RESOLUTION: Add an explicit two-track authority split, as specified in this review's source task: **PRODUCT INTENT authority** = `PRODUCT_CONTRACT.md`/`FEATURE_REGISTRY.md` "current approved direction" column; **IMPLEMENTED BEHAVIOR authority** = current `main` + tests + production evidence, which must independently back any `ACTIVE`/`IN_PROGRESS` status claim in the "current behavior" column. Historical intent (issues/PRs/ADRs/old docs) stays context, not evidence of either.

### 2. Non-blocking findings

- **Marketplace status/label mismatch.** Status is `DEPRECATED`, but the row's own "current approved direction" text ("defer Marketplace as exploratory until crewbiq.com governance is finalized") reads as deferred-but-revivable, closer to `NEEDS_DECISION` or a qualified `PLANNED`. The content is accurate (matches the confirmed-orphaned `page-marketplace`); only the status enum choice slightly undersells that this may return as a strategic direction. Low severity — recommend re-labeling or adding "current implementation: `ABANDONED`; future concept: `NEEDS_DECISION`" as two facets of one row.
- **Mobile packaging: no explicit native-packaging disclaimer.** Confirmed via `manifest.json` (PWA manifest only) and `package.json` (no Capacitor/Cordova/Android/iOS/Gradle/Xcode dependency or config anywhere in the repo tree) that this is PWA-only. The row's own wording ("mobile-adjacent packaging behavior") is appropriately hedged and not itself false, but doesn't explicitly rule out native app-store readiness, which a future agent could over-read into `ACTIVE`. Recommend appending: "PWA-only; no native Android/iOS store packaging pipeline exists in this repo."
- **`LEGACY_ARTIFACT_MATRIX.md` omits `crewbiq-docs` issue #29** ("Epic: CrewBIQ Knowledge Engine and Truckpedia," open — verified), even though `FEATURE_REGISTRY.md`'s Knowledge Engine/Truckpedia row cites "crewbiq-docs issues #29/#31/#30." The matrix table only lists #32/#31/#30. Minor citation gap, easy fix.
- **CI style inconsistency (Slice 0b follow-through, not this commit):** re-verified independently that `tests/hotfix-load-order-contract.test.mjs` IS now wired into both `package.json`'s `test:e2e:tooling` and `.github/workflows/pwa-auth-contract.yml` (path filters + a `run:` step) on `agent/pre-base44-audit` — this resolves the blocking finding from my previous review. However, its run step uses `node --test tests/hotfix-load-order-contract.test.mjs`, while every sibling bare-script contract test in the same workflow uses plain `node tests/x.test.mjs` (no `--test` flag). Functionally both fail correctly on an assertion error, but this is a style inconsistency worth normalizing.

### 3. Misclassified features

Document Vault (B1), Weekly photo PTI (B2, partial — the schedule half is correctly classified, the photo half is not), Community (B3, factual-claim error not status-label error). No other rows in the 30-row `FEATURE_REGISTRY.md` table were found to be misclassified against the evidence checked (Launch/Auth, CrewBIQ ID, Loads, PTI, Expenses, Fuel/DEF, OCR, Maintenance, Service Invoice, Trucks, Drivers, Team, Company/Carrier/Settlement, Deductions, Disputes, Fleet Overview, Real Net, Reports, Offline/sync, Backup/export/import, Compliance/Audit Center, IFTA/IRP, crewbiq.com, SIDR Core, Base44 redesign path all check out against their cited issue/PR evidence and, where checkable, against actual code).

### 4. Missing legacy artifacts

- `crewbiq-docs` issue #29 (Truckpedia epic) — see non-blocking findings.
- No other missing citations found; the issue/PR reference set is otherwise thorough (17 issues + 13 PRs spot-checked, all accurate).

### 5. Unsafe supersession/deprecation decisions

- The Community row (B3) is the one genuinely unsafe deprecation-adjacent claim — not because "Links = ACTIVE / Community = DEPRECATED" is the wrong call (it's the right distinction to draw), but because the supporting "current behavior" sentence contradicts the live code and could mislead a future edit. No other deprecation in `DEPRECATED_DECISIONS.md` (fabricated module maps, mandatory-PTI assumption, first-truck fallback, SW-version-as-behavior-key, abandoned IA pages, direct-AI-to-DB pattern, mandatory-Base44 assumption, monolith-as-blocker assumption, docs-fragments-as-plan assumption) was found to be unsafe — all correctly cite what superseded them and what evidence now governs.

### 6. Items correctly reconciled

- Fabricated module-map artifacts from the original review are properly retired with accurate rationale in `DEPRECATED_DECISIONS.md`.
- "Original OCR file remains unstored" is explicitly and correctly marked superseded by the Document Vault direction (task hotspot #4) — done properly, independent of the B1 status-field issue above.
- `page-team` correctly identified as dead orphaned UI, cleanly distinguished from the still-valid workspace/capability governance model — unlike Community, `page-team` genuinely has zero live callers, so no landmine here.
- Issue #21 correctly separates the still-valid accounting single-count requirement from the superseded source-retention assumption (task hotspot #6) — done properly.
- Issue #97 (maintenance provenance, this repo) is kept distinct from the separate `crewbiq-docs` Truckpedia epic, avoiding a parallel/incompatible evidence model (task hotspot #8).
- IFTA/IRP, SIDR Core, and crewbiq.com Personal Cabinet are all classified `PLANNED`, not overstated — matches the repo evidence (no jurisdiction-mile/GPS-source/IFTA-quarter code, no SIDR API surface, no crewbiq.com-specific data layer found in this repo).
- `ROADMAP.md`'s phase sequencing (Phase 0 doc/loader stabilization → Phase 1 baseline preservation → Phase 2 Document Vault/evidence → Phase 3 PTI/compliance → Phase 4 IFTA/IRP → Phase 5 crewbiq.com → Phase 6 SIDR → Phase 7 Marketplace/Truckpedia) matches the dependency order this review's own prior sections recommended, and invents no implementation dates.
- Slice 0/0b CI-wiring closure claimed in `COLLABORATION_STATE.md` was independently re-verified as **true** on `agent/pre-base44-audit` (see non-blocking findings) — the blocking finding from my previous review is now resolved.

### 7. NEEDS_PRODUCT_DECISION list

- Issue #90 / PR #91 (Base44-inspired UI refresh) — whether/when to resume, under the Base44-optional contract.
- `crewbiq-docs` #32 (crewbiq.com production domain/hosting/service boundaries).
- `crewbiq-docs` #31 (Restore CrewBIQ Bot as governed SIDR).
- `crewbiq-orchestrator` #2 (read-only AI Auditor) — AI governance model decision.
- Knowledge Engine/Truckpedia cross-repo ownership boundary (`crewbiq-driver` #97 vs. `crewbiq-docs` #29/#30/#31).
- Marketplace status framing (see non-blocking findings) — whether it's a closed door or a deferred strategic direction.

### 8. Recommended corrections

1. Document Vault status: `IN_PROGRESS` → `PLANNED`, with an explicit "0% implemented" evidence note (B1).
2. Split or footnote "Weekly photo PTI" into schedule (`IN_PROGRESS`, real) vs. photo evidence capture (`PLANNED`, 0% implemented) (B2).
3. Rewrite the Community row's "current behavior" text to explicitly protect the live `page-community`/`renderCommunity()` implementation from being read as dead code (B3).
4. Add the PRODUCT INTENT vs. IMPLEMENTED BEHAVIOR two-track authority split to `DOCUMENTATION_AUTHORITY.md` (B4).
5. Add a "PWA-only, no native store packaging" disclaimer to the Mobile packaging row.
6. Add `crewbiq-docs` #29 to `LEGACY_ARTIFACT_MATRIX.md`.
7. Re-examine Marketplace's status enum choice (`DEPRECATED` vs. `NEEDS_DECISION`/qualified `PLANNED`).
8. Normalize the hotfix-load-order-contract CI step to plain `node tests/hotfix-load-order-contract.test.mjs` for consistency (cosmetic).

### 9. Can canonical docs now become source of truth?

**Not yet, but close.** The framework (`DOCUMENTATION_AUTHORITY.md`'s hierarchy plus the registry/roadmap/deprecated-decisions structure) is sound in design, and the large majority of content — every spot-checked issue/PR citation, most status classifications, the deprecation rationale, the roadmap sequencing — is accurate and re-verifiable. But B1–B4 are load-bearing enough that treating `docs/product/*` as fully binding today carries real risk: exactly the failure mode `DOCUMENTATION_AUTHORITY.md`'s current hierarchy invites (trusting doc-claimed implementation status over code) is what produced B1 and B2. Once corrections 1–4 land, this package is in good shape to serve as source of truth.

### 10. GO / NO-GO for the first real decomposition slice

**NO-GO**, unchanged from the original review. This was a documentation-only reconciliation slice; it doesn't alter the underlying `index.html`/hotfix-loader risk profile. Additionally, Phase 1 of `ROADMAP.md` ("Preserve Safe Runtime Baseline") should not begin execution while Document Vault's status is overstated (B1), since baseline-preservation work needs an accurate picture of what exists to preserve versus what must be built new.

---

## Canonical Documentation Reconciliation Review — Addendum (2026-08-30, re-review)

Reviewer: Claude. Same target as the section above: commit `e8822806713d2c3644880d1c88f3c603ffe7e029` (docs/product/* on `agent/pre-base44-audit`). Re-confirmed via blob-SHA comparison that these six files are byte-identical to what was reviewed above — no new commit has landed. This addendum stands on the analysis above and adds one new item this pass was asked to check directly: **Issue #90**.

### VERDICT: **NEEDS FIX** (unchanged)

The findings B1–B4 and all non-blocking items from the section above still apply in full; see that section for the complete evidence trail (Document Vault, Weekly photo PTI, Community, `DOCUMENTATION_AUTHORITY.md`). This addendum does not repeat that evidence — it stands as reviewed. One additional finding follows from directly reading Issue #90 and PR #91's full text, which the prior pass had only checked for open/closed state, not content.

### New finding — B5: Issue #90 / PR #91 are misclassified as `DEPRECATE`-recommended in `LEGACY_ARTIFACT_MATRIX.md`

- CODEX CLAIM: `LEGACY_ARTIFACT_MATRIX.md` — "Issue #90 — Base44-inspired UI refresh," Status `NEEDS_DECISION`, recommended action `DEPRECATE`; "PR #91 — Begin Base44-inspired UI refresh," Status `DEPRECATED`, recommended action `DEPRECATE`. Both rows justify this via "Conflicts with Base44 optionality rule" / "Conflicts with optionality contract."
- CURRENT EVIDENCE: Read both artifacts in full via `gh api`. Issue #90's own text: *"Apply the Base44-inspired visual direction approved by the product owner to the existing CrewBIQ Driver PWA"* with an explicit **"Non-negotiable guardrails"** section: preserve all data/localStorage migrations, CrewBIQ ID, orchestrator sync, offline-first behavior, Company/Truck/Driver model, payroll/deductions/dispute/settlement/report logic, and *"Do not introduce parallel entities or a second application architecture."* PR #91's body states it *"Kept all data, storage, calculations, sync, identity, and offline logic untouched"* and lists guardrails matching the issue almost verbatim, closing with *"Closes #90 when the full visual refresh and validation are complete."* Both are open (issue) / open-draft (PR) — verified live.
- YOUR VERDICT: Misclassified. Issue #90 and PR #91 do not conflict with the "Base44 is optional, not mandatory architecture" contract — they are the correctly-scoped, guardrailed *implementation* of that exact contract (visual layer only, explicit non-architecture-change guardrails, product-owner-approved). Recommending `DEPRECATE` for genuinely valid, open, in-guardrail work conflates it with the separate (and correctly deprecated) *old assumption* that Base44 must become mandatory runtime architecture — the same "old assumption vs. current live thing" conflation pattern as finding B3 (Community/Links), just in the design-direction domain instead of the runtime-code domain.
- RISK: A future agent following `LEGACY_ARTIFACT_MATRIX.md` literally could close Issue #90 or abandon PR #91 as "deprecated," discarding real, already-guardrailed, product-owner-approved visual-refresh work that this same documentation set (`PRODUCT_CONTRACT.md` §5, `FEATURE_REGISTRY.md`'s own "Base44 redesign path" row) says should be *kept as an optional reference* — the opposite of closing it out.
- RECOMMENDED RESOLUTION: Re-classify Issue #90 as `IN_PROGRESS` (open, actively scoped, guardrails already correctly encode the optionality contract) rather than `NEEDS_DECISION`/`DEPRECATE`; re-classify PR #91 as `IN_PROGRESS` (draft, consistent with contract) rather than `DEPRECATED`. Reserve `DEPRECATED` in this domain strictly for the historical *assumption* "Base44 must become mandatory runtime architecture" — which `DEPRECATED_DECISIONS.md` already correctly captures under "Base44 as mandatory runtime migration" — not for the currently-open, correctly-scoped work items that implement the corrected version of that assumption.

### Consolidated output (per this task's requested format)

- **ACCEPT / NEEDS FIX:** **NEEDS FIX** (5 blocking findings: B1–B5).
- **Blocking findings:** B1 (Document Vault overstated as `IN_PROGRESS`, actually 0% implemented), B2 (Weekly photo PTI conflates a real schedule mechanism with nonexistent photo capture), B3 (Community row's "no active community surface" claim is false — it's the live Links container), B4 (`DOCUMENTATION_AUTHORITY.md` lacks the intent-vs-implementation authority split), B5 (Issue #90 / PR #91 wrongly recommended for deprecation despite being the correctly-guardrailed, contract-compliant implementation of Base44-optionality).
- **Non-blocking findings:** Marketplace status/label undersells its own "defer, revisit later" text; Mobile packaging row lacks an explicit "PWA-only, no native store pipeline" disclaimer (confirmed via `manifest.json`/`package.json` — no Capacitor/Cordova/Android/iOS config anywhere in the repo); `LEGACY_ARTIFACT_MATRIX.md` omits `crewbiq-docs` issue #29 (Truckpedia epic, verified open) despite `FEATURE_REGISTRY.md` citing it; the hotfix-load-order-contract CI step uses `node --test` while every sibling step in the same workflow uses plain `node` (cosmetic only, both fail correctly on error).
- **Exact rows/files requiring correction:**
  - `docs/product/FEATURE_REGISTRY.md`: "Document Vault" row (status + evidence note), "Weekly photo PTI" row (split or footnote), "Community" row ("current behavior" text), "Mobile packaging" row (add disclaimer).
  - `docs/product/DOCUMENTATION_AUTHORITY.md`: "Source-of-truth hierarchy" section (add the two-track split).
  - `docs/product/LEGACY_ARTIFACT_MATRIX.md`: "Issue #90" row and "PR #91" row (status + recommended action), add missing `crewbiq-docs` #29 row.
  - `.github/workflows/pwa-auth-contract.yml`: hotfix-load-order-contract `run:` step (cosmetic, `node --test` → `node`).
- **Statuses recommended changing:**
  - Document Vault: `IN_PROGRESS` → `PLANNED`.
  - Weekly photo PTI: split into "PTI weekly schedule" (`IN_PROGRESS`, confirmed) and "PTI photo evidence capture" (`PLANNED`, 0% implemented).
  - Community: keep `DEPRECATED` for the historical social/community *concept*, but the row text must stop asserting the technical surface is inactive.
  - Issue #90: `NEEDS_DECISION` → `IN_PROGRESS`.
  - PR #91: `DEPRECATED` → `IN_PROGRESS`.
  - Marketplace: consider `DEPRECATED` → `NEEDS_DECISION` (current implementation dead, future concept undecided — see prior section).
- **Whether canonical docs are safe to become the documentation gate:** **Not yet.** Five distinct, independently-verified factual/classification errors (B1–B5) remain uncorrected across three of the six files. The `DOCUMENTATION_AUTHORITY.md` hierarchy itself (B4) is the structural reason these kinds of errors can occur and persist — fix that first, then the specific row-level errors, before treating `docs/product/*` as binding over code/tests for implementation-state questions.
- **Safest next bounded task after correction:** A docs-only correction commit touching exactly the rows/files listed above (no code, no tests, no CI beyond the one cosmetic line) — followed by a short re-review pass limited to confirming those specific edits, before any Slice 1 (auth/session) or Phase 1 roadmap execution begins.

---

## Canonical Documentation Re-Review — 2026-08-30

Reviewer: Claude. Correction commit under review: `41aeb7ec05a4ab5a34847128ab7f08a3b1267ba7` (`41aeb7e`) on `agent/pre-base44-audit`, authored `2026-08-30T13:56:19Z`. Files touched (verified via commit file list): `docs/collaboration/{COLLABORATION_STATE,CURRENT_STATUS,HANDOFF,WORK_LOG}.md`, `docs/product/{PRODUCT_CONTRACT,FEATURE_REGISTRY,ROADMAP,DEPRECATED_DECISIONS,DOCUMENTATION_AUTHORITY,LEGACY_ARTIFACT_MATRIX}.md`. **No product/runtime code, tests, CI/workflow files, schemas, issues, PRs, or deployment were touched — confirmed.**

Method: diffed every `docs/product/*.md` file against the pre-correction version reviewed in the sections above, line by line, and re-verified the changed factual claims (mobile packaging config, `crewbiq-docs` issue numbers, Issue #90/PR #91 text) directly against live GitHub/repo state rather than trusting the diff alone.

### VERDICT: **NEEDS FIX**

This verdict is narrowly scoped: **B1–B4 are all correctly and thoroughly resolved.** The single remaining item is a previously-flagged, still-open finding (B5, from the addendum above) that this same correction commit had the opportunity to fix — it was published 39 minutes before commit `41aeb7e` — but did not.

### B1 status: **RESOLVED**

`FEATURE_REGISTRY.md`'s Document Vault row now reads `PLANNED`, "**not implemented / missing**: OCR screens state source files are not stored," "no storage path currently exists." `PRODUCT_CONTRACT.md` §2 now states the current-implemented-behavior/approved-contract split explicitly. `ROADMAP.md` Phase 2 adds "Explicitly mark Document Vault as implemented-missing in canonical inventory until hash/provenance/object-store pipeline is delivered." `DEPRECATED_DECISIONS.md`'s row now says "OCR UI still says 'not stored.' The missing-implementation behavior remains to be implemented, not a completed feature." This is exactly the correction recommended — status changed, evidence note added, no overstatement remains.

### B2 status: **RESOLVED**

`FEATURE_REGISTRY.md` now has two separate rows: "Weekly PTI Scheduling" (`ACTIVE`, "recurring/PTI scheduling runtime and `ptiSchedule`-style logic with weekly cadence checks are present" — matches the confirmed real code in `pti.js`) and "Weekly PTI Photo Evidence" (`PLANNED`, "durable photo/camera evidence capture and linkage is not implemented yet... gap is confirmed by code evidence"). `ROADMAP.md` Phase 3 was restructured to sequence these as separate steps. This is exactly the split recommended, and correctly grounded in the same code evidence (`ptiSchedule`, Monday auto-detect) this review originally cited.

### B3 status: **RESOLVED**

Three independent, mutually-reinforcing protections were added: (1) `PRODUCT_CONTRACT.md` §5 — "Links remains active through technical container `page-community` + `renderCommunity()` and must not be removed until Links has safe extraction and contract tests." (2) `FEATURE_REGISTRY.md`'s Links row "Conflicts" cell — bolded: "**Do not remove/rename `page-community` or `renderCommunity` before Links extraction is safely migrated and contract-tested**." (3) `DEPRECATED_DECISIONS.md` adds a dedicated new row: "Broad 'community' product surface in runtime" → superseded by "`page-community` is preserved for Links until migration + contract testing; broader community concept is deferred, not removed." The exact hazard flagged in B3 (an agent reading "Community: DEPRECATED" and deleting the live container) is now closed off in three separate places. Minor cosmetic note: the Community row's `Status` cell reads `DEPRECATED (surface concept) / TECHNICAL_CONTAINER ACTIVE`, a compound label outside the strict `ACTIVE/IN_PROGRESS/PLANNED/SUPERSEDED/DEPRECATED/ABANDONED/NEEDS_DECISION/UNKNOWN` enum — semantically unambiguous and correct, but worth normalizing to one enum value plus an explanatory note in a future pass (non-blocking).

### B4 status: **RESOLVED**

`DOCUMENTATION_AUTHORITY.md` now has an explicit **"TRACK A — IMPLEMENTED BEHAVIOR TRUTH"** (current `main` + tests + verified runtime/production evidence; used to set `Status`/`Current behavior` columns) and **"TRACK B — PRODUCT INTENT TRUTH"** (`PRODUCT_CONTRACT.md`, `FEATURE_REGISTRY.md`, `ROADMAP.md`, accepted current decisions; used to set `Current approved direction`/planning status), plus an explicit "Truth coupling rule": *"Approved requirement does not mean implemented. Implemented behavior does not mean approved long-term behavior. ... If Track A and Track B disagree, classify the feature state explicitly and request a product decision rather than inferring behavior from prose alone."* This is exactly the split requested and directly addresses the root cause that allowed B1/B2 to happen. One sentence in the "Truth coupling rule" is circularly worded ("prefer the explicit canonical Track A/Track B evidence as described above") but the substantive rule that follows is clear — non-blocking wording nit only.

### Other required verifications

- **Mobile packaging:** now `PLANNED`, "native/store packaging pipeline evidence is not present; only mobile-friendly frontend behavior is observed... defer app store packaging until explicit roadmap sequencing." Independently re-confirmed via `manifest.json` (PWA manifest only, no native config) and `package.json` (no Capacitor/Cordova/Android/iOS dependency) — matches reality, no overstatement remains.
- **Marketplace:** legacy shell vs. future concept now explicitly separated: Status `DEPRECATED (legacy shell) + FUTURE concept pending`, "legacy `page-marketplace` container/render path exists but is not navigable from runtime flows... separate legacy shell risk from future strategy." Correctly resolved (same compound-label cosmetic note as Community, non-blocking).
- **Issue #21:** now correctly split — "Still valid for editable groups, segmentation, reconciliation, single-count, lineage, and duplicate prevention" / "Only conflict is the non-storage assumption: 'original file remains unstored'." Exactly matches the required distinction between the obsolete source-retention clause and the still-valid accounting/segmentation requirements.
- **`crewbiq-docs` #29 citation:** now correctly attached to "CrewBIQ Knowledge Engine and Truckpedia" in `LEGACY_ARTIFACT_MATRIX.md`. Independently re-verified via `gh api`: issue #29 in `crewbiq-docs` is open and titled "Epic: CrewBIQ Knowledge Engine and Truckpedia." This also fixes a citation error this review had not previously caught: the *prior* version of this matrix had attached that same title to "#32," which is actually a different, unrelated open issue ("Architecture: production domain, hosting, and service boundaries for crewbiq.com"). Net improvement beyond what was asked.
- **No product/runtime code, tests, CI, schemas, issues, PRs, or deployment modified:** confirmed via the commit's file list — 10 files, all under `docs/collaboration/` or `docs/product/`.

### Residual blocking finding: B5 carried forward, unaddressed

- CODEX CLAIM (unchanged from before `41aeb7e`, re-confirmed still present after it): `LEGACY_ARTIFACT_MATRIX.md` — "Issue #90 — Base44-inspired UI refresh," Status changed from `NEEDS_DECISION` to **`DEPRECATED`**, action still `DEPRECATE`, justified by "Conflicts with optionality rule." "PR #91 — begin Base44-inspired UI refresh" unchanged at `DEPRECATED` / `DEPRECATE`.
- CURRENT EVIDENCE: Same as the previous addendum's B5 finding — Issue #90's own text (re-read in full, unchanged) states the work is *"the Base44-inspired visual direction approved by the product owner"* with explicit non-negotiable guardrails ("do not introduce parallel entities or a second application architecture"); PR #91's draft body states it "kept all data, storage, calculations, sync, identity, and offline logic untouched." Both remain open/open-draft.
- YOUR VERDICT: Not only unresolved, but the status moved in the wrong direction — `NEEDS_DECISION` → `DEPRECATED` is a stronger, more final claim than before, while the actual evidence (an approved, guardrailed, still-open, contract-compliant work item) hasn't changed. This finding was published (in the addendum above) 39 minutes before commit `41aeb7e` landed, so it was available to this correction pass.
- RISK: Unchanged from before — a future agent or automated issue-hygiene sweep following this matrix could close Issue #90 or abandon PR #91 as "deprecated," discarding real, guardrailed, product-owner-approved visual-refresh work that `PRODUCT_CONTRACT.md` §5 and `FEATURE_REGISTRY.md`'s own "Base44 redesign path" row both say should be *preserved* as an optional reference.
- RECOMMENDED RESOLUTION: Unchanged — re-classify Issue #90 and PR #91 as `IN_PROGRESS` (open, correctly guardrailed, consistent with the Base44-optionality contract). Reserve `DEPRECATED` in this domain for the historical *assumption* "Base44 must become mandatory runtime architecture," which `DEPRECATED_DECISIONS.md` already correctly captures separately.

### Summary

- **B1:** RESOLVED
- **B2:** RESOLVED
- **B3:** RESOLVED
- **B4:** RESOLVED
- **B5 (carried forward, not part of the original B1–B4 scope but still open):** NOT RESOLVED — regressed one notch (`NEEDS_DECISION` → `DEPRECATED`) rather than corrected.
- **Non-blocking:** compound status labels for Community/Marketplace outside the strict status enum; one circularly-worded sentence in `DOCUMENTATION_AUTHORITY.md`'s Truth coupling rule. Neither causes operational risk.

### Whether canonical product docs are now safe to become the documentation gate

**Not fully — one small, known correction remains.** All four originally-scoped blocking findings (B1–B4) are cleanly and thoroughly resolved, including two fixes (mobile packaging, the #29/#32 citation mix-up) that went beyond what was strictly asked. The documentation package is close to gate-ready. But `LEGACY_ARTIFACT_MATRIX.md`'s Issue #90 / PR #91 rows still recommend `DEPRECATE` for guardrailed, contract-compliant, currently-open work — a real risk if any future process (automated or agent-driven) acts on "recommended action" columns literally. This is a two-row edit, not a re-architecture of the documentation framework.

### GO / NO-GO for selecting the first real decomposition slice

**NO-GO**, unchanged. This remains a documentation-only correction/re-review cycle. Recommend one more small, targeted correction commit (Issue #90 and PR #91 rows only) before treating `docs/product/*` as the closed documentation gate, and before any Slice 1 (auth/session) or `ROADMAP.md` Phase 1 execution begins.

---

## Slice 1A Independent Review — 2026-08-30

Reviewer: Claude. Implementation commit under review: `c8aaf45b207064fbd9db93a96ab73a539a1fa0ed` (`c8aaf45`). State commit: `1884d1095d71decbb096983ca82933cf4e8680a5`. Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` (unchanged since prior reviews). Method: read every function the new `docs/collaboration/AUTH_SESSION_STARTUP_CONTRACT.md` and `tests/auth-session-startup-contract.test.mjs` cite, in full, directly from `main`'s `index.html` and `core-runtime.js` via `gh api`, and compared source text byte-for-byte against every specific claim (function bodies, call order, exact string literals) rather than trusting the document's prose.

### VERDICT: **ACCEPT**

This is an unusually well-executed slice. Every specific, checkable claim in the contract and the test file was verified to match `main` exactly.

### 1. No runtime/product files changed — CONFIRMED

Commit file list: `docs/collaboration/{AUTH_SESSION_STARTUP_CONTRACT,CURRENT_STATUS,HANDOFF,WORK_LOG}.md`, `package.json` (one line, test-list addition only), `tests/auth-session-startup-contract.test.mjs`. No `index.html`, `core.js`, `core-runtime.js`, any hotfix file, `sw.js`, or workflow file appears in the diff.

### 2. Contract accuracy — verified line-by-line against `main`

Directly read and byte-compared against the actual source:
- **Startup init sequence** (§1): `runLaunchCleanResetOnce(); migrateStorage(); loadAll(); initSync(); initPTI(); initLoads();` … `applyRoleUI();` … then the `getSavedSessionToken()` branch calling `restoreSession({sessionToken:_savedSession, syncUrl:_savedUrl || driver.syncUrl, silent:true}).catch(...).finally(() => boot())`, else `setFleetRestoreSettled(true); boot();` — **matches `index.html` lines 6958–6994 exactly**, including the exact `else` branch.
- **`restoreSession()`** (§2): `setFleetRestoreSettled(false)` → token/sync-URL resolution → throw on missing token → `authPost('auth_restore', ...)` → `applyAuthRestoreData` → conditional `restoreFleetConfigFromOrchestrator(driver.crewId)` → `saveAll(); saveDriverProfile(); renderAll(); setFleetRestoreSettled(true)` — **matches `index.html:2373-2389` exactly**, condition included (`driver.crewId && (!loadTrucks().length || !loadDriverProfiles().length)`).
- **`boot()`/`showApp()`** (§1, §6): setup-screen early return, then `if(needsPTI()){ showPTIBlocker(); } else { showApp(); }` — **matches `index.html:2563-2589` exactly**.
- **`logoutDevice()`** (§7): confirmation → `registerAccountId(...)` → `importLegacyPaySettingsIntoScope()` with quarantine-failure abort → best-effort `auth_logout` → selective clear (`removeItem('driver')`, `clearSessionToken()`) while preserving `_savedSyncUrl`, `_savedPtiSched`, and fleet-config keys → `location.reload()` — **matches `index.html:2502-2547` exactly**, including the quarantine-abort branch the contract calls out.
- **`activeTrucks()[0]` fallback** (§14): `getDefaultTruck(){ return findTruckByIdOrUnit(driver && driver.unitNumber) || activeTrucks()[0] || null; }` — **matches `index.html:4578-4579` exactly, verbatim**.
- **Role persistence** (§4): `core-runtime.js` sets `authUser`/`authRoles`/`userRole` (`localStorage.setItem(K+'userRole', authorizedUiRole(safeRoles))`) — **matches `core-runtime.js:236-238` exactly**.
- **No `sessionStorage` dependency** (§10): confirmed zero occurrences of `sessionStorage` in both `index.html` and `core-runtime.js`.

No claim I checked was wrong, imprecise, or unsupported. This is a materially higher bar of self-verification than the Slice 0 hotfix-contract doc needed to clear (that one had 18 simple string-order facts; this one required tracing five separate control-flow functions).

### 3. Evidence-label accuracy — honest, no false confidence

Every claim about actual browser-visible, backend-authenticated, or installed-PWA behavior is correctly labeled `E2E_REQUIRED` or `STAGING_REQUIRED`, never asserted as proven. The document is explicit that the new test is `STATIC_CONTRACT` only ("runtime outcome is not proven") and separately lists, in §15, exactly what is *not yet* protected by meaningful runtime evidence (installed offline cold start, browser-visible expired-session handling, complete role restoration after cold restore, corrected ambiguity handling) — this is precisely the anti-false-confidence discipline item 7 of this task asked to verify, and it's done correctly. The disposition taxonomy (`PRESERVE_IN_EXTRACTION` / `KNOWN_UNSAFE_CURRENT_BEHAVIOR` / `UNKNOWN / NEEDS_RUNTIME_VERIFICATION`) is applied consistently — nothing is marked `PRESERVE_IN_EXTRACTION` that should be `UNKNOWN`, and nothing risky is quietly folded into `PRESERVE_IN_EXTRACTION`.

### 4. Disposition of `activeTrucks()[0]` — correctly isolated

Explicitly labeled `KNOWN_UNSAFE_CURRENT_BEHAVIOR` (§14), explicitly excluded from the `PRESERVE_IN_EXTRACTION` invariant list (§16: *"The ambiguous first-truck fallback is explicitly excluded from preservation. The corrected invariant is: no first-truck fallback for ambiguous ownership or assignment"*), and explicitly named as the Slice 1B blocker (§17). This directly extends `PRODUCT_CONTRACT.md`'s existing "no first-truck fallback for ambiguous load assignment" invariant to truck default-selection — a consistent generalization, not a new or contradictory rule.

### 5. Test adequacy — proves exactly what it claims, no more

`tests/auth-session-startup-contract.test.mjs` uses source-slicing (`section()`) and ordered-marker assertions (`assertOrdered()`) against literal strings pulled from `index.html` — the same "bare script + `node:test`" pattern already used by `driver_projections.test.mjs` and siblings, and it correctly imports `test` from `node:test` (unlike the Slice 0 hotfix test, which used the same convention without the import — this one gets the convention right). All 5 assertions were independently re-derived from the real source during this review and matched. The test proves **source-order and literal-presence facts only** — it cannot and does not claim to prove browser-visible outcomes, which the contract doc correctly defers to `E2E_REQUIRED`/`STAGING_REQUIRED`. No false confidence is created.

### 6. CI/npm wiring — confirmed

`package.json`'s `test:e2e:tooling` now includes `tests/auth-session-startup-contract.test.mjs` (verified directly in the diff and via `gh api` on the commit). Unlike the Slice 0 hotfix test, this one is wired in from the same commit that introduces it — no follow-up "0b-style" closure needed.

### 7. Non-blocking findings

- **A relevant existing code comment isn't surfaced in the contract.** `logoutDevice()` in `index.html` (lines 2504-2516, unchanged by this slice) contains a prior-review comment noting that `applyAuthRestoreData()`'s "switch" identity-transition classification never actually fires in the shipped UI — only "initial" does, because `logoutDevice()` clears `driver` and reloads before any next login can run in the same in-memory call chain. `AUTH_SESSION_STARTUP_CONTRACT.md` §3 states account switches "do not carry the previous driver's local fields... into the incoming account," which remains true in observable outcome, but doesn't mention that this happens via the *only reachable path* ("initial"), not via a working "switch" path. Doesn't affect the contract's correctness, but a future extraction agent relying on this document to reason about identity-transition code should know the "switch" branch is effectively dead code today.
- Cosmetic only: §16's restated first-truck-fallback invariant doesn't cross-reference `PRODUCT_CONTRACT.md`'s existing wording verbatim, though the substance is a faithful, non-contradictory extension of it.

### Unsafe-behavior inventory (as documented, independently re-confirmed)

| Item | Status | My assessment |
| --- | --- | --- |
| `activeTrucks()[0]` ambiguous first-truck fallback | `KNOWN_UNSAFE_CURRENT_BEHAVIOR`, blocks Slice 1B | Confirmed real, confirmed correctly classified, confirmed correctly blocking. |
| `runLaunchCleanResetOnce()` one-time reset | `UNKNOWN / NEEDS_RUNTIME_VERIFICATION` | Reasonable — installed-client/interrupted-storage outcomes genuinely aren't provable from source alone. |
| Generic session-failure path doesn't distinguish expired vs. transient, doesn't clear token | `UNKNOWN / NEEDS_RUNTIME_VERIFICATION` (non-destructive behavior itself is `PRESERVE_IN_EXTRACTION`) | Reasonable classification — this is a UX/reliability gap, not a confirmed cross-account or accounting hazard, so `UNKNOWN` rather than `KNOWN_UNSAFE` is the right call; I found no evidence it should be escalated to a Slice 1B blocker. |
| Dead "switch" identity-transition branch (see non-blocking findings) | Not mentioned in contract | Worth noting for a future slice, not a blocker — the corresponding user-visible invariant (no cross-account data carryover) is independently true via the "initial" path. |

No additional unsafe current behavior was found during this review that should block Slice 1B beyond what the contract already identifies.

### Whether Slice 1A can close

**Yes.** Documentation-only (plus one net-new test and its wiring), zero runtime/product changes, every specific claim independently verified against `main`, evidence labels honestly applied, and the one known-unsafe behavior correctly isolated rather than preserved.

### Whether Slice 1A.1 is the correct next step

**Yes.** Removing the ambiguous first-truck fallback with explicit ambiguity handling and corrected-behavior contract tests is a small, well-bounded, safety-improving change consistent with `PRODUCT_CONTRACT.md`'s existing "no first-truck fallback" invariant, and it's the one concrete blocker this slice identified.

### Whether Slice 1B must remain blocked

**Yes**, until Slice 1A.1 lands and is independently re-reviewed. No other finding in this review adds a new blocker beyond `AMBIGUOUS_FIRST_TRUCK_FALLBACK`.

---

## Slice 1A.1 Independent Review — 2026-08-30

Reviewer: Claude. Commit under review: `f16534a009fc2e84e14509ddd87b473dfd05425f` (`f16534a`) on `agent/pre-base44-audit`, parent `c960dfb85d6b0cd189d3c879f3f5f8d3167a0f49`. Method: fetched `index.html`, `loads.js`, `sw.js`, `fleet-load-resolution.js`, and the two test files directly from this commit via `gh api` (not from an older cached copy), read every changed function's full body and every read/write call-site it touches, and independently traced the mutation and read-only-projection paths rather than trusting the diff or the contract doc's own claims.

### VERDICT: **ACCEPT**

### 1. Old unsafe fallback confirmed removed

`getDefaultTruck(){ return resolveDefaultTruck(driver, activeTrucks()); }` — the literal string `activeTrucks()[0]` no longer appears anywhere in `getDefaultTruck()`. `resolveDefaultTruck(driverValue, trucks)`:
```
trucks = trucks.filter(t => t && t.active !== false);
var explicitAssignment = String((driverValue && driverValue.unitNumber) || '').trim();
if(explicitAssignment){ return trucks.find(...) || null; }
return trucks.length === 1 ? trucks[0] : null;
```
No silent first-item selection remains when assignment is ambiguous.

### 2. Explicit assignment behavior — verified correct

- Valid explicit assignment resolves correctly: confirmed both by reading the source and by the test's real execution of the extracted function (`resolveDefaultTruck({unitNumber:'202'}, [truckA, truckB]) === truckB`).
- Invalid non-empty explicit assignment fails closed: `trucks.find(...) || null` — no `|| activeTrucks()[0]` after it. Confirmed by test: `resolveDefaultTruck({unitNumber:'missing'}, [truckA])` returns `null`, not `truckA`.
- Never silently redirects to another truck: confirmed — the explicit-assignment branch has exactly one `return`, with no further fallback expression after it.

### 3. No-explicit-assignment behavior — verified correct

- Zero active trucks → `null` (confirmed, both by source and by test).
- Exactly one active truck → that truck, genuinely treated as unambiguous (`trucks.length === 1 ? trucks[0] : null` — there is no competing candidate in that state, so this is not a "first of many" fallback, it's the only truck; confirmed by test).
- More than one active truck, no explicit assignment → `null`, no silent first-truck selection (confirmed by source and by test: `resolveDefaultTruck({}, [truckA, truckB])` returns `null`).

### 4. Every changed runtime call-site reviewed

Read the full body of every function touched in `index.html` and `loads.js`:

- **`saveFuelLog()`, `applyDedTemplate()`, `saveDedModal()`'s current-week branch, `deleteDedItem()`, `saveServiceLog()`** (`index.html`): each now has `if(!truckId){ toast('Truck assignment required','err'); return; }` immediately after resolving `truckId`, before any read of `document.getElementById` beyond what's needed for the guard or any persistence call. No dereference of a null/undefined truck occurs in any of these — verified by reading each function's full body, not just the diff hunk.
- **`getCurrentWeekDed()`** (read path, not a mutation): returns a sentinel `{id:'', weekKey:wk, truckId:'', items:[], total:0, unresolvedTruck:true}` instead of toasting. Its one caller, `renderDeductionsPage()`, handles this safely (`(wd.items||[])`, `wd.total||0`) — no crash, no wrong-truck attribution. The `unresolvedTruck` flag itself is not yet read/rendered anywhere (non-blocking, noted below).
- **`getDefaultTruck()`'s read-only callers, `currentCarrierCompany()` and `currentDriverAssignment()`**: both already null-safe (`truck ? ... : null`-style guards existed before this commit and still work correctly with a `null` return); no crash, no silent misattribution.
- **`renderTruckSelect()`/`selectedTruckId()`** (shared by fuel/service/deduction/load selectors): the old code was `findTruckByIdOrUnit(preferred) || findTruckByIdOrUnit(sel.value) || getDefaultTruck() || trucks[0]` — note this had **two** first-truck-fallback layers (the inner `getDefaultTruck()` and an outer `|| trucks[0]`, the latter of which could even throw if `trucks` were empty). Both are now removed; unresolved state renders a disabled `<option value="" selected disabled>Truck assignment required</option>` placeholder and returns `''`.
- **`populateLoadTruckSelect()`/`getLoadTruckSelection()`** (`loads.js`): same pattern — old `trucks[0].id` unconditional fallback removed, replaced with the same explicit-or-single-truck-only logic; the load-save call site gained `if (!truckSel.truckId) return _toast('Truck assignment required', 'err');` immediately before persistence.
- **OCR prefill paths** (`applyScanToFuel`/`applyScanTruck`, `applyScanToLoad`): traced independently — neither bypasses the fix. `applyScanTruck` only calls `renderTruckSelect(..., unit)` when OCR actually extracted a unit; when it doesn't, the selector falls through to the same fixed default-resolution logic, and the eventual save still goes through the guarded `selectedTruckId()`/`getLoadTruckSelection()` path. `applyInvoiceToFuelLogs()` (the bulk fuel-invoice OCR import) was not touched by this commit and has never attributed a `truckId` to its entries at all — pre-existing, unrelated behavior, not a regression from this fix.
- **`fleet-load-resolution.js`** (not touched by this commit, checked anyway per item 11): every `[0]`-style indexing in this file (`candidates[0]`, `matchingProfiles[0]`, `uniqueLinked[0]`) is guarded by an explicit `.length === 1`/`.length !== 1` check immediately before, i.e. "the only candidate," not a first-of-many fallback. This file was already built to the same discipline (consistent with its own PR history, "protected unresolved load assignment workflow").

No immediate null dereference, no silent mutation against the wrong truck, and no hidden first-item fallback found anywhere in the reachable assignment/mutation paths.

### 5. Unrelated behavior — none found changed

Diff is scoped exactly to truck default-resolution and its direct callers/guards, the corresponding test/doc updates, the CI path-filter/step addition, and the service-worker cache-version bump. No auth/session/startup function body, no loader file, no accounting-formula code, and no unrelated UI was touched.

### 6. Test adequacy — real runtime semantics, not just string matching

`tests/first-truck-fallback.test.mjs` extracts `resolveDefaultTruck`'s actual source via `Function(...)` construction and **executes it as real code** against literal truck objects (`truckA`, `truckB`) for every one of the scenarios in items 2–3 above — this directly answers item 6's concern: the highest-risk function is proven by genuine execution, not brittle string matching. The remaining assertions (mutation-caller guards, selector placeholder text, absence of `trucks[0]`) are intentionally source-shape checks (`STATIC_CONTRACT`-level, consistent with this repo's existing convention for guard-clause presence/ordering) — appropriately labeled, not overclaimed as proof of runtime behavior. One assertion goes further than simple presence-checking: it verifies the guard clause's *ordering* relative to the persistence call (`currentDeduction.indexOf('if(!truckId)') < currentDeduction.indexOf('saveWeeklyDeds(list)')`), which is a meaningful safety-ordering proof, not just presence.

### 7. Test wiring into npm/CI — confirmed

`package.json`'s `test:e2e:tooling` includes `tests/first-truck-fallback.test.mjs` (verified in the diff). `.github/workflows/pwa-auth-contract.yml` gained `index.html` and `loads.js` to its `pull_request`/`push` path-filter triggers (previously absent — a real, valuable side-fix: this workflow could not have re-triggered on a direct `index.html`/`loads.js` edit before this commit), added `tests/first-truck-fallback.test.mjs` to the same path filters, and added a `run: node --test tests/first-truck-fallback.test.mjs` step. Both files landed in the same commit as the fix — no follow-up "0b-style" closure needed.

### 8. Existing Slice 1A contract — updated correctly, still passes

`tests/auth-session-startup-contract.test.mjs`'s "known unsafe fallback" test was correctly inverted: it now asserts `activeTrucks()[0]` is **absent** and `resolveDefaultTruck(driver, activeTrucks())` is **present** in `getDefaultTruck()` — both verified true by direct source inspection. `AUTH_SESSION_STARTUP_CONTRACT.md` §14 was updated from `KNOWN_UNSAFE_CURRENT_BEHAVIOR` to `RESOLVED_IN_SLICE_1A_1` with an accurate call-site inventory table that matches every call-site this review independently traced — no material omission found. §17 was updated to `READY_FOR_SLICE_1B`.

### 9. Cache-version rotation — correct

`sw.js`: `CACHE_NAME` bumped `crewbiq-driver-v79` → `crewbiq-driver-v80` (and the header/log-string version comment bumped in step). Justified: both `index.html` and `loads.js` are in `sw.js`'s own `APP_SHELL` cache-first list, and their runtime behavior changed, so a stale installed client must be forced to fetch the new versions — exactly the rule `sw.js`'s own header comment states ("bump CACHE_NAME any time an APP_SHELL file changes"). The CI workflow's own grep-based verification step was correctly updated in the same commit (`crewbiq-driver-v79` → `crewbiq-driver-v80`).

### 10. No loader-order change — confirmed

`core.js` does not appear in this commit's file list at all. The 18-script hotfix chain is untouched.

### 11. No auth/session extraction — confirmed

No auth/session/startup function (`restoreSession`, `boot`, `showApp`, `logoutDevice`, `applyAuthRestoreData`, `core-runtime.js`) appears in this diff. The change is confined to truck default-resolution and its selector/mutation call-sites.

### 12. Remaining unsafe fallback search — clean

Grepped `index.html`, `loads.js`, and `fleet-load-resolution.js` for any remaining `trucks[0]`/`activeTrucks()[0]`/`loadTrucks()[0]`-style pattern. The only two `trucks[0]` occurrences left (`index.html`'s `resolveDefaultTruck`, `loads.js`'s `populateLoadTruckSelect`) are both guarded by `trucks.length === 1` immediately before — the intentional, safe "exactly one truck" case, not an ambiguous fallback. No other direct or indirect first-truck fallback found in the relevant assignment/mutation paths.

### Non-blocking findings

- **Case/whitespace-sensitivity inconsistency in `resolveDefaultTruck()`'s explicit-assignment match.** It compares `String(t.id||'') === explicitAssignment || String(t.unitNumber||'') === explicitAssignment` — case-sensitive, and the truck-side values aren't trimmed — whereas `findTruckByIdOrUnit()` (used everywhere else, including `renderTruckSelect`'s own explicit-key branch two lines away in the same file) normalizes via `.trim().toLowerCase()`. A driver whose `unitNumber` matches a truck's `unitNumber`/`id` only case-insensitively (e.g. trailing whitespace, or "Unit5" vs "unit5") would have resolved correctly under the old code's `findTruckByIdOrUnit(...)` call but will now fail closed ("Truck assignment required") under `resolveDefaultTruck`'s reimplemented comparison. This fails *safely* (blocks the mutation rather than misattributing it), so it is not a safety regression, but it is a real functional regression risk for any driver/truck pair with such a mismatch. Recommend `resolveDefaultTruck` call `findTruckByIdOrUnit(explicitAssignment)` directly instead of reimplementing the match.
- **`saveDedModal()`'s template-save branch (`_dedModalMode === 'template'`) has no `!truckId` guard**, unlike its sibling current-week-deduction branch three lines below it. When the truck is unresolved, `findTruckByIdOrUnit(selectedTruckId('dedTruckSelect'))` returns `null`, and the saved template is persisted with an empty `carrierCompanyRef` (i.e., it becomes a "generic" template per the existing `deductionTemplatesForTruck()` filter logic) rather than being blocked or flagged. Not a financial-mutation hazard — no money is attributed to any truck here, and `applyDedTemplate()` (which actually applies a template as a real deduction) is correctly guarded — but it's an inconsistent application of the new fail-closed discipline, worth a follow-up.
- **The `unresolvedTruck: true` flag on `getCurrentWeekDed()`'s sentinel return is not yet consumed anywhere in rendering.** Harmless (the render path already degrades safely without it), but currently a dead hook — a future pass could use it to show an explicit "select a truck to see this week's deductions" message instead of an empty list.
- **Pre-existing, unrelated inconsistency (not introduced by this commit):** `loads.js` has its own separate `findTruckByIdOrUnit()` (case-sensitive, no `normalizeFleetLookupValue`-style normalization) distinct from `index.html`'s global one (case-insensitive). Both pre-date this commit and weren't touched by it; noted only because it's adjacent to the case-sensitivity finding above and worth harmonizing in the same future pass.

### Whether Slice 1A.1 can close

**Yes.** The unsafe fallback is genuinely removed at every call-site, every changed mutation path fails closed rather than silently misattributing data, the new test proves the core resolver by real execution, CI/npm wiring landed in the same commit, the cache-version bump is correctly justified and complete, and no loader-order or auth/session code was touched. The non-blocking findings above are all fail-safe (they block a mutation rather than risk a wrong-truck one) and are appropriate follow-up items, not reasons to reopen this slice.

### Slice 1B readiness

**READY_FOR_SLICE_1B** — independently confirmed, not merely accepted on Codex's assertion. The one blocker identified after Slice 1A (`AMBIGUOUS_FIRST_TRUCK_FALLBACK`) is resolved and verified. Recommend the two non-blocking items (case-sensitivity harmonization in `resolveDefaultTruck`, the unguarded template-save branch) be picked up as a small follow-up at some point, but neither rises to a Slice 1B blocker.

