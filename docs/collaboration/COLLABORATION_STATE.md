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
- Independent Claude reconciliation review: PENDING.

## Current task owner
Claude — independently review Codex canonical product documentation against current GitHub evidence.

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
- Task: Independent reconciliation review
- Status: PENDING
- Expected output: append/update review findings in `docs/collaboration/CLAUDE_REVIEW.md` and then update this file.

### ChatGPT
- Role: architecture/product coordinator and reconciliation authority
- Next action: read this file plus the latest Claude/Codex artifacts after user says only `готово`.
