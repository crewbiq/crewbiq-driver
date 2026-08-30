# Legacy Artifact Matrix (Repository Reconciliation)

This matrix lists representative legacy/open items that are still visible in planning and execution context and classifies how they should be handled by future slices.

| Artifact | Type | Status | Current relevance | Conflict with current plan? | Recommended action |
| --- | --- | --- | --- | --- | --- |
| Issue #97 — Collect provenance-linked maintenance knowledge | Issue (Open) | ACTIVE | Required for maintenance evidence | Conflicts with current proof-weak maintenance notes only | MERGE_INTO_CANONICAL_PLAN |
| Issue #98 — Standardized service invoice and repair template | Issue (Open) | IN_PROGRESS | Helps complete OCR/service workflow | Conflicts with unstructured service-invoice handling | MERGE_INTO_CANONICAL_PLAN |
| Issue #83 — Separate truck identity from company/settlement settings | Issue (Open) | IN_PROGRESS | Required for role/workspace governance | Low conflict (partially superseded by split architecture) | KEEP |
| Issue #90 — Base44-inspired UI refresh | Issue (Open) | NEEDS_DECISION | Design-only relevance | Conflicts with Base44 optionality rule | DEPRECATE |
| Issue #75 — durable dispute deactivation | Issue (Open) | IN_PROGRESS | Active product correctness item | No major conflict | KEEP |
| Issue #21 — OCR Phase 4 segmented service invoice review | Issue (Open) | NEEDS_DECISION | Core for accounting correctness and evidence | Conflicts with legacy non-retention language | SUPERSEDE |
| Issue #19 — OCR Phase 3 durable fuel audit trail | Issue (Open) | IN_PROGRESS | Core for source lineage and import integrity | Low conflict; aligns with contract | KEEP |
| Issue #20 — Fleet accounting integrity | Issue (Open) | IN_PROGRESS | Settlement and ledger correctness | Conflicts with any overwrite-style logic | KEEP |
| Issue #5 — Authenticated Bearer fleet restore after login | Issue (Open) | IN_PROGRESS | Sync reliability | Conflicts with any opaque restore behavior | KEEP |
| Issue #2 — Zero Friction sync and trustworthy restore | Issue (Open) | IN_PROGRESS | Baseline sync direction | Conflicts only with unbounded rewrite plans | KEEP |
| Issue #100 — Pre-Base44 architecture audit | Issue (Open) | ACTIVE | Canonical process gate | No direct conflict (meta-accepted) | KEEP |
| PR #94 — Add Company & Settlement workflow | Draft PR | SUPERSEDED | Domain still required; better paths exist in registry/issue #83 | Potential overlap with issue #83 and role/capability refactor | MERGE_INTO_CANONICAL_PLAN |
| PR #91 — Begin Base44-inspired UI refresh | Draft PR | DEPRECATED | UI reference only | Conflicts with optionality contract | DEPRECATE |
| PR #77 — Add TENANT-ID-01 collision journey | Draft PR | ACTIVE | Security-hardening confidence item | Low conflict | KEEP |
| PR #82 — Loads populated edit form fix | Draft PR | ACTIVE | UX robustness for load workflows | No material conflict | KEEP |
| PR #42 — Local UX and responsive smoke | Draft PR | ACTIVE | Testing quality item | No material conflict | KEEP |
| PR #99 — settings lifecycle coverage | Closed PR (merged) | ACTIVE | Canonical behavior for settings stability | No conflict | KEEP |
| PR #95 — Resolve loads without first-truck guessing | Closed PR (merged) | ACTIVE | Canonical load ambiguity constraint | Supersedes old fallback practice | KEEP |
| PR #93/92 — Significant mutation confirmation | Closed PRs (merged) | ACTIVE | Safer destructive actions | No conflict | KEEP |
| PR #87 — Read-only canonical Company and Truck view | Closed PR (merged) | ACTIVE | Canonical identity visibility | No conflict | KEEP |
| PR #85/86 — Identity and orchestrator read-only account | Closed PRs (merged) | ACTIVE | Authentication/session and restore baseline | No conflict | KEEP |
| Issue #32 (docs) — CrewBIQ Knowledge Engine and Truckpedia | Issue (docs repo, Open) | NEEDS_DECISION | Strategic future dependency | Conflicts with current one-cabinet + canonical-first execution | NEEDS_PRODUCT_DECISION |
| Issue #31 (docs) — Restore CrewBIQ Bot as governed SIDR | Issue (docs repo, Open) | NEEDS_DECISION | Strategic AI governance dependency | Conflicts with direct DB write risk | NEEDS_PRODUCT_DECISION |
| Issue #30 (docs) — Parts Intelligence Platform | Issue (docs repo, Open) | DEFERRED | Future domain adjacent to maintenance | Conflicts with current sequencing | LEAVE_OPEN |
| Issue #53 (orchestrator) — real-data lifecycle backlog | Issue (open) | KEEP | Cross-repo accounting/data lifecycle input | Low conflict | KEEP |
| Issue #52 (orchestrator) — historical effective settings | Issue (open) | KEEP | Supports deduplication/accounting model | Alignment required | KEEP |
| Issue #2 (orchestrator) — read-only AI auditor | Issue (open) | NEEDS_DECISION | AI governance path | Conflicts with unconstrained model assumptions | DEPRECATE / NEEDS_PRODUCT_DECISION |
