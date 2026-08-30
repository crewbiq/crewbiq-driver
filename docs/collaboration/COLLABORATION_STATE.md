# CrewBIQ Collaboration State

This is the single coordination entry point for ChatGPT, Codex, and Claude during the current pre-Base44 work.

## Rule
Every agent MUST read this file before starting work and MUST update it after publishing work.

Chat history is supplementary only. GitHub is the durable source of truth.

## Repository
- Repo: `crewbiq/crewbiq-driver`
- Product truth: current `main`
- Collaboration branch: `agent/pre-base44-audit`

## Current phase
Legacy Roadmap & Documentation Reconciliation review.

## Current implementation status
- Slice 0 hotfix load-order contract: CLOSED.
- Slice 0b CI/tooling closure: CLOSED.
- Canonical legacy/product documentation package: PUBLISHED by Codex at `e8822806713d2c3644880d1c88f3c603ffe7e029`.
- Independent Claude reconciliation review: COMPLETE — verdict NEEDS FIX (4 blocking findings; see Claude's entry below and `docs/collaboration/CLAUDE_REVIEW.md`).

## Current task owner
Codex (or ChatGPT as coordinator) — apply the 4 blocking corrections (Document Vault status, Weekly photo PTI split, Community row rewrite, DOCUMENTATION_AUTHORITY two-track split) before canonical docs are treated as fully binding.

## Required Claude review target
Review these files on `agent/pre-base44-audit`:
- `docs/product/PRODUCT_CONTRACT.md`
- `docs/product/FEATURE_REGISTRY.md`
- `docs/product/ROADMAP.md`
- `docs/product/DEPRECATED_DECISIONS.md`
- `docs/product/DOCUMENTATION_AUTHORITY.md`
- `docs/product/LEGACY_ARTIFACT_MATRIX.md` if present

Codex source commit:
`e8822806713d2c3644880d1c88f3c603ffe7e029`

## Known review hotspots
- `Document Vault` status may be incorrectly marked `IN_PROGRESS`; previous evidence found source retention missing.
- `Weekly photo PTI` status may be incorrectly marked `IN_PROGRESS`; verify actual runtime evidence.
- `Community` must not be deprecated in a way that breaks the live Links surface.
- Historical OCR requirements that say original files remain unstored are superseded by source-retention requirements.
- Old Work/Truck/Money/Team/Marketplace pages must remain clearly distinguished from current product intent.
- Issue #83, #97, #98, #19, #21 and old sync/identity work must be reconciled, not blindly adopted.

## Agent publication protocol
After any agent finishes a task, update this file with:
- Agent
- Task
- Verdict/status
- Branch
- Commit SHA
- Files/artifacts created or reviewed
- Blocking findings
- Next required actor
- Next bounded action

Do not start the next implementation slice unless this file says the previous slice is accepted/closed.

## Latest published work
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

### ChatGPT
- Role: architecture/product coordinator and reconciliation authority
- Next action: read this file plus the latest Claude/Codex artifacts after user says only `готово`.
