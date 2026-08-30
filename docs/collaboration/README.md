# CrewBIQ Collaboration Protocol

This directory is the durable handoff surface for multi-agent work on CrewBIQ.

## Start here
Every agent starts from `CURRENT_STATUS.md`, then the active GitHub issue, then the relevant contract/audit document. Chat history is supplementary, not authoritative.

## Planned durable documents
- `CURRENT_STATUS.md` — active focus, phase, blockers, next bounded action.
- `FUNCTIONAL_AUDIT.md` — READY / PARTIAL / BROKEN-REGRESSED / MISSING / NEW matrix.
- `PRODUCT_CONTRACT.md` — canonical behavior and non-negotiable product requirements.
- `ARCHITECTURE.md` — client, Orchestrator, storage, web/mobile, evidence, SIDR boundaries.
- `DECISIONS.md` — accepted architectural/product decisions and rationale.
- `WORK_LOG.md` — adopted work, branches/PRs, tests and evidence.
- `HANDOFF.md` — concise next-agent handoff.
- `BASE44_HANDOFF.md` — generated only after the audit/contract are mature; remains optional.

## Collaboration model
### Codex — implementer
Works only on approved bounded slices. Must not silently redesign architecture or UI behavior outside the slice.

### Claude — independent reviewer
Reviews the actual diff and contracts independently. Focus: hidden coupling, regressions, architecture, data/identity/sync/accounting safety, UX risk and maintainability. Does not silently expand implementation scope.

### ChatGPT — architecture/product coordinator
Maintains product intent, reconciles requirements, audits current state, defines acceptance and prepares handoffs.

## Adoption rule
A consequential refactor is not considered adopted merely because code compiles. It needs behavior-preservation evidence and independent review appropriate to its risk.

## Design quality rule
Passing tests is necessary but not sufficient for UI work. Visual/interaction quality must be reviewed against the approved CrewBIQ/Base44 reference direction: hierarchy, spacing, motion, states, icons, ergonomics and mobile feel.

## Base44
Base44 is an optional specialist, not the architecture owner. We deliberately preserve the option to complete the product without Base44 if internal collaboration reaches the required UI quality and delivery speed.