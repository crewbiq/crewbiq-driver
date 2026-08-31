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

---

## Slice 1B Independent Review — 2026-08-30

Reviewer: Claude. Final composed state reviewed: `54655e461c3357f9e6af07bf2f2145f5d7bfe84e` on `agent/pre-base44-audit`, comprising the linear chain `f8503874` (original extraction) → `fdd6902d` (blocking correction) → `b9d49cc1` (composition guard) → `54655e46` (publication/docs). Confirmed linear via `.parents[0].sha` at each step. Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` (unchanged). Baseline for comparison: the Slice 1A.1-accepted state (`f16534a0`).

Method: fetched `index.html`, `startup-session.js`, `loads.js`, `sw.js`, `core.js`, `package.json`, and all four relevant test files directly from the final commit `54655e46` via `gh api` — not from the original `f8503874` in isolation, per the task's instruction. Ran the extracted inline `<script>` block and `startup-session.js` through Node's own parser (`node --check`) independently of the repo's own vm-based parse test. Diffed the complete `index.html` and `loads.js` against the Slice 1A.1 baseline to see the *entire* change surface, not just the hunks Codex chose to show. Also independently inspected `f8503874` (the original, uncorrected extraction) to understand and confirm the actual bugs the correction commits fixed, rather than taking the "blocking correction" label at face value.

### VERDICT: **ACCEPT**

### Primary questions

1. **Does `startup-session.js` now own a real coherent coordinator boundary?** Yes. It is a pure factory (`create(deps)`) with no load-time side effects — `global.CrewBIQStartupSession = Object.freeze({create})` is the only top-level statement. `boot()`, `restoreSession()`, `showApp()`, and `start()` all operate purely on an injected `deps` object; nothing reaches into `index.html`'s global scope directly. This is a genuine dependency-injected coordinator, not a copy-paste with a thin wrapper.
2. **Is observable behavior preserved relative to the Slice 1A contract?** Yes, verified line-for-line — see "Behavior preservation" below.
3. **Did `index.html` actually lose meaningful orchestration code, or just wrap duplicated logic?** It lost real code: the full bodies of `restoreSession()`, `showApp()`, and the final inline restore-or-boot block are gone from `index.html`, replaced by one-line delegating shims and a single `getStartupCoordinator()` composition-root function. `boot()`'s own PTI/showApp decision also moved out; `index.html` retains only `renderStartupShell()` (pure DOM header rendering) as boot-adjacent logic. Confirmed via a complete diff (below) — this is a real extraction, not cosmetic wrapping.
4. **Are compatibility shims safe?** Yes — each shim (`restoreSession`, `boot`, `showApp`) is a single-line delegation to `getStartupCoordinator()`, with no residual logic, and `index-startup-composition.test.mjs` pins that exactly one `restoreSession` definition exists and that it contains no leaked `setFleetRestoreSettled(false)` (the tell-tale sign of the original bug, see below).
5. **Are ownership boundaries clear?** Yes. `startup-session.js` owns orchestration only; `index.html` remains the composition root (wires concrete functions into `deps`) plus DOM rendering and business logic; `core-runtime.js`, `restore-hotfix.js`, `offline-sync-queue.js`, and `pti.js` are all untouched and consumed by the coordinator purely as injected functions (e.g. `deps.needsPTI`/`deps.showPTIBlocker`, confirmed defined in `pti.js` and exposed as globals — not absorbed into the coordinator). No boundary overlap or duplication introduced.

### A. Parse / composition — verified independently, not just via the repo's own test

- Extracted `index.html`'s single inline `<script>` block (300,849 chars) and ran `node --check` on it directly: **parses cleanly**.
- Ran `node --check` on `startup-session.js` directly: **parses cleanly**.
- Fetched the *original* extraction commit (`f8503874`) and found the actual bug the "blocking correction" fixed: `function restoreSession(options={}){ return getStartupCoordinator().restoreSession(options); }){` — a literal dangling `){` left over from a botched edit, immediately followed by an orphaned `async function authLogin(){` — this is exactly the class of bug a naive line-based patch tool produces. Confirmed **absent** in the final state: `final_index.html` shows a clean 3-line `restoreSession` shim with no dangling tokens.
- Confirmed via regex count that exactly **one** `function restoreSession(options={})` definition exists in the final `index.html` (matches `index-startup-composition.test.mjs`'s own assertion, independently re-derived).

### B. PTI routing — confirmed single ownership, no duplication

- Read `renderStartupShell()`'s full body in the final state (lines 2581–2597): DOM header updates only (name, unit, company row, team row). **Does not** call `needsPTI()`, `showPTIBlocker()`, or `showApp()`.
- Compared against the *original* extraction (`f8503874`): `renderStartupShell()` there **still contained** the leftover line `if(needsPTI()){ showPTIBlocker(); } else { showApp(); }` at its end — meaning in the uncorrected version, calling `boot()` would have run PTI/showApp routing **twice** (once via this leftover line inside `renderStartupShell()`, once via the coordinator's own `boot()` calling `renderStartupShell()` and then its own PTI check) — including double-scheduling `scheduleAutoSync()` and the delayed `pullFromCloud()` call. This is a real, serious bug the correction fixed, not a cosmetic one.
- Grepped the final `index.html` for direct calls to `needsPTI()`, `showPTIBlocker()`, and `scheduleAutoSync()`: **zero** matches outside `startup-session.js`. `showApp()` appears only as the one-line delegating shim definition. The single non-startup `pullFromCloud(` call site in `index.html` (inside `restoreFromCloud()`, a distinct user-triggered manual "restore" action, unrelated to the startup auto-pull) was independently traced and confirmed to be pre-existing, unrelated functionality.
- `startup-session-coordinator.test.mjs`'s "one startup invocation performs one auth restore and one delayed pull" test genuinely executes the module (via `node:vm`) with counting mocks and asserts `authCalls === 1`, one `'app:show'` event, `scheduleCalls === 1`, `pullCalls === 1` — this is real proof, not inference.

### C. Restore behavior — matches the Slice 1A contract exactly

Traced `startup-session.js`'s `restoreSession()` step-by-step against `AUTH_SESSION_STARTUP_CONTRACT.md` §2 and the Slice 1A-verified `index.html` implementation: `deps.setFleetRestoreSettled(false)` → token/sync-URL resolution → throw on missing token → `deps.authPost('auth_restore', ...)` → `deps.applyAuthRestoreData(data, syncUrl)` → conditional `deps.restoreFleetConfigFromOrchestrator(driver.crewId)` (same guard condition: `driver.crewId && (!loadTrucks().length || !loadDriverProfiles().length)`) → `deps.saveAll()` → `deps.saveDriverProfile()` → `deps.renderAll()` → `deps.setFleetRestoreSettled(true)` → non-silent status message → `return {...deps.unwrapAuthResponse(data), fleetRestore}`. Every step present, in the same order, with the same conditions. Independently re-derived the exact event sequence the coordinator test asserts (`['settled:false','auth-post','apply-auth','fleet-restore','save-all','save-profile','render','settled:true','login-status']`) by hand-tracing the code and confirmed it matches.

### D. Startup failure path — confirmed via genuine execution

Traced `startup-session-coordinator.test.mjs`'s "failed startup restore still reaches boot without clearing continuity state" test by hand: with `driver = null` and `authPost` throwing, `start()` still enters the `restoreSession(...).catch(warn).finally(() => boot())` branch (since a saved session token and `savedUrl` are present), the rejection is caught and warned (`'warn:[CrewBIQ Auth] session restore failed: offline'`), and `.finally()` still calls `boot()`, which (with `driver` null) sets `setupScreen.style.display = 'flex'` — the test asserts this exact element-state change plus the exact 3-event sequence, and I confirmed this by tracing the module's actual control flow rather than trusting the assertion. No `clearSessionToken()` or any destructive storage call occurs anywhere in this path — confirmed absent from `startup-session.js` entirely.

### E. Offline startup — unchanged

`sw.js`'s only changes across this whole chain are the `CACHE_NAME`/version-string bump (`v80` → `v81` → `v82`, tracking `index.html` changes at each step) and adding `/crewbiq-driver/startup-session.js` to `APP_SHELL`. Network-only auth/API routing rules are untouched (confirmed unchanged in the diff). `offline-sync-queue.js` is not in this commit chain's file list at all — queue ownership is untouched.

### F. Role / identity — no migration, no behavior change

`core-runtime.js` does not appear anywhere in this commit chain's file list. The role/identity persistence keys (`fiqD_authUser`, `fiqD_authRoles`, `fiqD_userRole`, `fiqD_sessionToken`, `fiqD_driver`, identity-scoped `fiqD_data_*` keys) are untouched — no file that writes them was modified.

### G. Logout — byte-for-byte unchanged

Extracted `logoutDevice()`'s full body from both the Slice 1A.1 baseline and this final state and diffed them directly: **byte-identical**, including the pre-existing "switch never fires" comment. No accidental interaction with the coordinator extraction.

### H. Slice 1A.1 regression check — clean

Extracted and diffed `getDefaultTruck()`/`resolveDefaultTruck()` (`index.html`) and `populateLoadTruckSelect()` (`loads.js`) between the Slice 1A.1 baseline and this final state: **byte-identical** in both files. Additionally grepped the entire final `index.html` and `loads.js` for `activeTrucks()[0]` and `|| trucks[0]`: **zero matches**. `loads.js` as a whole file is byte-identical to the Slice 1A.1 baseline (confirmed via full-file diff) — Slice 1B did not touch it at all, matching the commit's own claim.

### I. Loader order — confirmed unchanged and safely positioned

`core.js` at the final commit is byte-identical to `main`'s `core.js` (confirmed via direct diff) — the 18-script hotfix chain and its order are completely untouched. `startup-session.js` is loaded via a new `<script src="startup-session.js?v=20260830-slice1b-v1">` tag appended **after** the five existing static tags (`core.js`, `sync.js`, `pti.js`, `loads.js`, `fleet-load-resolution.js`) — a purely additive insertion at the end of the static-tag list, not interleaved with them. `startup-session.js` itself has no load-time side effects (it only assigns a frozen factory object), so its dependencies (all the `deps.*` functions) only need to exist by the time `getStartupCoordinator()` is first *called* at runtime — well after all scripts, inline and external, have loaded. Position is safe.

### J. Service worker — correct across the full chain

Verified all three cache-version steps directly: Slice 1A.1 baseline `v80` → original extraction (`f8503874`) `v81` → blocking correction (`fdd6902d`) `v82`, each bump paired with an `index.html` change in the same commit, consistent with `sw.js`'s own "bump `CACHE_NAME` any time an `APP_SHELL` file changes" rule. `/crewbiq-driver/startup-session.js` is present in `APP_SHELL` in both `v81` and the final `v82`. Final state is `v82`, matching the CI workflow's own grep-based verification step.

### K. Test adequacy

- **`index-startup-composition.test.mjs`**: extracts every executable inline `<script>` from `index.html` (filtering `src=`-linked and JSON-type scripts) and runs each through `new vm.Script(...)` — a genuine parse-smoke test, not just eyeballing. Independently re-confirmed via my own separate `node --check` run — both methods agree. Also pins exactly one `restoreSession` definition and its exact shim pattern, and asserts the old leaked-implementation pattern (`setFleetRestoreSettled(false)` appearing inside a `restoreSession` function body in `index.html`) is absent.
- **`startup-session-coordinator.test.mjs`**: loads `startup-session.js` via `node:vm.runInNewContext` and genuinely **executes** `restoreSession`, `boot`, and `start` against fully mocked `deps`, asserting exact event-order sequences (not just "was called," but "was called in this order and no other order"). This is real runtime-semantics coverage for the highest-risk behaviors (restore ordering, single PTI/showApp routing, single auto-sync/delayed-pull), independently traced and confirmed correct by hand above (§B–D).
- **`auth-session-startup-contract.test.mjs`**: correctly updated to source its assertions from `startup-session.js` where the logic now lives, and from `index.html` where the compatibility shims and unrelated functions (`logoutDevice`, `getDefaultTruck`) still live. Still `STATIC_CONTRACT`-level (source-shape only) by design, and correctly so — it doesn't overclaim proof of runtime behavior, deferring to the coordinator test for that.
- **`first-truck-fallback.test.mjs`**: unaffected by this slice (confirmed unchanged), still valid against the byte-identical `resolveDefaultTruck`/`populateLoadTruckSelect` code.
- No test in this set overstates a static check as E2E/runtime proof; the genuine-execution tests are correctly reserved for exactly the behaviors that most need them (ordering, single-invocation guarantees).

### L. Change scope — confirmed via complete diffs, not just the commit's own hunks

Diffed the **entire** `index.html` between the Slice 1A.1 baseline and this final state: exactly one new `<script src>` tag, and four locations changed (`restoreSession` → shim + `getStartupCoordinator()`, `boot`/`renderStartupShell` split, `showApp` → shim, and the final inline init block → single `getStartupCoordinator().start(...)` call). Nothing else in the 7,017-line file differs. Diffed the entire `loads.js`: **zero** differences from the Slice 1A.1 baseline. `core.js` and `core-runtime.js`: untouched (the latter not even in this chain's file list). No accounting, OCR, navigation, PTI-internals, schema, or Base44/UI-refresh file appears anywhere in this commit chain.

### Non-blocking findings

- **Cosmetic formatting artifact**: `}function boot(){ return getStartupCoordinator().boot(); }` — the closing brace of `renderStartupShell()` and the `boot()` shim definition sit on the same line with no separating whitespace/newline. This is valid JavaScript (confirmed by the parse checks above) and has zero functional effect, but it's a visible sign of a mechanical, non-formatted edit and is worth a trivial cleanup pass whenever this file is next touched for an unrelated reason. Not worth a dedicated commit on its own.
- Everything flagged as non-blocking in the Slice 1A.1 review (`resolveDefaultTruck` case-sensitivity, the unguarded deduction-template-save branch) remains present and unchanged — carried forward, not newly introduced or newly ignored by this slice.

### Coordinator boundary quality

High. `startup-session.js` is a small (72-line), single-purpose, dependency-injected module with no ambient global access and no load-time side effects — a genuinely reusable, testable unit, and a good template for how the remaining `index.html` orchestration (OCR intake, Links/`clinks`, offline-queue contract boundaries — the next steps `FUNCTIONAL_AUDIT.md`'s own "safe decomposition order" already named) should eventually be extracted.

### Whether Slice 1B is CLOSED

**Yes.** Every verification item (A–L) checks out against the actual final composed state, independently re-derived rather than accepted on the correction commits' own descriptions. The one real bug in the original extraction (duplicate PTI/showApp/auto-sync/pull routing via the leftover line in `renderStartupShell()`, plus the malformed dangling-token `restoreSession` shim) is confirmed fixed, and the fix itself is now backed by genuine execution tests that would catch a regression of either issue.

### Safest next bounded decomposition slice

**Links/`clinks` storage-and-render extraction** (matching `FUNCTIONAL_AUDIT.md`'s own "safe decomposition order" step 3, and this reviewer's repeated observation across earlier reviews that `page-community`/`renderCommunity()`/`clinks` is the most self-contained domain in `index.html` — its own storage key, no accounting/identity/PTI coupling, and no dependency on the auth/session coordinator just extracted). Recommend it over an OCR-adapter extraction next, since OCR still carries the open Document Vault gap (source-file retention) as an unresolved product dependency, whereas Links has no such open product question blocking a clean, narrow, behavior-preserving extraction.

---

## Slice 2A.0 Independent Review — 2026-08-30

Reviewer: Claude. Read the live `CURRENT_START`/`CURRENT_END` block in `docs/collaboration/COLLABORATION_STATE.md` (Phase: Slice 2A.0 — Links URL Safety Correction; Status: PUBLISHED / AWAITING CLAUDE REVIEW; latest implementation commit `3b77e163`, latest state commit `827f0222`) as the mandatory first step, then inspected the branch commit chain directly rather than trusting the CURRENT block's own summary. Chain confirmed linear: `827f0222` (state-marker repair) → `3b77e163` (runtime correction: "fix: enforce safe Links URL policy") → `54687d65` (publication, docs-only). Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` (unchanged).

Method: fetched `index.html`, `sw.js`, `package.json`, `.github/workflows/pwa-auth-contract.yml`, and `tests/links-url-safety.test.mjs` directly from `3b77e163` via `gh api`, read the full `normalizeLinkUrl`/`loadCLinks`/`saveCLinks`/`renderCommunity`/`openLinkModal`/`handleSaveLink` implementation (not just the diff hunks), traced every one of the task's required accept/reject URL cases by hand against the actual regex logic, and independently searched the entire file for any other `href=` construction site touching Links data.

### VERDICT: **ACCEPT**

### 1. URL policy — correct, and it's an allowlist (safer than a denylist)

`normalizeLinkUrl(url)`:
```
let u = String(url || '').trim();
if (!u) return '';
if (/^(https?:\/\/|tg:\/\/|mailto:)/i.test(u)) return u;
if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(u)) return 'https://' + u;
return '';
```
This is a **default-deny allowlist**, not a denylist of known-bad schemes — meaning every one of the task's required rejections is covered by construction, not by an enumerated blocklist that could miss a future dangerous scheme. Traced each required case by hand against the regex:
- **Accepted**: `http://…`, `https://…` (first regex, case-insensitive `i` flag covers `HTTP://`/`HTTPS://`), `mailto:…`, `tg://…`, bare domain `example.com/path` → normalized to `https://example.com/path` (second regex).
- **Rejected** (none match either accept regex, so all fall through to the final `return ''`): `javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, `chrome:`, `about:`, any arbitrary unknown scheme (e.g. `custom-scheme://…`) — confirmed none of these can match the bare-domain regex either, since a colon appears before any `.`, which breaks the anchored `^[\w.-]+\.[a-z]{2,}...$` pattern (colon is not in the `[\w.-]` character class). Blank (`''`) and whitespace-only (`'   '`) are both caught by `if (!u) return ''` after `.trim()`.
- **Case/whitespace**: leading/trailing whitespace is stripped before any check (`.trim()`); rejected schemes are rejected regardless of case because they simply never match the accept-list, not because of an explicit case-sensitive blocklist check.
- Directly re-verified via `tests/links-url-safety.test.mjs`'s "rejects executable, local, unknown, and blank URL inputs" test, which enumerates exactly the task's reject list (`javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, `chrome:`, `about:`, `custom-scheme://value`, `''`, `'   '`) and asserts each returns `''` via genuine execution (see §5).

### 2. Legacy stored links — not deleted, not silently rewritten, cannot become clickable

Read both migration branches inside `loadCLinks()`:
- No-`id` legacy branch: `url: normalizeLinkUrl(link.url) || String(link.url || '').trim()` — if the stored URL is unsafe (`normalizeLinkUrl` returns `''`), the migrated record's `url` field falls back to the **raw original string**, not an empty value. The unsafe value is preserved, not deleted or blanked.
- Already-migrated branch: `if (normalized && normalized !== link.url) { wasMigrated = true; link.url = normalized; }` — the `normalized &&` guard means an unsafe URL (`normalized === ''`) never triggers an overwrite; the original stored value is left completely untouched.
- Confirmed: **before this fix**, `normalizeLinkUrl` had no default-deny path at all — its final line was `return u;` (the raw, unrecognized string returned unchanged), meaning a legacy or attacker-supplied record with `url: 'javascript:alert(1)'` would previously have flowed straight into an `href` attribute (only HTML-attribute-escaped, not scheme-validated) — a genuine stored-XSS path this slice closes. This context, read directly from the pre-fix code, confirms why this correction was necessary and how serious the prior gap was.
- Render-time re-validation is independent of storage: `renderCommunity()` calls `normalizeLinkUrl(link.url)` fresh on every render, never trusting a cached "is this safe" flag — so even a record that predates this fix, or one an attacker crafted directly in `localStorage`, is re-checked every time it's displayed.
- Directly re-verified via the test suite's "unsafe persisted legacy URL remains stored but is not clickable" test: seeds `localStorage` directly with `{url: 'javascript:alert(1)', ...}`, calls the real `renderCommunity()`, and asserts (a) the persisted storage value is still exactly `'javascript:alert(1)'` after render (not deleted/rewritten), (b) the rendered HTML contains no `href="javascript:` (case-insensitive), and (c) it contains "Unavailable". This is genuine proof, not inference.

### 3. Render safety — single href-construction site, correctly gated, correctly protected

Read `renderCommunity()` in full: there is exactly **one** place in the entire function (and, confirmed by a whole-file grep, the entire codebase) that constructs an `<a href=...>` for Links data:
```
${normalizedUrl
  ? '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" ...>Open ↗</a>'
  : '<span aria-disabled="true" ...>Unavailable</span>'}
```
where `normalizedUrl = normalizeLinkUrl(link.url)` (freshly computed, not the raw stored value) and `safeUrl = escAttr(normalizedUrl)` (HTML-attribute-escaped on top of the scheme check — defense in depth). `target="_blank"` is paired with `rel="noopener noreferrer"` exactly as required. No code path in `renderCommunity()` bypasses `normalizeLinkUrl` before constructing an href.

### 4. Save path — blank input and unsafe URLs both correctly blocked before persistence

Read `handleSaveLink()` in full:
```
const rawUrl = document.getElementById('lm_url').value.trim();
...
if (!name || !rawUrl) { toast('Name and URL required', 'err'); return; }
const url = normalizeLinkUrl(rawUrl);
if (!url) { toast('Use http(s), mailto, tg, or a valid domain', 'err'); return; }
```
Blank/whitespace-only input is rejected **before** `normalizeLinkUrl` is even called (the `!rawUrl` check catches it first) — it can never reach the old `'#'`-producing path, and that path no longer exists anyway (`normalizeLinkUrl` now returns `''` for blank, not `'#'`). An unsafe scheme entered by the user is rejected by the second guard and never persisted. This is the *only* save entry point (`<form onsubmit="handleSaveLink(event)">` in `openLinkModal()`) — confirmed no second/alternate save path exists. Directly re-verified via the test suite's "blank form URL is rejected and never saved as hash" test, which calls the real `handleSaveLink` with a mocked whitespace-only input and asserts storage is left at its untouched initial value (`'[]'`) plus the exact toast message.

### 5. Test quality — genuine execution via `node:vm`, not string matching

`tests/links-url-safety.test.mjs` extracts the real Links runtime source from `index.html` between two literal markers (`let currentLinkFilter = 'all';` … `function shareInvite(){`) and loads it into a `vm.createContext` with a realistic mocked `document`/`localStorage`/`toast`/`URL` harness, then calls the **actual** `normalizeLinkUrl`, `handleSaveLink`, and `renderCommunity` functions and asserts on real return values, real `localStorage` snapshots, and real rendered HTML strings. This is genuine runtime-semantics testing. Confirmed the harness is internally consistent: `getLinksKey()` (defined inside the extracted slice) falls back to `'fiqD_' + 'clinks'` when the sandboxed context has no `K` global, matching the test's storage-key assumption exactly. All five tests were traced by hand against the actual module logic and confirmed correct — including the two tests that directly answer "is render-time legacy protection genuinely tested" (yes, via the seeded-unsafe-record test) and "is the save path genuinely tested" (yes, via the blank-input test). One minor gap: explicit case-variant scheme inputs (`HTTPS://…`, `MailTo:…`, `TG://…`) aren't individually asserted, though the regex's `i` flag makes this very likely correct — see non-blocking findings.

### 6. Regression — existing valid Links behavior intact, no scope creep

The test suite's "valid persisted link remains clickable with opener protection" test confirms a normal `https://` link still renders with the correct `href` and `rel="noopener noreferrer"`. Confirmed via the commit's file list (`.github/workflows/pwa-auth-contract.yml`, `index.html`, `package.json`, `sw.js`, `tests/links-url-safety.test.mjs`) that no storage-schema file, no separate Links/community module, no rename of `renderCommunity()`/`page-community`/`getLinksKey()`, and no Marketplace/Base44/cloud-sync file was touched. `page-community` remains the technical container for Links, unrenamed, exactly as the Slice 0/B3 protection required.

### 7. Service worker — correct

`sw.js`: `CACHE_NAME` bumped `crewbiq-driver-v82` → `crewbiq-driver-v83` (version-string comments bumped in step), justified because `index.html` (cache-first, in `APP_SHELL`) changed. The CI workflow's own grep-based verification step was updated in the same commit (`crewbiq-driver-v83`). No other `APP_SHELL` file changed and none needed to.

### 8. `COLLABORATION_STATE.md` v2.1 structure — correct

Confirmed via direct grep: `<!-- CURRENT_START -->` and `<!-- CURRENT_END -->` each appear **exactly once**, immediately bracketing the one `## CURRENT` heading in the entire file — no stray or duplicate `## CURRENT` heading exists anywhere in `HISTORY`, so a future agent naively searching for the first occurrence of that heading would still land on the correct, live block (though the file's own protocol text explicitly warns against relying on that anyway, instructing agents to key off the marker comments specifically). `<!-- HISTORY_START -->` exists exactly once, immediately after `CURRENT_END`. The protocol section itself (before `CURRENT_START`) contains only prose instructions referencing the marker names as text (`` `CURRENT_START` ``, `` `CURRENT_END` ``) — it does not contain a second `<!-- CURRENT_START -->` HTML comment or a second `## CURRENT` heading, so it cannot be mistaken for the live block by a marker-based (not heading-based) replace operation. This design is sound.

### 9. Bypass search — clean

Grepped the entire final `index.html` for `href=` anywhere referencing link/URL data: exactly one match, the one already audited in §3. Confirmed all seven `loadCLinks()`/`saveCLinks()` call sites (`renderCommunity`, `toggleLinkFav`, `deleteLink`, `openLinkModal` prefill, `handleSaveLink`) either don't touch `href` construction at all or route through the already-verified render path. `openLinkModal()`'s edit-form prefill (`value="${escAttr(item.url || '')}"`) places the raw stored URL into a text `<input>`'s `value` attribute (not an `href`), which is inert for navigation/execution and is itself `escAttr`-escaped against attribute-breakout. `shareInvite()` (the function immediately after the extracted test-source slice) is a separate, hardcoded, unrelated "install/invite link" feature with no user-supplied or Links-derived URL — confirmed not a bypass path.

### Blocking findings

None.

### Non-blocking findings

- **Case-variant scheme inputs aren't explicitly tested** (`HTTPS://…`, `MailTo:…`, `TG://…`). The regex's `i` flag makes correct behavior very likely, and this reviewer traced it by hand and confirmed it, but an explicit test case would remove any doubt for a future maintainer who might otherwise assume case-sensitivity from reading the code without the flag in view.
- **`COLLABORATION_STATE.md`'s own `HISTORY` entry for this slice's publication contains literal unsubstituted/typo artifacts**: `Branch: gent/pre-base44-audit` (missing leading "a"), `Implementation commit: $implementation` (an unsubstituted template variable, not the actual commit SHA), and `retain el="noopener noreferrer"` (missing leading "r" — should read `rel=`). These are documentation-quality defects confined to `HISTORY`, which the protocol explicitly says never wins over `CURRENT` for coordination purposes, so they carry no operational risk — but they're worth a cleanup pass, and they suggest whatever produced that entry didn't fully render a template before committing.

### Whether Slice 2A.0 is CLOSED

**Yes.** URL policy, legacy-record safety, render-path safety, and save-path safety were all independently verified against the actual code (not just the diff or the commit's own description), the new test suite genuinely exercises real runtime behavior rather than checking source strings, no scope creep occurred, the service-worker cache rotation is correct, and the `COLLABORATION_STATE.md` v2.1 marker structure is sound.

### Whether Slice 2A may resume

**Yes**, once ChatGPT authorizes it. The URL-safety gap that blocked Slice 2A is now closed and verified; there is no remaining reason found in this review to keep Slice 2A paused.

---

## Slice 2A Independent Review — 2026-08-30

Reviewer: Claude. Read the live `CURRENT_START`/`CURRENT_END` block first (Phase: Slice 2A; Status: PUBLISHED / AWAITING CLAUDE REVIEW; implementation commit `85c82503`, prior review commit `f995fa72`). Implementation commit under review: `85c82503ff3afa821f1d3fb33c301ba61413df46` ("test: contract-pin Links behavior"), parent `e3f4ed93` (the Slice 2A "resumed" IN_PROGRESS marker, docs-only). Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` plus the accepted Slice 2A.0 correction (`3b77e163`) — confirmed `index.html` at this commit is byte-identical (same blob SHA, `a8303fba`) to the Slice 2A.0-accepted `index.html`, i.e. this slice changed **zero** runtime code.

Method: read `docs/collaboration/LINKS_CONTRACT.md` in full and, for every factual claim in it, located and read the actual corresponding code in `index.html` directly (not the diff — there is no runtime diff) rather than trusting the contract's prose. Read both `tests/links-contract.test.mjs` and `tests/links-url-safety.test.mjs` in full and traced each test by hand against the real code to confirm it proves what it claims.

### VERDICT: **ACCEPT**

### 1–9, 11–14: Contract accuracy — verified claim-by-claim against actual code

- **Storage ownership**: `getLinksKey()` returns `(typeof K !== 'undefined' ? K : 'fiqD_') + 'clinks'` → `fiqD_clinks`. `loadCLinks()` repairs `fiqD__clinks` (the historical wrong key) by copying its bytes to the canonical key and removing it, exactly as documented. Confirmed **no** identity/account/workspace/role scoping key pattern anywhere in this path (unlike `fiqD_data_crew_<slug>_*`/`fiqD_data_email_<slug>_*`, which do exist elsewhere in the app for driver-scoped data). Confirmed no cloud-sync/queue call, no import/export function, anywhere in the extracted Links source range.
- **Schema/migration**: read both `loadCLinks()` migration branches directly. No-`id` legacy records reconstruct into the full schema (`id: lnk-…`, `name: link.name || 'Untitled Work Link'`, `category: 'other'`, `note: ''`, `favorite: false`, `createdAt: Date.now()`), with `url: normalizeLinkUrl(link.url) || String(link.url || '').trim()` — confirmed the unsafe-URL fallback preserves the raw value rather than blanking it. Already-`id`-bearing records get in-place repairs only for invalid category, non-boolean favorite, and normalizable URL — each gated by its own check, matching the contract table exactly.
- **Default records**: confirmed `!raw` branch creates and persists exactly the two named "CrewBIQ Community"/"CrewBIQ Support Bot" records with `t.me` URLs, matching the contract.
- **Malformed/non-array storage**: confirmed `if (!Array.isArray(links)) links = [];` coerces in-memory only — traced the `wasMigrated` flag through the empty-array `.map()` (which never sets it true, since it never iterates) to confirm the malformed raw value is genuinely **not** overwritten in storage, exactly as the contract states ("not explicitly quarantined or overwritten"). Confirmed the outer `try/catch` separately handles genuine `JSON.parse` throws by logging and returning `[]`.
- **URL policy**: re-confirmed against the Slice 2A.0-accepted `normalizeLinkUrl` (unchanged, same blob) — matches the contract's summary exactly, including that unsafe/unknown schemes are rejected and legacy unsafe values are preserved-but-non-clickable.
- **CRUD**: `handleSaveLink()`'s edit branch (`links.map(l => l.id === id ? {...l, ...} : l)`) and delete's filter (`.filter(l => l.id !== id)`) both leave every non-matching record byte-identical — confirmed via the contract's own new test (§15) and by direct reading.
- **Missing-id edit/delete**: read both functions directly and confirmed the exact claimed edge behavior — a non-matching `id` on edit leaves the array structurally unchanged (the `.map()` predicate never matches, so every element passes through as-is) yet still displays "Link updated"; delete's `.filter()` behaves the same way with "Link deleted." Factual, confirmed by code reading (not, however, backed by its own dedicated test — see non-blocking findings).
- **Category/filter/search**: confirmed `LINK_CATEGORIES` has all ten listed categories, `renderCommunity()` groups filtered records by `Object.entries(LINK_CATEGORIES)` iteration order (category-definition order) and preserves within-group array order (`grouped[cat].push(l)` in filter order), and the search predicate matches name/note/url case-insensitively via `.toLowerCase().includes(q)`.
- **Role visibility**: confirmed `ROLE_CONFIG.driver/owner_op/fleet` all include `{page:'community', icon:'🔗', label:'Links'}` in their `menu` arrays (unchanged since the very first Slice 0 review). Also independently found and confirmed a second navigation surface, `FUNCTION_GROUPS` (rendered into `#menuGrid`, the `page-menu` route), whose "Resources & account" group contains the same `community`/Links entry with no `roles` restriction on the group and no `minRole` on the item — matching the contract's claim precisely.
- **`page-community`/`renderCommunity()` as current-only container**: confirmed the route dispatch (`if(name==='community') renderCommunity();`), the DOM container id, and the nav labels are all unchanged and still point at this same container — no rename occurred.
- **Marketplace separation**: found and read `moduleTarget(id)` directly: `const map={expenses:'expenses',links:'community',reports:'report',pti:'pti',fuel:'expenses'};` — confirms `moduleTarget('links')` is a pure page-routing shortcut (`openModule` just calls `showPage('community')`), entirely separate from `mktModules`/`MKT_MODULES`/`loadMktModules`/`saveMktModules` (a different `scopedLoad('mktModules', [])` storage key, unrelated to `fiqD_clinks`). Links visibility in the main nav menus is in no way gated by Marketplace "installed" state. This directly and precisely confirms item 13.
- **Logout persistence**: confirmed `fiqD_clinks` matches neither `FLEET_DIRECT_KEYS` nor any `FLEET_CONFIG_KEY_PATTERNS` suffix (`_trucks`, `_driverProfiles`, `_svcRate`), and `logoutDevice()` (unchanged since Slice 1A/1B, re-confirmed) never references `clinks` at all — Links persist across logout by simple omission from the logout-clearing logic, not by deliberate fleet-config preservation, matching the contract's precise phrasing.

### 10. Data ownership assessment / cross-account risk

**Assessment: real, but not a blocker for a behavior-preserving extraction.**

`fiqD_clinks` is device-local, browser-profile-wide, and **not** identity-scoped — confirmed by direct comparison against the identity-scoping pattern (`fiqD_data_crew_<slug>_*`) used elsewhere in this same app for driver-owned data. This means on a shared or rotated device (e.g. a fleet tablet used by multiple drivers across shifts), one driver's saved Links — including free-text `note` fields that could contain dispatcher extensions, gate codes, or similar quick-reference details — remain visible to the next driver who logs in on the same device, with no account boundary at all.

This is a genuine, moderate-severity data-ownership gap. It should **not** block this behavior-preserving code extraction, for three reasons: (1) the extraction does not create, worsen, or newly expose this behavior — it is pre-existing and would remain identical after extraction either way; (2) the sensitivity class here (bookmarks/quick-reference notes) is materially lower than the accounting, identity, or compliance-evidence data this whole audit has treated as hard blockers elsewhere (Document Vault, first-truck fallback, URL-safety/XSS); (3) *fixing* the scoping (e.g. making `clinks` identity-scoped like other driver data) is itself a product/behavior decision — it would change what a returning user sees, is exactly the kind of change this audit process has repeatedly required a separate bounded, authorized slice for, and `LINKS_CONTRACT.md`'s own extraction invariant #8 ("Do not add cloud/account/workspace scoping during behavior-preserving extraction") already correctly excludes it from Slice 2B's scope rather than silently attempting it.

Recommendation: keep this queued as a separate, explicitly-authorized future product/runtime decision (as it already is in the CURRENT block's queue), not a Slice 2B blocker.

### 15. Test quality

Both test files genuinely execute the real Links runtime via `node:vm` (`vm.createContext`/`vm.runInContext`) against a realistic mocked `document`/`localStorage`/`toast` harness — not string matching. Traced every test in both files by hand against the actual code:

- `tests/links-contract.test.mjs`: "reload survives independent contexts" genuinely creates two *separate* vm contexts and confirms `loadCLinks()` returns identical data from each — directly proving the "no durable global array" claim. "Wrong-key and legacy-shape migration" seeds only the wrong key with a no-id bare-domain record and asserts the full migrated shape, wrong-key removal, and canonical-key persistence in one pass. "Edit updates only the intended record" and "delete removes only the intended record" both use two-record fixtures and assert the *non-target* record is left `deepEqual` to its original — precise, not just "did it change somehow." "Links are visible in every current role configuration" is the strongest test in the suite: it executes the literal `ROLE_CONFIG`/`FUNCTION_GROUPS` object definitions in a vm context and inspects the real resulting JS objects, rather than regex-matching source text. "Links storage is independent from Community and Marketplace" combines a real `getLinksKey()` call with a source-absence assertion (`doesNotMatch(linksSource, /mktModules|MKT_MODULES|.../)`) — a meaningful negative check, not just a positive one.
- `tests/links-url-safety.test.mjs`: the new case-variant assertions (`HTTPS://…`, `MailTo:…`, `TG://…`) directly resolve the non-blocking gap flagged in the Slice 2A.0 review — confirmed the values pass through unmodified (the accept regex only tests case-insensitively, it doesn't normalize case on return), matching what this reviewer predicted by hand in the prior review.
- **False-confidence finding**: `LINKS_CONTRACT.md`'s "Load and migration lifecycle" section is blanket-labeled `UNIT_CONTRACT` for all seven of its listed steps, but two of them — **default-record creation on first run** (no stored value at all) and **non-array-JSON coercion to an empty array** — are not exercised by any test in either file. I independently verified both behaviors are accurately described by reading the code directly, so the contract's *content* is correct, but the blanket `UNIT_CONTRACT` label overstates the actual test coverage for these two specific sub-claims. Recommend either adding two small test cases (seed no key at all; seed a non-array JSON value like `"5"` or `{}`) or footnoting those two bullets as verified by direct source reading rather than by an executing test.
- The documented "missing-id edit/delete" edge behavior (§8) is similarly accurate-by-reading but not backed by its own dedicated test in `links-contract.test.mjs` — same category of gap, same low severity given the behavior is explicitly framed as a fidelity note rather than an invariant to protect.

### 16. Runtime/product files changed

**None.** Confirmed via the commit's file list (`docs/collaboration/{ARCHITECTURE,CURRENT_STATUS,HANDOFF,LINKS_CONTRACT,WORK_LOG}.md`, `package.json`, `tests/links-contract.test.mjs`, `tests/links-url-safety.test.mjs`) and independently via blob-SHA comparison (`index.html` identical to the Slice 2A.0 baseline). No `sw.js` change was needed or made, consistent with "docs/tests only" requiring no cache rotation.

### 17. Proposed Slice 2B boundary

The proposed single module (`links.js`, global-compatible, dependency-injected, covering storage/migration, URL policy, render state, CRUD, and — hedged as "if kept in the same coherent boundary" — modal behavior) is **appropriately bounded as one slice**, not too broad, for this specific domain: having now read the entire ~350-line Links runtime source in full across this and the Slice 2A.0 review, every one of these pieces already calls directly into the others within a small, self-contained block with no external dependencies beyond generic utilities (`escHtml`, `K`, `document`, `localStorage`, `toast`, `confirm`, `URL`) — splitting storage from CRUD from render would require inventing temporary cross-slice interfaces for functions that are going to live in the same module anyway, adding risk without a corresponding safety benefit. This is also a lower-risk situation than Slice 1B was: the comprehensive contract-test suite already exists and passes *before* extraction begins, rather than needing to be built as part of the extraction commit itself.

One refinement, following the pattern that worked well in Slice 1B: within Slice 2B, sequence the move so that the *DOM-coupled* modal open/close/save glue is handled the same way `renderStartupShell()` was — either kept as a thin, dependency-injected shim, or moved last and re-verified against the contract tests before finishing — rather than treated as equally "core" to the module as the pure storage/URL-policy layer, which carries the lowest extraction risk and should move first.

### Blocking findings

None.

### Non-blocking findings

- The "Load and migration lifecycle" section's blanket `UNIT_CONTRACT` label overstates test coverage for two of its seven sub-claims (default-record creation, non-array-JSON coercion) — both independently confirmed accurate by direct code reading, but not backed by a dedicated executing test.
- The documented "missing-id edit/delete" edge behavior is accurate but similarly untested by a dedicated case.
- Device-global unscoped `clinks` storage is a real, moderate cross-account data-ownership gap (see §10) — correctly queued as a separate future product decision, not a Slice 2B blocker.
- All previously-queued non-blocking items (from Slices 1A.1, 1B, and 2A.0) remain outstanding and unresolved; none were newly introduced or newly ignored by this slice.

### Extraction readiness

**READY_FOR_LINKS_EXTRACTION** — independently confirmed, not merely accepted on Codex's assertion.

### Whether Slice 2A is CLOSED

**Yes.** Every contract claim checked out against the actual code, no runtime file was touched, the new tests genuinely execute real behavior, the one identified false-confidence labeling gap is minor and about test-coverage completeness rather than factual accuracy, and the cross-account data-ownership question was explicitly assessed and correctly does not block extraction.

---

## Slice 2B Independent Review — 2026-08-30

Reviewer: Claude. Read the live `CURRENT_START`/`CURRENT_END` block first (Phase: Slice 2B; Status: PUBLISHED / AWAITING CLAUDE REVIEW; implementation commit `78894780`). Chain confirmed linear: `78894780` (extraction) → `09ea6ee8` (state publication, docs-only) → `a3c4e97d` (state-marker repair, docs-only). Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` plus the accepted Slice 2A contract (`85c82503`). Baseline for comparison: the Slice 2A-accepted `index.html` (byte-identical to the Slice 2A.0 baseline, confirmed in the prior review).

Method: fetched `links.js`, `index.html`, `sw.js`, both test files, `.github/workflows/pwa-auth-contract.yml`, and `LINKS_CONTRACT.md` directly from the implementation commit. Read the entirety of `links.js` (277 lines) line-by-line against the Slice 2A-accepted inline source, function by function. Ran the extracted inline script and `links.js` through `node --check` independently. Diffed the complete `index.html` against the Slice 2A baseline to see the full change surface (5 contiguous hunks, no scattered changes). Independently diffed `logoutDevice()`, `getDefaultTruck()`/`resolveDefaultTruck()`, and the startup-coordinator wiring block against the pre-extraction baseline to confirm zero incidental change.

### VERDICT: **ACCEPT**

### Module extraction (1–5)

1. **`links.js` owns real runtime logic.** Confirmed by reading all 277 lines: `normalizeLinkUrl`, `loadCLinks`, `saveCLinks`, `renderCommunity`, `toggleLinkFav`, `deleteLink`, `openLinkModal`, `closeLinkModal`, `handleSaveLink`, `defaultLinks`, `generatedId` are all real, complete implementations — not stubs or pass-throughs.
2. **The previous inline implementation was actually removed.** Confirmed via a full-file diff against the Slice 2A baseline: `const LINK_CATEGORIES =`, `let currentLinkFilter =`, and every one of the above function bodies are gone from `index.html`, replaced by one-line delegating shims. Grepped the final `index.html` for `LINK_CATEGORIES`, `function loadCLinks`, `function saveCLinks`, `function normalizeLinkUrl`: zero function-body matches remain, only the three shim-definition lines.
3. **No duplicate implementation.** The same grep/diff confirms this — the removal in `index.html` and the addition in `links.js` are the same logic moved once, not copied.
4. **No unintended load-time side effects.** `links.js`'s only top-level statement is `global.CrewBIQLinks = Object.freeze({ create })` — identical in shape to `startup-session.js`'s pattern. Nothing executes until `getLinksRuntime()` is first called from `index.html`.
5. **Namespace/API is bounded and appropriate.** `create(deps)` returns a single `Object.freeze({...13 members...})` object; no other global is created by the module itself (the compatibility globals are defined in `index.html`'s composition layer, not by `links.js`).

### Behavior preservation

Compared every item in the task's list against `LINKS_CONTRACT.md` and the actual code in both `links.js` and the composition layer:

- `fiqD_clinks` / `fiqD__clinks` repair: identical logic, now reading `deps.K + 'clinks'` where `deps.K` is wired to the real global `K` — same effective key.
- Default records: identical two records (`def-1`/`def-2`, same names/URLs/notes), now generated by an extracted `defaultLinks()` helper.
- Malformed/non-array behavior: identical — `!Array.isArray(links)` coerces in-memory only, `wasMigrated` still gates whether the corrected value is persisted, so a malformed raw value is still never overwritten.
- Migration/schema: identical no-id reconstruction and per-field repair logic, field-for-field.
- Categories: **one confirmed difference** — see blocking/non-blocking findings below.
- Search/filter: identical predicate logic (name/note/url, case-insensitive `.includes`), identical quick-filter chip set, identical category-grouping order (`Object.entries(LINK_CATEGORIES)` iteration order preserved).
- Favorites, add/edit/delete: identical logic — edit's `.map()` predicate and delete's `.filter()` predicate are unchanged, confirmed by direct comparison.
- Missing-id behavior: confirmed unchanged — a non-matching id still results in an unchanged persisted array with a success toast, for both edit and delete.
- Accepted URL policy: `normalizeLinkUrl` is character-for-character the same allowlist logic (verified by direct comparison, not just re-reading the contract).
- Unsafe legacy non-clickable rendering: identical — `normalizedUrl ? <a href...> : <span aria-disabled>Unavailable</span>`, same `rel="noopener noreferrer"`.
- Empty state: identical "No custom work links found" message.
- Role visibility: `ROLE_CONFIG`/`FUNCTION_GROUPS` are in `index.html`, untouched by this slice (not part of the extraction) — re-confirmed present via the new test's live re-execution of the `ROLE_CONFIG` object.
- Route `community` / `page-community` shell: unchanged, unrenamed, still the dispatch target.
- Marketplace separation: `moduleTarget` map (`links:'community'`) unchanged in `index.html`; confirmed via a source-absence assertion that `links.js` contains no reference to `mktModules`/`MKT_MODULES`/`saveMktModules`/`loadMktModules`.
- Offline/local-only ownership: no transport, queue, import, or export code was added — `links.js` only ever touches `deps.localStorage`.
- **No account/workspace scoping change**: confirmed — `getLinksKey()` still returns the same unscoped `fiqD_clinks` key; no identity-scoped key pattern was introduced anywhere in `links.js` or the composition layer.

### Compatibility shims

All six required globals (`renderCommunity`, `openLinkModal`, `closeLinkModal`, `handleSaveLink`, `toggleLinkFav`, `deleteLink`) — plus six more the composition layer added for completeness (`setLinkFilter`, `setLinkSearchQuery`, `getLinksKey`, `normalizeLinkUrl`, `loadCLinks`, `saveCLinks`) — are each a single-line delegation: `function X(...){ return getLinksRuntime().X(...); }`. Each calls a differently-scoped function (the module instance's own closure method), so there is no recursion risk despite the shared names. `getLinksRuntime()` is a lazy singleton (`let linksRuntime = null; if(linksRuntime) return linksRuntime; ...`), matching the exact pattern `startup-session.js`'s `getStartupCoordinator()` established in Slice 1B — created once, reused thereafter, no duplicate `.create()` calls. The `deps` object passed to `CrewBIQLinks.create({...})` was cross-checked against every `deps.*` reference inside `links.js`: `document`, `localStorage`, `K`, `escHtml`, `toast`, `URL`, `console`, `confirm`, `setTimeout`, `random`, `now` — all present, all correctly wired to the real globals (`random:()=>Math.random()`, `now:()=>Date.now()`).

One necessary and correct adaptation: the original inline `onclick="currentLinkFilter='${f.id}'; renderCommunity();"` and `oninput="linkSearchQuery=this.value; renderCommunity()"` directly mutated inline-script-global variables — which no longer exist as globals once `currentLinkFilter`/`linkSearchQuery` became module-closure state. These were correctly changed to `setLinkFilter(...)`/`setLinkSearchQuery(...)` calls (confirmed both the generated button markup inside `links.js` and the static search-input markup in `index.html` were updated consistently) — this is a required, behavior-preserving adaptation for the extraction, not a regression.

### DOM / UI boundary

`page-community`'s markup, CSS, static Community/Support/Invite shell controls, the `communityCustomLinks` mount point, search/add controls, role-menu entries, the `showPage('community')` route dispatch, and the Marketplace `moduleTarget` mapping all remain in `index.html`, confirmed unchanged by the full-file diff. `links.js` owns only the runtime behavior (storage, URL policy, CRUD, render, modal) that was in the extracted range — no static shell content was accidentally pulled into the module, and no UI redesign occurred (every rendered HTML string, CSS class, and DOM structure in `links.js` is unchanged from the inline version, aside from the one icon difference noted below).

### Script load order

Confirmed via direct inspection of the `<script src>` list: `core.js`, `sync.js`, `pti.js`, `loads.js`, `fleet-load-resolution.js`, `startup-session.js`, **`links.js`** — in that exact order, `links.js` appended last, immediately after `startup-session.js` and before the large inline composition script, entirely outside `core.js`'s 18-script `document.write` hotfix chain. `core.js` itself is confirmed byte-identical to `main` (same blob SHA as previously verified) — the hotfix order is completely untouched. `links.js` has no load-time side effects, so its position is safe regardless of exactly when its dependencies are ready (they only need to exist once `getLinksRuntime()` is first invoked, which happens well after all scripts load).

### Service worker

`sw.js`: `CACHE_NAME` bumped `crewbiq-driver-v83` → `crewbiq-driver-v84` (version-string comments bumped in step), and `/crewbiq-driver/links.js` added to `APP_SHELL`. This is correct and necessary since `index.html` (cache-first) changed and `links.js` is now a required offline runtime dependency. The CI workflow's grep-based verification step was updated in the same commit to check for `links.js?v=20260830-slice2b-v1` in `index.html`, `links.js` in `sw.js`, and `crewbiq-driver-v84`. **Clarification on the task's specific ask**: `tests/e2e/service-worker-path.test.mjs` (unchanged by this commit) does **not** test app-shell completeness — it verifies a different, unrelated concern (that the SW registration URL is derived relatively from `document.baseURI`, so registration works under both GitHub Pages and root-path staging). The mechanism that actually protects the new module's cache inclusion is the CI workflow's grep step, which was correctly updated — worth being precise about which test does which job here, since they're easy to conflate.

### Test adequacy

Both test files were rewritten to load `links.js` directly (`fs.readFileSync('../links.js')` → `vm.runInContext`) rather than extracting a slice of `index.html` — confirmed genuine re-targeting to the real module, not stale inline source. Traced every test in both files by hand:

- **`tests/links-contract.test.mjs`**: adds a new "default creation and non-array coercion retain behavior" test that seeds an empty store (asserts default records created and persisted) and a non-array JSON payload `{unexpected:true}` (asserts in-memory `[]` while the malformed raw value is left untouched in storage) — this directly closes the false-confidence gap this reviewer flagged in the Slice 2A review. The "add/edit/delete/favorite and missing-id success retain behavior" test now explicitly exercises `deleteLink('missing')` and asserts the toast still reads `'Link deleted'` — closing half of the other gap flagged in Slice 2A (the missing-id *delete* case is now genuinely tested; the missing-id *edit* case is not — see non-blocking findings). The role-visibility, filter/search, and reload/migration tests all genuinely execute real code and were independently traced and confirmed correct. The `STATIC_CONTRACT` "shell/route/load position/shims" test is a strong structural guard: it asserts the exact script-tag adjacency (`startup-session.js...><script src="links.js`), asserts each of the six required shims matches the exact delegating pattern via regex, and — critically — asserts `index.html` contains **no** `const LINK_CATEGORIES =` and **no** `let currentLinkFilter =`, which is a precise, meaningful negative check against exactly the "duplicate implementation" risk item 3 asked about.
- **`tests/links-url-safety.test.mjs`**: fully retargeted to `links.js`, re-verifies the entire accept/reject URL matrix including the case-variant assertions added in Slice 2A, plus the unsafe-legacy-render and blank-save-rejection tests, all against the real module.
- No test in either file overstates a static/structural check as behavioral proof; the `STATIC_CONTRACT`-labeled test is correctly reserved for shape/position assertions only.
- Minor completeness notes (not false-confidence risks, just incompleteness): the "parses independently and exports namespace" test only directly asserts one of the module's 13 exported members is a function (the rest are exercised indirectly by later tests, not by one explicit completeness check); the missing-id **edit** case (as opposed to delete) still has no dedicated assertion, though this reviewer independently confirmed by reading the code that its behavior is unchanged from the pre-extraction version.

### Index parse / startup regression

- `node --check` on both the extracted inline script (289,248 chars) and `links.js` independently: both parse cleanly.
- `logoutDevice()`, `getDefaultTruck()`/`resolveDefaultTruck()`, and the entire `startup-session.js` composition-wiring block (`getStartupCoordinator()`, the `restoreSession`/`boot`/`showApp` shims) were extracted and diffed against the Slice 2A baseline: **byte-identical** in all three cases. No duplicate startup side effect, no first-truck regression, no session/auth change.
- `core.js` confirmed byte-identical to `main` — hotfix loader order fully intact.

### Change scope

Confirmed via the complete `index.html` diff (5 contiguous hunks: one new `<script>` tag, one `oninput` handler adaptation, and the three-part Links-block replacement) that no other subsystem changed. No auth/session, PTI, loads, fuel, accounting, OCR, Marketplace *state*, Document Vault, IFTA, Base44, cloud-sync, or identity-storage file or code path appears anywhere in this commit.

### Cross-account clinks risk

**Reconfirmed unchanged — remains KNOWN / QUEUED, not silently fixed, not worsened.** `getLinksKey()` still returns the identical unscoped `deps.K + 'clinks'` (`fiqD_clinks`) key; no identity-scoping pattern (`fiqD_data_crew_<slug>_*`-style) was introduced anywhere in `links.js` or the composition layer. `LINKS_CONTRACT.md`'s new "Slice 2B extracted ownership" section makes no claim of a scoping change either. This is exactly the expected, correct outcome for a behavior-preserving extraction — the risk is neither addressed nor made worse by this slice.

### Blocking findings

None.

### Non-blocking findings

- **Confirmed, isolated icon regression**: `LINK_CATEGORIES.maintenance.icon` changed from `'🛠'` (hammer-and-wrench) in the pre-extraction source to `'🔧'` (wrench) in `links.js`. Verified this is the **only** difference across all ten categories' labels and icons (diffed the full `LINK_CATEGORIES` object literal from both versions). Purely cosmetic — no functional, filtering, or data-correctness impact, since `maintenance` remains the same category key string throughout — but it is a literal, confirmed violation of "behavior-preserving extraction" that should be corrected in a follow-up (a one-character emoji fix, not worth a dedicated slice on its own).
- Missing-id **edit** (as opposed to delete) still lacks its own dedicated test, though independently confirmed unchanged by direct code reading.
- The "parses independently and exports namespace" test checks only 1 of 13 exported members directly by name; the rest are exercised indirectly elsewhere in the suite.
- Worth a documentation precision note (not a defect): `tests/e2e/service-worker-path.test.mjs` doesn't test app-shell completeness for the new module — that protection comes from the CI workflow's grep step, which was correctly updated.
- All previously-queued non-blocking items (`resolveDefaultTruck` case-sensitivity, unguarded deduction-template save, cosmetic `}function boot()` formatting, HISTORY typos) remain outstanding, unresolved, not newly touched by this slice.

### Module-boundary quality

High, and consistent with the `startup-session.js` precedent: `links.js` is a small (277-line), single-purpose, dependency-injected module with no ambient global access and no load-time side effects. The lazy-singleton composition pattern (`getLinksRuntime()`) is identical in shape to `getStartupCoordinator()`, giving the codebase now two proven, consistent examples of the same safe extraction template.

### Duplicate-implementation assessment

None found. Confirmed by direct grep (zero remaining function-body definitions for any extracted function in `index.html`) and by the new test's own explicit negative assertions against `const LINK_CATEGORIES =` and `let currentLinkFilter =` in `index.html`.

### Whether Slice 2B is CLOSED

**Yes.** Every verification item checks out against the actual code — real logic moved once, no duplication, no unintended side effects, a bounded and appropriate namespace, exact behavior preservation apart from one trivial cosmetic icon slip, safe compatibility shims with no recursion risk, correct script positioning outside the hotfix chain, correct and complete cache rotation, genuinely re-targeted and meaningfully expanded tests that close two of the three test-coverage gaps flagged in the Slice 2A review, zero startup/auth/first-truck/loader regression, fully contained change scope, and the cross-account data-ownership risk correctly left exactly as it was — known, queued, and untouched.

### Safest next bounded slice recommendation

Apply the same "behavior contract + tests, then bounded extraction" two-step pattern (now proven twice, for `startup-session.js` and `links.js`) to the **OCR intake transport adapter** — matching `FUNCTIONAL_AUDIT.md`'s original step-2 recommendation — but scope it explicitly to the transport/encode/error-handling shape only (file pick, base64 encode, endpoint call, error/toast handling), not the unresolved Document Vault source-retention question, which remains a separate, still-open product decision and should continue to block any OCR *behavior change* (as opposed to a behavior-preserving code move). If the team wants an even lower-risk win first, the `FUNCTION_GROUPS`/`page-menu` "Work/Truck/Money/Team/Resources" grouping logic (read in full during this review) has zero accounting/identity coupling and is smaller than either prior extraction — a viable alternative low-risk candidate.

---

## Slice 3A Independent Review — 2026-08-30

Reviewer: Claude. Read the live `CURRENT_START`/`CURRENT_END` block first (Phase: Slice 3A; Status: PUBLISHED / AWAITING CLAUDE REVIEW; implementation commit `bfff0ed8`). This is the recommendation this reviewer made at the end of the Slice 2B review (the `FUNCTION_GROUPS`/`page-menu` alternative), now formalized as its own contract slice. Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` plus all accepted extractions through Slice 2B. Confirmed `index.html` at the implementation commit is byte-identical (same blob SHA, `44774fe8`) to the Slice 2B-accepted state — this slice changed **zero** runtime code.

Method: read `NAVIGATION_CONTRACT.md` in full, then independently located and read every underlying piece of code (`ROLE_CONFIG`, the scan-injection IIFE, `FUNCTION_GROUPS`, `applyRoleUI()`, `getUserRole()`/`setUserRole()`, `showPage()`, `primaryDestinationForPage()`, `updatePageBackNavigation()`, `goBackPage()`, `moduleTarget()`/`openModule()`/`installModule()`) directly in `index.html`, computed the expected visible menu for all three roles **by hand** from the raw filter logic rather than trusting the contract's prose tables, and additionally traced `core-runtime.js` for any role-authorization mechanism the contract might have missed. Grepped the entire codebase (`index.html`, `loads.js`, `links.js`) for every direct, dynamic, and indirect `showPage()` call site to independently verify Marketplace's reachability claim.

### VERDICT: **ACCEPT**

### Page registry — verified for all 21 pages

Grepped every `id="page-*"` div and confirmed all 21 pages the task listed exist as real DOM containers, in the exact order the new test suite also asserts: `home, load, pti, stats, settings, report, disputes, fuel, deductions, service, fleet, drivers, marketplace, community, expenses, scan, work, truck, money, team, menu`.

- **`work`/`truck`/`money`/`team`**: confirmed **directly reachable** via real bottom-navigation buttons (`<button class="navbtn" data-page="work" onclick="showPage('work',this)">`, etc.) — genuinely clickable, not dead markup. `team`'s button carries `style="display:none"` by default and is toggled by role in `applyRoleUI()` (`teamNav.style.display = role === 'fleet' ? '' : 'none'`), matching the role-adaptive claim exactly. None of these four has a `showPage()` render-hook dispatch entry — correctly classified `ACTIVE (technical container)`, not orphaned, since "no render hook" and "unreachable" are different things here and the contract is careful to distinguish them.
- **`menu`**: reachable via `toggleNav(){ showPage('menu'); }` and as the universal invalid-page fallback target inside `showPage()` itself. Correctly classified `LEGACY_CONTAINER` — reachable, load-bearing (routing depends on it), but not part of the current primary IA.
- **`marketplace`**: see dedicated section below — genuinely `ORPHANED`, exhaustively re-confirmed.
- All remaining 16 pages (`home` through `settings`) were cross-checked against their claimed render hooks directly in `showPage()`'s dispatch list and matched exactly, including the two-hook `stats` case (`renderStats(); renderFleetStats();`) and the explicit no-op `report` branch (`if(name==='report'){}`).

### Role model — computed by hand, not trusted from prose

Read `ROLE_CONFIG`'s three raw `menu` arrays and the scan-injection IIFE (`['driver','owner_op','fleet'].forEach(...)` splicing `{page:'scan',...}` after `expenses`) directly, then independently derived the post-injection order for each role:

- driver: `load, report, expenses, scan, disputes, pti, stats, community, settings`
- owner_op: `load, report, expenses, scan, fuel, deductions, service, disputes, pti, stats, community, settings`
- fleet: `load, fleet, drivers, report, expenses, scan, fuel, deductions, service, disputes, pti, stats, community, settings`

All three match `NAVIGATION_CONTRACT.md`'s claims **exactly**. Separately read `FUNCTION_GROUPS`'s raw array and the exact filter expressions in `applyRoleUI()` (`group => !group.roles || group.roles.includes(role)` and `item => !item.minRole || roleRank[role] >= roleRank[item.minRole]`, with `roleRank = {driver:0, owner_op:1, fleet:2}`), then hand-applied that filter for all three roles and independently derived:

- driver: Work(load, disputes, scan); Truck(pti); Money(expenses, report, stats); Resources & account(community, settings)
- owner_op: Work(load, disputes, scan); Truck(pti, fuel, service); Money(expenses, report, stats, deductions); Resources & account(community, settings)
- fleet: Work(load, disputes, scan); Truck(pti, fuel, service); Money(expenses, report, stats, deductions); Team(fleet, drivers); Resources & account(community, settings)

Also matches exactly. Confirmed the scan item's icon/label genuinely differ between the two models (`ROLE_CONFIG`: 📷/"Scan"; `FUNCTION_GROUPS`: 📄/"Documents") — a real, confirmed divergence, not a contract exaggeration.

### Dual-navigation-model assessment

**Accurately characterized, and does not create sufficient drift risk to block extraction.** Independently confirmed both properties by hand: (1) the two models produce the *same set* of visible page targets per role (I computed the sorted target sets for all three roles from both models and they match), and (2) the *order and presentation* differ (confirmed the scan icon/label divergence above, and several label differences — Disputes/Exceptions, Scan/Documents, PTI/Inspections, Service/Maintenance, Stats/Performance, Fleet/Fleet overview). This is exactly the "target-set parity, different order/labels/icons" claim, verified independently rather than accepted on the contract's word.

This is a real architectural smell (two data sources describing the same concept, only one of which — `FUNCTION_GROUPS` — actually drives rendering into `menuGrid`, while `ROLE_CONFIG`'s `menu` array only contributes label/icon metadata to `applyRoleUI()`'s badge and is otherwise unused for rendering), but it is a **pre-existing** condition, not something this slice introduces or worsens — this slice only contract-pins it. The new test suite's "target drift is detectable while independent ordering remains" test is the right response: it asserts set-parity *and* asserts the orders are `notDeepEqual`, meaning any future accidental convergence *or* divergence beyond current would fail a test immediately. Given that safety net now exists, this does not need to block Slice 3B, which — correctly — proposes to preserve both models rather than unify them.

### Role / authorization boundary

Confirmed `showPage()` contains zero role-related code — read the entire function body directly and confirmed no reference to `getUserRole`, `ROLE_CONFIG`, or any rank/authorization check anywhere in it. Direct calls (e.g. via console, or a crafted `onclick`) can reach any page regardless of the active role.

**Classification: (A) current intended UI-only role visibility — not an unsafe authorization defect.** This app is local-first; the actual tenant/identity boundary (established and independently verified across the Slice 1A/1B reviews) is enforced by the Bearer session token and identity-scoped storage keys (`fiqD_data_crew_<slug>_*`), not by the local `fiqD_userRole` value. Viewing, say, the Fleet page as a "driver"-labeled account does not expose another account's data — it renders the *same account's own* locally-stored truck/driver data, which for a genuinely driver-only account would simply be empty. Role here governs which optional self-service UI surfaces a person sees for their own account, not which other accounts' data they can reach — so the absence of enforcement in `showPage()` itself is not a security gap by the correct threat model, and the task's caution against treating UI roles as security permissions is well-founded here.

**One finding beyond the contract's own text**: traced `core-runtime.js` and found `installRoleGuard()`, a mechanism the contract does not mention. It monkey-patches `global.setUserRole` (installed on `DOMContentLoaded`, guaranteed to run after the inline script's `setUserRole` definition exists) to check `fiqD_authRoles` (populated from server authentication data) and reject — with a toast — any requested role exceeding `authorizedUiRole(roles)`, the maximum server-authorized role. This is a genuine, conditional authorization check — but it gates only the role-*setting* function (`setUserRole`), not page *access* (`showPage`), and only takes effect when `fiqD_authRoles` is actually populated (i.e., the user has authenticated with a backend that returned role data; if empty, `setUserRole` is completely unguarded, matching what the raw function shows). This doesn't change the contract's bottom-line conclusion — `showPage()` genuinely has no role enforcement — but it's a real, non-trivial piece of the fuller picture on exactly the question the task emphasized most, and its absence from `NAVIGATION_CONTRACT.md` is worth flagging as a non-blocking completeness gap.

### Invalid role

Read `getUserRole()` (`localStorage.getItem(K+'userRole') || 'driver'` — only falls back on a falsy/absent value, never normalizes a non-empty invalid string), `setUserRole()` (rejects new invalid values via `if (!ROLE_CONFIG[role]) return;`, but cannot retroactively fix an already-invalid stored value), and `restoreRoleFromOwnerData()` (upgrades only from exactly `'driver'`, leaving any other — including invalid — value untouched) directly. Confirmed the contract's claim precisely. Read `applyRoleUI()`'s badge fallback (`const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.driver;` — badge shows "🚛 Driver" for an invalid role) and the `roleRank[role]` comparisons (`undefined >= roleRank[item.minRole]` is always `false`, and `group.roles.includes(role)` is always `false` for an invalid role) — confirmed this produces exactly the "conservative" (minRole-gated and role-gated items are hidden, never over-exposed) yet "internally inconsistent" (badge says Driver while the underlying filter key is the raw invalid value, not `'driver'`) state the contract describes. This scenario requires an already-corrupted/tampered `localStorage` value unreachable through any normal UI flow (every UI path that sets the role goes through the validating `setUserRole()`), so it does not block a metadata-only, behavior-preserving Slice 3B.

### Marketplace orphan assessment

**Exhaustively re-confirmed genuinely orphaned — not merely absent from `ROLE_CONFIG`.** Grepped every `showPage(` call site across the entire codebase, including dynamic/indirect ones: the `FUNCTION_GROUPS`-rendered menu-grid buttons (`onclick="showPage('${item.page}')"`, driven only by the enumerated `FUNCTION_GROUPS` array, which contains no `marketplace` entry), the exposed `showPage: (name) => showPage(name)` capability passed into another module's init object (traced the only consumer of that capability and confirmed it never calls it with `'marketplace'`), `goBackPage()`'s history-driven call (can only ever target a page previously pushed by genuine navigation, so it cannot create new reachability), and the quick-add buttons (hardcoded literals: `load`, `expenses`, `scan`, `fuel`, `service`, `disputes` — no `marketplace`). Also grepped `loads.js` and `links.js` in full for any reference to `marketplace`: zero matches in either file. The only appearances of "marketplace" anywhere in the codebase are the page's own DOM/CSS comment markers, the `showPage()` dispatch-table entry (dead unless something calls it, which nothing does), and `renderMarketplace()`'s own self-re-render calls from `installModule()`/`uninstallModule()` (which re-render the Marketplace page *if already open*, not navigate to it). The new test's own computed-set check (`modelTargets.has('marketplace') === false`, where `modelTargets` is the actual flattened union of both navigation models' targets) independently proves the same conclusion through real data rather than a source-absence assumption.

### Links / `community` container

Confirmed `community` remains the unrenamed, unaltered technical container: the `showPage('community')` dispatch (`if(name==='community') renderCommunity();`) is unchanged, `renderCommunity()` is unchanged (still delegates to `getLinksRuntime().renderCommunity()`, per the Slice 2B extraction), and `community` still appears in every role's `ROLE_CONFIG` menu and in `FUNCTION_GROUPS`' "Resources & account" group with the label "Links" in both. Slice 3A's proposed Slice 3B boundary (data/model only: page registry, role definitions, `FUNCTION_GROUPS`, role-rank, lookup helpers) explicitly excludes `showPage()`'s DOM mutation and render-hook dispatch, meaning a metadata-only extraction cannot detach the `community`→`renderCommunity()` wiring, since that wiring lives in the part of `showPage()` staying in `index.html`.

### Test quality

- **`tests/navigation-contract.test.mjs`**: genuinely executes `ROLE_CONFIG` and `FUNCTION_GROUPS` as real JS objects via `vm.runInNewContext`, extracted from `index.html` by regex boundary (not hand-duplicated arrays) — independently re-derived the same expected orders by hand from the raw source and confirmed the test's hardcoded expectations match exactly. The "target drift is detectable while independent ordering remains" test is a precise, meaningful dual-model proof (set-parity assertion *and* an explicit `notDeepEqual` on order, both from live-executed data). The "invalid page falls back to menu" test genuinely executes the real, regex-extracted `showPage()` function body via `vm.runInNewContext` against a full mocked DOM/context and asserts real observable outcomes (`activated === ['menu']`, call order `['applyRoleUI', 'back:menu']`, `currentPageName === 'menu'`) — real runtime proof, not inference. The "showPage remains UI routing without role or browser-history enforcement" test extracts the real function body and asserts via regex the **absence** of `getUserRole|ROLE_CONFIG|history\.|pushState|replaceState|scrollTo` — a precise negative-space check matching what this reviewer independently confirmed by direct reading. The Marketplace-orphan test computes the actual flattened target-set union from the live-executed models, not a static assumption. No test in this file overstates a structural/`STATIC_CONTRACT` check as behavioral proof.
- **`navigation_shell.test.mjs`** and **`settings_information_architecture.test.mjs`**: unchanged by this commit; `NAVIGATION_CONTRACT.md`'s own characterization of their scope (general shell/settings-IA structure, not ROLE_CONFIG/FUNCTION_GROUPS parity) matches what this reviewer would expect given their names and this slice's file list (neither file appears in the commit's changes).
- **Gap**: no test in `navigation-contract.test.mjs` exercises the invalid-role scenario (the `roleRank[role] === undefined` cascade) via real execution — the contract's description is accurate (independently confirmed by this reviewer's direct code reading), but not proven by an executing test. Consistent in kind with similar minor gaps flagged in the Slice 2A/2B reviews.

### Runtime scope

Confirmed via the commit's file list (`.github/workflows/pwa-auth-contract.yml`, `docs/collaboration/NAVIGATION_CONTRACT.md`, `package.json`, `tests/navigation-contract.test.mjs`) and independently via blob-SHA comparison: `index.html` is byte-identical to the Slice 2B-accepted state. Zero runtime/product code changed. CI/package wiring is correctly in place: `navigation-contract.test.mjs` added to `package.json`'s `test:e2e:tooling`, to `pwa-auth-contract.yml`'s `pull_request`/`push` path filters, and given its own dedicated `run: node --test tests/navigation-contract.test.mjs` step.

### Blocking findings

None.

### Non-blocking findings

- `NAVIGATION_CONTRACT.md` doesn't mention `core-runtime.js`'s `installRoleGuard()` — a real, conditional authorization check on `setUserRole()` specifically (not page access) that applies only when a user has authenticated server-assigned roles. Doesn't change the contract's correct bottom-line conclusion, but is a material completeness gap on exactly the topic the task emphasized most.
- The invalid-role "conservative yet internally inconsistent" scenario is accurately described but has no dedicated executing test.
- All previously-queued non-blocking items (`resolveDefaultTruck` case-sensitivity, unguarded deduction-template save, cosmetic `}function boot()` formatting, HISTORY typos, device-global `clinks` scoping, the `links.js` maintenance-icon drift, the missing-id-edit and exports-namespace test gaps) remain outstanding, unresolved, and untouched by this slice.

### Extraction readiness

**READY_FOR_NAVIGATION_EXTRACTION** — independently confirmed, not merely accepted on the contract's own assertion.

### Recommended Slice 3B boundary

The proposed boundary — `navigation-model.js` owning only page-registry metadata, role navigation definitions, `FUNCTION_GROUPS` definitions, role-rank, and lookup helpers, while `index.html` retains DOM page markup, `showPage()`'s DOM mutation, render-hook dispatch, history/back behavior, the visual shell, and event wiring — is **the safest available boundary** for this domain. It mirrors the same pattern proven twice already (`startup-session.js`, `links.js`): pure data/logic moves behind a dependency-injected or plain-data module, while DOM-heavy glue stays put until a later, separately-reviewed slice. Explicitly preserving both `ROLE_CONFIG` and `FUNCTION_GROUPS` rather than unifying them during this move is the right call, precisely because the contract tests already exist to detect any drift the move might accidentally introduce.

### Future UI architecture assessment

This genuinely prepares the ground for a later Base44-inspired shell without prematurely coupling visual redesign to business-domain ownership: once page/role/group *data* lives in `navigation-model.js`, a future visual layer can restyle the shell, bottom nav, icons, grouping presentation, and transitions by consuming that data differently, without needing to touch — or risk — the underlying page/role/domain definitions. This is the same separation-of-concerns principle this reviewer has recommended consistently since the original architecture audit (Slice 0), now being applied concretely and in the right order (contract first, extraction second, redesign explicitly deferred).

### Whether Slice 3A is CLOSED

**Yes.** Every contract claim was independently verified against the actual code — much of it recomputed by hand rather than merely re-read — the dual-navigation-model characterization holds up under independent computation, the role/authorization boundary is correctly classified with one genuinely useful addition beyond the contract's own text, the invalid-role edge case is accurately described, Marketplace's orphaned status was exhaustively re-confirmed across every file in the codebase (not just ROLE_CONFIG absence), Links/`community` ownership is unaffected, the new tests genuinely execute real code for the highest-value claims, and zero runtime code was touched.

---

## Slice 3B Independent Review — 2026-08-30

Reviewer: Claude. Read the live `CURRENT_START`/`CURRENT_END` block first (Phase: Slice 3B; Status: PUBLISHED / AWAITING CLAUDE REVIEW; implementation commit `626c96fc`). Product truth: `main` @ `86b8b4dd7e9496833a021319167589b49f0ac418` plus all accepted extractions through Slice 3A. Method: read all 57 lines of `navigation-model.js` directly, diffed the complete `index.html` against the Slice 3A-accepted baseline (5 contiguous hunks, all within the navigation region), independently re-verified byte-identity of `links.js`, `loads.js`, and `core-runtime.js` (all unchanged, confirmed via blob-SHA comparison), and read every relevant function (`setUserRole`, `getUserRole`, `applyRoleUI`, `primaryDestinationForPage`, `showPage`, `installRoleGuard`/`authorizedUiRole`/`roleLevel` in `core-runtime.js`) directly rather than trusting the contract's or the test suite's own claims.

### VERDICT: **ACCEPT**

### Module ownership

Read `navigation-model.js` line-by-line: it exports exactly `ROLE_CONFIG`, `FUNCTION_GROUPS`, `ROLE_RANK`, `PRIMARY_NAV_PAGES`, `PAGE_REGISTRY`, and five pure lookup/helper functions (`roleConfig`, `visibleFunctionGroups`, `roleMenuTargets`, `groupedTargets`, `bottomDestinationsForRole`, `primaryDestinationForPage`) — confirmed via `Object.keys(api)` matching this exact list. It contains **zero** DOM references, no `showPage`/`querySelector`/`getElementById`/`classList` code (confirmed both by direct reading and by the new test suite's own negative-space regex assertion against the module's source), no `pageNavigationHistory`, no auth/session code, and no `setUserRole` reference at all (confirmed absent by direct grep). `primaryDestinationForPage(name, role)` deliberately takes `role` as an explicit parameter rather than calling `getUserRole()` internally — a genuinely pure function, unlike the original inline version which read the global directly. One notable, deliberate design difference from the `startup-session.js`/`links.js` precedent: this module assigns its exports directly to `window` at load time (`global.ROLE_CONFIG = ROLE_CONFIG`, etc.) rather than using a dependency-injected `create(deps)` factory. This is appropriate here, not a regression from the established pattern — the module has no effectful external dependencies to inject (everything is static data or pure functions of explicit arguments), so a factory indirection would add nothing; the DI pattern in the prior two extractions existed specifically to inject `document`/`localStorage`/`toast`/etc., none of which this module needs.

### Dual-model preservation — re-verified against the Slice 3A baseline, not just internal consistency

Diffed `navigation-model.js`'s `ROLE_CONFIG`/`FUNCTION_GROUPS` object literals against the Slice 3A-accepted inline versions field-by-field: identical role labels/icons/descriptions, identical menu item order/labels/icons for all three roles, identical `FUNCTION_GROUPS` group order/item order/labels/icons/`roles`/`minRole` values. Specifically re-checked every pairing the task called out: Disputes/Exceptions, Scan/Documents (📷 in `ROLE_CONFIG` vs 📄 in `FUNCTION_GROUPS` — confirmed both preserved, not unified), PTI/Inspections, Service/Maintenance, Stats/Performance, Fleet/Fleet overview — every one of these six known divergences is still present and distinct between the two models. No silent unification occurred.

### Scan behavior

The original inline code inserted `{page:'scan', icon:'📷', label:'Scan'}` into each role's `menu` array at runtime via a `forEach`+`splice` IIFE, positioned immediately after `expenses`. `navigation-model.js` instead bakes the post-insertion state directly into each role's static `menu` array literal — confirmed by reading the raw array literal that `scan` already sits immediately after `expenses` in all three roles' arrays. Grepped the entire final `index.html` for any remaining `.menu.splice`, `.menu.push`, or `.menu.some(...page==='scan')` check: **none exist** — nothing in the codebase depends on `ROLE_CONFIG` mutating after initial load, so representing the final effective order directly is behavior-equivalent, not merely convenient. The new test suite's "ROLE_CONFIG deep shape and effective scan order" test independently confirms this by locating the scan entry via `.find()` for all three roles and asserting its exact shape.

### Compatibility globals

`index.html` no longer declares `ROLE_CONFIG`/`FUNCTION_GROUPS`/`ROLE_RANK` as its own object literals — confirmed via a full grep that the only remaining declarations are `var ROLE_CONFIG = CrewBIQNavigationModel.ROLE_CONFIG;`, `var FUNCTION_GROUPS = CrewBIQNavigationModel.FUNCTION_GROUPS;`, and `const roleRank = CrewBIQNavigationModel.ROLE_RANK;` (inside `applyRoleUI()`) and `const PRIMARY_NAV_PAGES = CrewBIQNavigationModel.PRIMARY_NAV_PAGES;` — one explicit re-binding per identifier, no shadowing, no duplicate declarations. There is exactly one effective navigation model at runtime: `navigation-model.js`'s data, re-exposed under the same names `index.html`'s existing code already expects.

### Primary destination mapping

Read `navigation-model.js`'s `primaryDestinationForPage(name, role)` and compared it line-for-line against the original inline `primaryDestinationForPage(name)` (which called `getUserRole()` internally): identical branch structure and target pages for every case the task listed (`home→home`, `load/disputes/work→work`, `pti/fuel/service/truck→truck` unless `role==='fleet'` then `team`, `team/fleet/drivers→team`, `expenses/deductions/report/stats/money→money`, unknown pages→`''`). The only textual difference is `if(name==='home') return 'home'; return '';` refactored to a ternary — semantically identical. `index.html`'s new shim (`function primaryDestinationForPage(name){ return CrewBIQNavigationModel.primaryDestinationForPage(name, getUserRole()); }`) always supplies the live current role, so the fleet-specific `truck`→`team` behavior is preserved exactly, confirmed directly via the new test's `api.primaryDestinationForPage('pti','fleet') === 'team'` real function call.

### Role rank

`ROLE_RANK = {driver:0, owner_op:1, fleet:2}` — confirmed identical values via direct comparison to the original inline `roleRank` object. `FUNCTION_GROUPS`'s `minRole` gating logic (`visibleFunctionGroups`) uses the identical comparison expression (`!item.minRole || ROLE_RANK[role] >= ROLE_RANK[item.minRole]`) as the original inline `applyRoleUI()` code. The stale-invalid-role cascade (`ROLE_RANK['stale']` → `undefined`, making every `>=` comparison `false`, and `group.roles.includes('stale')` → `false`) is preserved exactly, and — unlike the Slice 3A contract, which described this only in prose — this slice's test suite now **proves it via real execution**: `api.roleConfig('stale').label === 'Driver'` and `api.groupedTargets('stale')` deep-equal to driver's exact target set. This directly closes the test-coverage gap this reviewer flagged as non-blocking in the Slice 3A review.

### installRoleGuard — the highest-stakes check in this review

Confirmed `core-runtime.js` is byte-identical to `main` (same blob SHA) — completely untouched by this slice. `setUserRole` remains solely defined in `index.html` (confirmed via `(html.match(/function setUserRole\(role\)/g)||[]).length === 1`), with a body byte-identical to the pre-extraction version (`if (!ROLE_CONFIG[role]) return; localStorage.setItem(K+'userRole', role);`). Confirmed `navigation-model.js` contains **zero** reference to `setUserRole` (direct grep, and the new test's own `assert.doesNotMatch(source, /setUserRole/)`) — no second setter exists anywhere. Confirmed the script-load order still satisfies `installRoleGuard()`'s timing requirement: `core-runtime.js` (loaded first via the untouched hotfix chain) registers its `DOMContentLoaded` listener before the inline script — which still defines `setUserRole` — has executed, so by the time the listener fires, `typeof global.setUserRole === 'function'` is still true and gets wrapped exactly as before.

The new test suite's "core role guard wraps the single effective setter" test goes further than static confirmation: it extracts `roleLevel`, `authorizedUiRole`, and `installRoleGuard`'s actual current function bodies directly from the real, unmodified `core-runtime.js`, executes `installRoleGuard()` for real against a mocked `global.setUserRole` spy and a `localStorage` simulating an authenticated driver-only account (`authRoles: ["driver"]`), and asserts the exact resulting behavior: requesting `'fleet'` is rejected with the real toast message and never reaches the underlying setter, while requesting `'driver'` passes through correctly. This is genuine, current-code proof — not an assumption — that the guard mechanism is unaffected by this extraction. No new path can bypass the guard, because the thing being guarded (`setUserRole`) never moved.

### showPage ownership

Confirmed `showPage()` remains solely in `index.html` (`(html.match(/function showPage\(/g)||[]).length === 1`) and unchanged in responsibility: invalid-page fallback to `menu`, activation, the exact render-hook dispatch table, history/back handling via `pageNavigationHistory`, and primary-nav highlighting are all still present in the same function, confirmed via direct reading and via the new test's genuine `vm`-executed invocation of the real, regex-extracted `showPage` function body (`showPage('invalid')` → `activated === ['menu']`, callback order `['menu','menu']` confirming both `applyRoleUI()` and `updatePageBackNavigation('menu')` fire). `navigation-model.js` contains no `function showPage`, no DOM query methods, and no `classList` reference — confirmed both by direct reading and by the test's explicit negative-space assertion. `navigation-model.js` did not become a second router.

### Page registry

`PAGE_REGISTRY` in the new module carries `classification` (and `technicalContainer: true` where applicable) for all 21 pages. Cross-checked every classification against the Slice 3A-established runtime truth: `work`/`truck`/`money`/`team`/`community` all `ACTIVE` with `technicalContainer:true`; `menu` is `LEGACY_CONTAINER` with `technicalContainer:true`; `marketplace` is `ORPHANED`; every other page is plain `ACTIVE`. This is metadata only — confirmed nothing in `index.html` or `navigation-model.js` branches on `PAGE_REGISTRY` at runtime to alter behavior (it exists purely for tests/documentation, not as a live behavior switch), so its presence cannot itself introduce a hidden behavior change.

### Links

`community`'s reachability is unaffected: still present in every role's `ROLE_CONFIG.menu` and in `FUNCTION_GROUPS`' "Resources & account" group (both confirmed via direct reading of the preserved literals), `showPage('community')`'s dispatch to `renderCommunity()` is untouched (part of the unchanged `showPage()` function), `renderCommunity()` itself is untouched (still delegates to `getLinksRuntime().renderCommunity()` per Slice 2B, and `links.js` is confirmed byte-identical — unchanged by this slice), and the Marketplace `links:'community'` shortcut mapping is still present in `index.html`, confirmed via direct grep and the new test's regex assertion.

### Marketplace

Re-confirmed orphaned: `PAGE_REGISTRY.marketplace.classification === 'ORPHANED'`, and — as in the Slice 3A review — no `showPage('marketplace')` call exists anywhere in the codebase. This extraction changed nothing about Marketplace's reachability; the page registry metadata simply documents the pre-existing state.

### Script load order

Confirmed the `<script src>` order is `core.js, sync.js, pti.js, loads.js, fleet-load-resolution.js, startup-session.js, links.js, navigation-model.js` — `navigation-model.js` is last, appended purely additively (not interleaved), entirely outside `core.js`'s untouched 18-script hotfix chain (`core.js` confirmed byte-identical to `main`). Its position immediately after `links.js` is **not** dependency-required between those two modules (`navigation-model.js` and `links.js` have no relationship to each other) — that specific adjacency is convenient/arbitrary. However, its position **before the inline composition script is genuinely dependency-required, not merely convenient**: unlike `startup-session.js`/`links.js` (whose factories are only invoked lazily, at runtime, well after all scripts load), `navigation-model.js`'s consumer code runs at the inline script's **top level**, synchronously, at parse time (`var ROLE_CONFIG = CrewBIQNavigationModel.ROLE_CONFIG;` executes immediately as the parser reaches it) — if `navigation-model.js` loaded after the inline script, this line would throw a `ReferenceError` and break the entire page. The new test suite directly proves the ordering is correct via an index-position comparison on the real file content (`html.indexOf('navigation-model.js?v=...') < html.indexOf('var ROLE_CONFIG = CrewBIQNavigationModel.ROLE_CONFIG')`).

### Service worker

`CACHE_NAME` correctly bumped `crewbiq-driver-v84` → `crewbiq-driver-v85`, and `/crewbiq-driver/navigation-model.js` correctly added to `APP_SHELL` — confirmed via direct diff. No stale-cache-references-missing-module risk: the bump and the app-shell addition landed in the same commit. The CI workflow's grep-verification step was updated in the same commit for both the new script-tag string and the new cache version, and `navigation-model.js` was also added to the workflow's `pull_request`/`push` path-filter triggers. **One confirmed, purely cosmetic inconsistency**: `sw.js`'s header comment (`* CrewBIQ Driver — Service Worker v1.0.84`) and the activation `console.log('[CrewBIQ SW] v1.0.84 activated')` string were **not** bumped to `v1.0.85` alongside the functional `CACHE_NAME` change — confirmed via the exact commit patch, which touches only the `CACHE_NAME` line and the `APP_SHELL` array. Every prior slice (1B, 2B, 3A's SW predecessor) bumped both together; this one only bumped the functionally-relevant `CACHE_NAME`. Zero behavioral impact (the comment and log string are purely informational), but worth a one-line follow-up.

### Test quality

The new `tests/navigation-contract.test.mjs` is exceptionally thorough and, notably, closes two gaps this reviewer flagged as non-blocking in the Slice 3A review:

- **Full namespace check** (addressing a Slice 2B-era gap pattern): `assert.deepEqual(Object.keys(api), [...all 11 exported names...])` — a complete export-surface check, not a single-member spot check.
- **Invalid-role behavior now genuinely executed** (closing the Slice 3A gap): `api.roleConfig('stale').label === 'Driver'` and `api.groupedTargets('stale')` deep-equal to driver's set, both real function calls against the real loaded module.
- **`installRoleGuard` proven against the real, current `core-runtime.js`** (closing the other Slice 3A gap): extracts and executes the actual current function bodies, not a hand-written reimplementation, and asserts the exact reject/accept behavior plus the absence of a second setter.
- The "load order, globals and single model definitions" test proves single-definition and correct-ordering claims via direct index-position comparison and exact occurrence counts on real file content — not assumptions.
- The `showPage` test genuinely executes the real, regex-extracted function body via `vm.runInNewContext` and asserts real observable call sequences.
- The role-model and `FUNCTION_GROUPS` tests all call real exported functions (`api.roleMenuTargets`, `api.groupedTargets`, `api.visibleFunctionGroups` indirectly via `groupedTargets`, `api.bottomDestinationsForRole`, `api.primaryDestinationForPage`) against the real loaded module rather than re-parsing source text for these particular claims.
- No assertion in this file overstates a `STATIC_CONTRACT`-appropriate structural check (script ordering, single-definition counts) as behavioral proof — the one test explicitly labeled `STATIC_CONTRACT` is correctly limited to exactly that kind of claim.
- The updates to the pre-existing `navigation_shell.test.mjs` and `links-contract.test.mjs` are sensible, necessary maintenance (retargeting assertions that used to read `ROLE_CONFIG`/`FUNCTION_GROUPS` out of `index.html` to instead read them from `navigation-model.js`), not new coverage — appropriate given the extraction moved where these definitions live.

### Runtime scope

Confirmed via a complete diff of `index.html` against the Slice 3A baseline: exactly 5 contiguous hunks, all within the navigation-related code regions (the new script tag, the `ROLE_CONFIG`/`FUNCTION_GROUPS` re-binding block, the `roleRank` re-binding inside `applyRoleUI`, and the `primaryDestinationForPage`/`PRIMARY_NAV_PAGES` shims). Independently confirmed via blob-SHA comparison that `links.js`, `loads.js`, and `core-runtime.js` are all byte-identical before and after this commit. No auth/session, PTI, Links runtime, loads, fuel, expenses, deductions, OCR, Marketplace *state*, Document Vault, IFTA, cloud-sync, or Base44 visual-shell file or code path appears anywhere in this commit.

### Blocking findings

None.

### Non-blocking findings

- `sw.js`'s header-comment and activation-log version strings (`v1.0.84`) were not bumped alongside the functional `CACHE_NAME` bump to `v85` — purely cosmetic, zero behavioral impact, but a confirmed drift from the pattern every prior slice followed.
- All previously-queued non-blocking items (`resolveDefaultTruck` case-sensitivity, unguarded deduction-template save, cosmetic `}function boot()` formatting, HISTORY typos, device-global `clinks` scoping, the `links.js` maintenance-icon drift, the missing-id-edit test gap) remain outstanding, unresolved, and untouched by this slice.

### Model-boundary quality

High. `navigation-model.js` is a small (57-line), purely-data-and-pure-function module with a deliberately simpler export style than the DI-factory pattern used for `startup-session.js`/`links.js` — appropriately so, since it has no effectful dependencies to inject. Its one function that needs live state (`primaryDestinationForPage`) takes that state as an explicit parameter rather than reaching for a global, which is the correct way to keep a data module pure while still being genuinely reusable by a stateful caller.

### Dual-model fidelity

Confirmed exact, field-by-field, against the Slice 3A baseline — see "Dual-model preservation" above. No silent unification.

### Scan behavior assessment

Behavior-equivalent. See "Scan behavior" above — no caller depends on the runtime mutation step itself.

### installRoleGuard assessment

Fully intact and now more rigorously proven than before this slice — see dedicated section above. This is the single most important check in this review given the stakes, and it holds up completely: one setter, one guard, unchanged timing, unchanged `core-runtime.js`.

### Primary-destination parity

Confirmed byte-for-byte equivalent logic (modulo an inert `if`-to-ternary refactor) for every case listed, including the fleet-specific `truck`/`team` behavior.

### Whether Slice 3B is CLOSED

**Yes.** Every ownership, preservation, and safety claim was independently verified against the actual code — much of it via direct execution of the real files rather than trusting either the contract or the test suite's descriptions. The one confirmed finding (the SW version-string cosmetic drift) is trivial and non-blocking. This is, if anything, the most rigorously tested slice in the series so far, closing multiple gaps this reviewer flagged in earlier reviews.

### Whether UI-shell preparation may begin

**Yes, in the sense the task allows** — this extraction genuinely creates a clean enough data/logic boundary that a later visual shell could consume `navigation-model.js`'s page registry, role definitions, and grouping data to drive a redesigned presentation layer without needing to touch business-domain code, role authorization (`installRoleGuard` in `core-runtime.js`, fully independent of this module), or route ownership (`showPage()`'s dispatch table, still in `index.html`, still the single router). Per the task's own instruction, this review does not design that shell — it only confirms the boundary is now sound enough to build toward one.

### Safest next bounded slice recommendation

With auth/session, Links, and navigation-model all now cleanly separated from business logic, the next lowest-risk candidate remains the same one recommended after Slice 2B and reaffirmed after Slice 3A: an **OCR intake transport-adapter behavior contract**, scoped strictly to transport/encode/error-handling (not the still-open Document Vault retention question). Alternatively, if the team wants to begin genuine UI-shell preparation work now that the navigation data boundary exists, the safest first step there would be a **read-only visual prototype** consuming `navigation-model.js` directly (no `index.html` changes at all) to validate that the extracted data is sufficient to drive a new shell before committing to any actual `index.html` rewiring.

---

## Slice 4B Independent Architecture Review — 2026-08-30

Reviewer: Claude. Read the live `CURRENT_START`/`CURRENT_END` block first (Phase: Slice 4B; Status: PUBLISHED / AWAITING CLAUDE REVIEW; implementation commit `d61623c4`). Per the task's instruction, followed the branch to its actual tip (`2b95729`, a docs-only `COLLABORATION_STATE.md` publish on top of `d61623c4`) rather than trusting chat text. Read `ANALYTICS_SCOPE_CONTRACT.md`, `PRODUCTION_UI_INTEGRATION_CONTRACT.md` (the two files this commit actually adds), `NAVIGATION_CONTRACT.md` (unchanged since Slice 3B, confirmed via diff), `UI_SHELL_PROTOTYPE.md`, `docs/product/PRODUCT_CONTRACT.md`, `docs/product/FEATURE_REGISTRY.md`, and `docs/collaboration/ARCHITECTURE.md` in full. This slice adds **zero runtime code and zero test files** — confirmed via the commit's file list (exactly two new markdown files) — consistent with a pure architecture-planning slice.

Method: rather than trusting the contract's own "Current runtime grounding" claims, independently re-derived the highest-stakes ones directly from source: fetched `pti.js` and confirmed the PTI record shape has no `driverId`/`truckId` field; fetched `loads.js` and confirmed load records carry `crewId`/`driverEmail` (account identity) rather than a Driver-profile `driver.id`; fetched `index.html` and confirmed the expense "owner" field is a plain `<select>` enum (`driver`/`codriver`/`both`/`truck`/`company`/`load`), not an entity ID. All three spot-checks — chosen because they are the load-bearing justifications for the contract's stated blockers — matched the contract exactly, with no overstatement found in any of them.

### VERDICT: **ACCEPT**

### 1. Identity vs. analytics scope

Cleanly separated, and correctly so. The contract's central invariant — "Authentication establishes the actor and workspace permissions. Analytics scope identifies the subject and period being displayed. They are not interchangeable." — is architecturally consistent with everything independently verified across the Slice 1A/1B/3A/3B reviews: authenticated identity lives in the Bearer session + `fiqD_authRoles`; UI role (`fiqD_userRole`) is a separate, non-authoritative visibility preference; this contract correctly adds `AnalyticsScope` as a *third*, independent axis rather than overloading either of the first two. An owner viewing their own driving work stays authenticated as the owner and does not switch role — confirmed by the contract's own explicit ban on inferring identity from display names, and by its requirement that unresolved scopes fail closed rather than fall back to a first driver. Stable IDs (`workspaceId`, `driverId`, `truckId`) are structurally required by the `AnalyticsScope` value object itself — there is no field for a display name or array index anywhere in it.

### 2. Scope types

`SELF`/`DRIVER`/`TRUCK`/`FLEET` are precisely specified via the validation-rules table (required/forbidden identifiers per type), and each ambiguity the task asked about is explicitly addressed rather than left implicit: `SELF` without a linked driver profile is a named failure state (`self_not_linked`) distinct from an ambiguous one (`self_ambiguous`) — not a silent fallback. `DRIVER` selection permissions are correctly deferred to "a trusted permission resolver," kept separate from the UI's mere display of options. `TRUCK` scope explicitly forbids `driverId` as a filter (correct — truck history must include every driver who used it, not just whoever is currently assigned). `FLEET` forbids both `driverId` and `truckId` (correct — an aggregate scope cannot silently narrow to one entity). Period/date semantics are defined per period type with `custom` requiring both bounds explicitly (missing or inverted bounds are invalid) and — importantly — the contract states the period resolver, not the pure selectors, owns calendar math and wall-clock reads, which is the right place to isolate non-determinism.

### 3. Current runtime grounding

Independently verified the three highest-stakes claims directly against source (see Method above) and found none overstated. Given this contract's track record on the spot-checks that matter most, and given every other Slice-N contract this reviewer has independently verified in this series has been consistently accurate (occasionally more conservative than warranted, never inflated), the remaining rows of the "Canonical data inventory" and dashboard-mapping tables are credible without needing an exhaustive cell-by-cell re-derivation. Two specific claims deserve calling out because they're exactly the kind of thing that could have been fudged and weren't: PTI's "no canonical `driverId` or `truckId`" is not softened anywhere in the document despite being an inconvenient, blocker-creating fact, and the load record's driver reference is precisely described as "mixes `crewId` and current profile" rather than glossed over as "has driverId."

### 4. Canonical IDs

What currently exists: `workspaceId` (from canonical membership/company reads, established in Slice 1A/1B), account `crewId` (the authenticated identity), Driver-profile `driver.id` (fleet roster records), `truck.id`, and load `id`/business `loadId`. Confirmed via direct reading that `driver.id` (a fleet-roster Driver profile) and account `crewId` (the authenticated identity) are **different identifier spaces** with no proven, universal bridge between them — this is exactly what `NORMALIZED_RECORD_DRIVER_ID` and `ACCOUNT_DRIVER_LINK` describe, and the contract is accurate to flag both as real blockers rather than inventing a false equivalence. Records using name/unit/current-assignment instead of stable IDs were independently confirmed: the load record's driver field is `crewId` (an account identifier, fine for same-account SELF, not a fleet-roster join key), and the expense `owner` field is a bare enum string.

### 5. Owner also driver

Correctly treated as a broader-scope blocker, not conflated with the base `SELF` case. Confirmed the runtime does **not** currently have a reliable, universal account→Driver-profile link (independently verified no such foreign key exists anywhere in the `loads.js`/`index.html` code this reviewer has read across this entire series). The contract correctly requires this case to fail closed with a structured reason (`self_not_linked`/`self_ambiguous`) rather than inferring from name, unit number, first truck, first driver, or role — this is the same discipline the codebase already enforces for `getDefaultTruck()` after the Slice 1A.1 fix (no first-truck fallback), now correctly extended to driver-identity resolution. This is the single most important correctness property in the whole contract, and it holds.

### 6. Truck ↔ driver over time

`EFFECTIVE_DATED_DRIVER_TRUCK_ASSIGNMENT` is correctly identified as needed: `driver.truckId` is a current-only presentation/configuration field (confirmed via this reviewer's repeated direct reading of `getDefaultTruck()`/`resolveDefaultTruck()` and related code across the Slice 1A.1/1B/2B/3A/3B reviews — there is no historical interval data structure anywhere in the inspected runtime). The contract correctly avoids attributing a truck's entire historical period to whichever driver is *currently* assigned, and correctly defers the proposed `DriverTruckAssignment` interval model to a separate, later-reviewed slice (4B.1b) rather than smuggling a new persistent schema into 4B.1a. `TRUCK` scope can indeed be implemented before this blocker is resolved if it uses only truck-owned records: fuel and service/maintenance logs already carry `truckId` directly with no per-driver attribution needed, and the contract's own readiness table correctly marks these `READY` for truck totals — consistent with what this reviewer independently confirmed of the fuel/service record shapes across earlier reviews.

### 7. Time semantics

`today`/`week`/`month`/`quarter`/`custom` are each defined, and the contract flags a real, specific risk this reviewer can independently corroborate: "current helpers may seed [week] but must not silently mix ISO and configured settlement weeks" — this is a genuine hazard given the settlement-week machinery (`settlement-week-hotfix.js`, `getDedWeekKey()`) observed throughout this series, which defines its own truck-specific settlement-week boundary, not necessarily aligned to a calendar-ISO week. Correctly flagging this rather than silently picking one convention is the right call. Current records do carry usable dates for historical aggregation (load `pickup`/`date`, fuel/service/expense `date`, settlement `weekKey`, dispute timestamps) — consistent with prior findings. One minor open question the contract doesn't fully resolve: where the canonical `timeZone` value for the scope object comes from (workspace setting vs. device-local) — reasonably left as an implementation detail for the not-yet-built period resolver, non-blocking.

### 8. Dashboard mapping

Spot-verified the highest-stakes cells (PTI, load driver reference, expense owner) directly against source and found the mapping tables accurate and, if anything, conservatively labeled. The specific metrics the task called out (Net, Gross, Loaded miles, Deadhead, RPM, Fuel, PTI state, Current truck, Fleet gross, Active trucks, Active drivers, Exceptions, Document review, Utilization, Evidence completeness) each have an explicit real-source citation, a stated aggregation approach, an explicit scope-support note, and a readiness label that matches this reviewer's own understanding of the underlying data from the entire review series — e.g., `Fleet gross`/`Active trucks`/`Active drivers` correctly `READY` (these are straightforward scoped-record reads with existing authoritative finance wrappers), while `Utilization`/`PTI compliance`/`Evidence completeness` are correctly `MISSING` (no approved definition or entity IDs exist yet for any of them).

### 9. Analytics engine boundary

The proposed pure-read module correctly excludes persistence, forms, auth, and every business-record mutation path — confirmed by direct reading of the API list (`createAnalyticsSnapshot`, `normalizeAnalyticsScope`, `authorizeAnalyticsScope`, `getDashboardMetrics`, `getEarningsSeries`, `getMileageSeries`, `getFleetUtilization`, `getDriverPerformance`, `getComplianceSummary`, `getRelatedEntities`), each parameterized by `(snapshot, scope)`-shaped arguments and explicitly required to return "values plus provenance metadata" while being barred from writing, syncing, touching the DOM, or silently broadening scope. This is appropriately bounded — a narrower first API is not needed beyond what the sequencing plan (§ Bounded integration sequence) already does: 4B.1a implements only a subset of this surface (snapshot creation, `SELF`-only scope validation, load-based metrics/series), with the full ten-function surface as the eventual target shape rather than something 4B.1a must build all at once.

### 10. 4B.1a safety — the central question

Walking through each sub-question against what this reviewer has independently confirmed:

- **Is `SELF` identity resolvable?** Yes, for a driver-role account — confirmed via direct reading of `loads.js`'s identity-scoped storage (`ownerKey()`, `crewId`-based record attribution): a driver-role account's own local data partition already *is* 100% that account's own data by construction, with no foreign-key join required. **No**, for an owner/fleet account viewing itself as a driver — correctly deferred, and correctly required to fail closed rather than guess.
- **Are gross/miles/load count derivable without new schema assumptions?** Yes — `gross`, `driverPay`, `loadedMiles`, `deadMiles` are existing fields on load records, confirmed across this reviewer's repeated direct reading of load-save/finance code in prior slices.
- **Can period filtering be deterministic?** Yes, provided the period resolver receives explicit bounds and never reads the wall clock internally, exactly as the contract requires; load records do carry usable dates.
- **Can it avoid first-truck/first-driver fallback?** Yes — a driver-role account's `SELF` scope needs no truck/driver disambiguation at all, since it isn't picking one driver out of many; it's reading the whole of one account's own already-scoped data.
- **Can it be pure-read?** Yes — nothing in the proposed adapter/selector chain writes anything, confirmed by direct reading of the API list and the explicit "no mutations" framing throughout both contracts.
- **Can it avoid UI integration?** Yes — 4B.1a is explicitly scoped as "no visual shell."

**Conclusion: 4B.1a is safe to implement as named — but only under one condition this review makes explicit and non-negotiable, which the contract's own text already implies but does not state as sharply:** the `SELF`-scope validator built in 4B.1a must be complete on day one, including its rejection paths (`self_not_linked`, `self_ambiguous`) for owner/fleet accounts without a proven Driver-profile link — not a stub that silently assumes every authenticated account is a plain driver. 4B.1a's safety depends entirely on the validator's *failure modes* being implemented and tested with the same rigor as its success path; deferring only the success path for owner/fleet-as-driver to 4B.1b (as the contract already plans) is correct, but deferring the *rejection* behavior too would silently reintroduce exactly the kind of unsafe inference this whole contract exists to prevent. Given this condition is already embedded in the contract's own identity-resolution section, this review endorses 4B.1a as named, with this condition called out explicitly as a required test fixture (the contract's own guardrail list already requires "ambiguous identity" and "unauthorized scope" fixtures — this confirms that requirement is sufficient, not merely present).

### 11. Driver ranking

`NOT_READY` is correct. Reviewed the dimension table (Production, Efficiency ×2, Compliance ×2, Reliability ×2, Safety) — each dimension is independently assessed with its own readiness rather than rolled into one number, and the document explicitly states "No composite score is approved in this slice. Gross revenue alone must never label a driver 'best.'" This correctly keeps revenue, efficiency, compliance, reliability, and safety as separate, non-conflated concerns, exactly as the task required — no scoring formula is invented anywhere in the document.

### 12. Website / PWA

The shared-architecture claim ("Both use the same identity, workspace, entities, permissions, `AnalyticsScope`, selectors, and view-model contracts. The website is not a second backend.") is consistent with the existing, if now slightly stale-worded, `PRODUCT_CONTRACT.md` principle that `crewbiq.com` is a web surface for the same canonical identity/data layer, not a parallel system. No web-only concern in either contract is elevated to a business-logic or backend concern inappropriately — everything web-specific mentioned (a persistent selector, more panels/tables) is presentation-layer framing, correctly left there.

### 13. IFTA / audit compatibility

The scope model preserves the required evidence chain shape (`Truck -> effective Driver assignment -> Load/Trip -> Route -> Miles -> Fuel -> IFTA quarter`) without attempting to implement it, and explicitly states current load miles and truck-linked fuel are useful foundations while route/jurisdiction mileage, historical assignment evidence, and Document Vault proof remain incomplete — consistent with this reviewer's own findings across the entire series regarding the Document Vault gap. The contract explicitly states analytics summaries must not replace raw evidence, and that IFTA support must later extend entity evidence rather than redefine `AnalyticsScope` — no conflict, sound compatibility.

### 14. SIDR future contract

The proposed chart-selection event payload (`scope`, `metricId`, `period`, `selectedDate`, `selectedSeries`, `selectedValue`, `relatedEntityIds`) is well-designed: it carries enough context for SIDR to explain a result without SIDR ever owning the canonical calculation, and the document explicitly states "SIDR may explain a read result but may not mutate domain records or bypass permissions" and — notably — "Empty related IDs must mean 'not available,' not fabricated provenance." This last clause is a genuinely important, correctly-anticipated guard against the specific failure mode of an LLM-driven agent fabricating plausible-looking entity IDs when it doesn't actually have real ones.

### 15. Permissions

The contract repeatedly and explicitly distinguishes "available scope options" (UI display) from "actual server/data authorization" ("UI visibility is not authorization. A trusted permission resolver must authorize the normalized scope before selectors read data" and "Selectors must not accept unverified IDs directly from DOM controls"). No language anywhere in either document could be read as encouraging trust in UI-hiding as a security boundary — this correctly extends the exact discipline already established and independently verified in the Slice 3A/3B reviews (`showPage()` has no role enforcement; roles are UI-only) into the new analytics domain.

### Blocking findings

None.

### Non-blocking findings

- `docs/product/PRODUCT_CONTRACT.md` and `docs/product/FEATURE_REGISTRY.md` are now materially stale relative to the accepted state of this branch: both are still headed "Slice 0b" and contain statements directly contradicted by since-accepted work — e.g. `PRODUCT_CONTRACT.md` §1 still reads "No auth/session extraction work starts yet outside this Slice" and §5 still reads "index.html... must be preserved... until a sanctioned decomposition plan is approved," despite Slices 1A/1B (auth/session), 2A/2B (Links), and 3A/3B (navigation) all having since been reviewed and accepted. `FEATURE_REGISTRY.md`'s "Links" row still frames extraction as a future "Next action" ("Preserve current container while extracting links domain") when that extraction is done and accepted. Neither file was touched by this slice (correctly, since that wasn't its job), but they were part of this review's required reading and the staleness is real and worth a dedicated cleanup pass so future agents reading these files aren't misled about what's already been decided.
- `docs/collaboration/ARCHITECTURE.md` was kept current through "Slice 2B Links runtime module" but has no corresponding "Slice 3B Navigation Model" section, and its "Current module map" list doesn't include `navigation-model.js` at all — a smaller version of the same staleness pattern, worth a one-paragraph addition alongside the `PRODUCT_CONTRACT.md`/`FEATURE_REGISTRY.md` refresh.
- The contract doesn't specify where the canonical `timeZone` value in `AnalyticsScope` is sourced from (workspace setting vs. device-local) — reasonably left as an implementation detail for the period resolver, not a defect in this architecture-only slice.
- All previously-queued non-blocking items from prior slices remain outstanding and untouched by this slice.

### Whether Slice 4B is CLOSED

**Yes.** Both new contracts independently verified against actual runtime code rather than accepted on their own word; the identity/scope separation is architecturally sound and consistent with every prior slice in this series; every scope type, blocker, and readiness claim checked against source was accurate and appropriately conservative; the proposed analytics API boundary is correctly narrow; the driver-ranking, IFTA, SIDR, and permissions sections all hold up under scrutiny; and the one central safety question — whether 4B.1a is actually implementable now — resolves to yes, under a condition the contract's own text already supports. The documentation-staleness findings are real but orthogonal to this slice's own correctness.

### Exact safest first production implementation slice

**(A) 4B.1a — Driver SELF analytics snapshot and pure period selectors — as named**, with the explicit condition stated in §10 above made a non-negotiable part of its acceptance criteria: the `SELF`-scope validator must ship complete, including its `self_not_linked`/`self_ambiguous` rejection paths, tested with the same rigor as its success path, from its very first commit — not deferred to 4B.1b alongside the account-to-driver link itself. `ACCOUNT_DRIVER_LINK` is required only for the *success* path of owner/fleet-as-driver `SELF`, not for a driver-role account's own `SELF`, and not for the *rejection* path either case must already implement.

