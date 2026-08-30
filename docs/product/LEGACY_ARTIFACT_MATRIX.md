# Legacy Artifact Matrix (Repository Reconciliation)

| Artifact | Type | Status | Current relevance | Conflict with current plan? | Action |
| --- | --- | --- | --- | --- | --- |
| Issue #97 — collect provenance-linked maintenance knowledge | Issue (Open) | IN_PROGRESS | Required for maintenance evidence | Conflicts with proof-weak maintenance notes only | MERGE_INTO_CANONICAL_PLAN |
| Issue #98 — standardized service invoice and repair template | Issue (Open) | IN_PROGRESS | Needed for service-invoice quality and repair evidence consistency | Low conflict | MERGE_INTO_CANONICAL_PLAN |
| Issue #83 — separate truck identity from company/settlement settings | Issue (Open) | IN_PROGRESS | Required for role/workspace governance | Low conflict (partially overlapping plan) | KEEP / MERGE_INTO_CANONICAL_PLAN |
| Issue #90 — Base44-inspired UI refresh | Issue (Open) | DEPRECATED | Design reference only per Product Contract | Conflicts with optionality rule | DEPRECATE |
| Issue #75 — durable dispute deactivation | Issue (Open) | IN_PROGRESS | Active product correctness item | Low/no conflict | KEEP |
| Issue #21 — OCR phase 4: segmented service invoice review | Issue (Open) | IN_PROGRESS | Still valid for editable groups, segmentation, reconciliation, single-count, lineage, and duplicate prevention | Only conflict is the non-storage assumption: “original file remains unstored” | KEEP / MERGE_INTO_CANONICAL_PLAN |
| Issue #19 — OCR phase 3 durable fuel audit trail | Issue (Open) | IN_PROGRESS | Core for source lineage and import integrity | Low conflict; aligns with contract | KEEP |
| Issue #20 — Fleet accounting integrity | Issue (Open) | IN_PROGRESS | Settlement and ledger correctness | Conflicts with overwrite-style logic only | KEEP |
| Issue #5 — authenticated Bearer fleet restore after login | Issue (Open) | IN_PROGRESS | Sync reliability | Conflicts with opaque restore behavior | KEEP |
| Issue #2 — zero-friction restore + trustworthy sync | Issue (Open) | IN_PROGRESS | Baseline sync direction | Low | KEEP |
| Issue #100 — Pre-Base44 architecture audit | Issue (Open) | ACTIVE | Audit scope and process control | None | KEEP |
| PR #94 — add Company & Settlement workflow | Draft PR | NEEDS_PRODUCT_DECISION | Domain still required | Potential overlap with issue #83 and role/capability split | MERGE_INTO_CANONICAL_PLAN or REVISE |
| PR #91 — begin Base44-inspired UI refresh | Draft PR | DEPRECATED | Design-only relevance | Conflicts with optional Base44 rule | DEPRECATE |
| PR #77 — add TENANT-ID-01 collision journey | Draft PR | ACTIVE | Security-hardening confidence item | Low | KEEP |
| PR #82 — loads populated edit form fix | Draft PR | ACTIVE | UX robustness for load workflows | None | KEEP |
| PR #42 — local UX and responsive smoke | Draft PR | ACTIVE | Testing quality item | None | KEEP |
| PR #99 — settings lifecycle coverage | Closed PR (merged) | ACTIVE | Settings stability | No conflict | KEEP |
| PR #95 — resolve loads without first-truck guessing | Closed PR (merged) | ACTIVE | Canonical load ambiguity constraint | Supersedes fallback behavior | KEEP |
| PR #93/#92 — significant mutation confirmation | Closed PRs (merged) | ACTIVE | Safer destructive-action policy | No conflict | KEEP |
| PR #87 — canonical Company and Truck read-only view | Closed PR (merged) | ACTIVE | Canonical identity visibility | None | KEEP |
| PR #85/86 — identity/accounting/read-only orchestrator baseline | Closed PRs (merged) | ACTIVE | Auth/session/read baseline | No conflict | KEEP |
| Issue #29 (crewbiq-docs) — CrewBIQ Knowledge Engine and Truckpedia | Issue (open, cross-repo) | NEEDS_DECISION | Strategic future dependency | Not fully aligned with one-cabinet sequencing | NEEDS_PRODUCT_DECISION |
| Issue #31 (crewbiq-docs) — restore CrewBIQ Bot as governed SIDR | Issue (open, cross-repo) | NEEDS_DECISION | AI governance path | Direct AI-to-DB risk conflict | NEEDS_PRODUCT_DECISION |
| Issue #30 (crewbiq-docs) — Parts Intelligence Platform | Issue (open, cross-repo) | DEFERRED | Future maintenance-adjacent domain | Outside current sequencing | LEAVE_OPEN |
| PR/fragment: `page-work` / `page-truck` / `page-money` / `page-team` IA hubs | Implementation fragment | DEPRECATED | Historical, no active nav path | Could be revisited if IA redesign is approved | DEPRECATE |
| PR/fragment: `page-marketplace` shell and renderer | Implementation fragment | DEPRECATED | Historical shell only, not current product domain | Could be interpreted as active domain if not documented clearly | DEPRECATE |
| Issue #53 (orchestrator) — real-data lifecycle backlog | Issue (open, cross-repo) | KEEP | Cross-repo accounting/data lifecycle input | Low conflict | KEEP |
| Issue #52 (orchestrator) — historical effective settings | Issue (open, cross-repo) | KEEP | Supports deduplication/accounting model | Alignment required | KEEP |
| Issue #2 (orchestrator) — read-only AI auditor | Issue (open, cross-repo) | NEEDS_DECISION | AI governance path | unconstrained model risk | NEEDS_PRODUCT_DECISION |
