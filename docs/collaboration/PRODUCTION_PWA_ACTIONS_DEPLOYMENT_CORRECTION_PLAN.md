# Production PWA Actions Deployment Correction Plan

Date: 2026-09-01

Status: `PUBLISHED / AWAITING CLAUDE REVIEW`

Scope: coordination and design only. No workflow, branch, Pages configuration,
deployment, runtime, `main`, migration, or production-data change is authorized
or performed by this plan.

## Current production state

- GitHub Pages: `build_type=legacy`, source `main`, path `/`.
- Production PWA: commit
  `86b8b4dd7e9496833a021319167589b49f0ac418`, cache v79, live and restored.
- Accepted PWA artifact: exact commit
  `66a7985765b76e0702d015ca1e300390156f8ad6`, cache v95.
- Accepted orchestrator commit
  `27e3463220a2022ea1adf074d7131ec69eb32fe5`: live, healthy, and ready.
- Migrations 003 through 011: applied exactly once.
- Both alternate legacy source refs are inactive evidence at the accepted SHA:
  `agent/production-release-20260901-v95` and
  `production-v95-66a7985`.

## Why another legacy source swap is rejected

The slash-containing and slash-free refs both used the same accepted tree.
GitHub reported each build as `built`; each served all required project-site
assets as HTTP 404 for a complete ten-minute window. Both refs and `main` were
allow-listed in the `github-pages` environment. Only `main` has ever restored
the live project site successfully.

The legacy non-main branch variable space is sufficiently exhausted. Another
legacy source branch experiment would not isolate a new evidence-backed
variable.

## Mandatory correction to the requested trigger model

The originally suggested combination cannot be implemented as written:

1. GitHub documents that `workflow_dispatch` only triggers when the workflow
   file exists on the default branch.
2. This repository's default branch is `main`.
3. Adding a workflow file to either immutable evidence branch would move it
   away from exact accepted SHA `66a7985`.
4. Adding the workflow to `main` is outside the no-merge/no-main boundary.

Therefore a workflow on an immutable exact-SHA branch triggered through
`workflow_dispatch` is not a valid no-main design.

Official references:

- https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_dispatch
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://github.com/actions/upload-pages-artifact
- https://github.com/actions/deploy-pages

## Smallest executable Actions candidate

Separate the immutable application artifact from the workflow control commit.

### Immutable artifact

- Ref: existing `production-v95-66a7985`.
- Exact target: `66a7985765b76e0702d015ca1e300390156f8ad6`.
- The ref is never moved, rewritten, or used as a workflow-control branch.
- The workflow must checkout this full SHA explicitly, never `HEAD`,
  `github.sha`, a tag, or a mutable branch.

### Workflow control

- Proposed future control branch: `pages-actions-v95-66a7985`.
- Trigger: `push` restricted to that exact branch name.
- The control branch contains one independently reviewed workflow-only commit.
- Creating the control ref is the deliberate execution trigger; it must not
  exist before the separately authorized production execution.
- No force-push, second push, reusable branch, or broad branch pattern is
  allowed.

This changes deployment transport while keeping application bytes fixed.

## Proposed workflow contract

The future workflow, not created in this slice, must enforce:

```yaml
name: Deploy accepted CrewBIQ PWA to Pages

on:
  push:
    branches:
      - pages-actions-v95-66a7985

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false
```

The single deployment job must:

1. Use the `github-pages` environment.
2. Checkout full SHA
   `66a7985765b76e0702d015ca1e300390156f8ad6` with persisted credentials
   disabled.
3. Assert `git rev-parse HEAD` equals that SHA.
4. Run `actions/configure-pages`.
5. Run `actions/upload-pages-artifact` against the checked-out static root.
6. Run `actions/deploy-pages` and record its deployment/page URL output.
7. Perform no build, transformation, runtime edit, package install, migration,
   secret write, or business-data operation.

Actions must be pinned to independently reviewed major versions or immutable
SHAs according to the repository's accepted supply-chain convention. Exact
pins belong to the future workflow implementation review, not this design doc.

## Required two-phase sequencing

### Phase A: non-production workflow implementation

1. Add only the workflow and targeted static contract tests on
   `agent/pre-base44-audit`.
2. Ensure its branch filter does not match the collaboration branch, so no
   Pages run can start.
3. Contract-test exact artifact SHA, permissions, environment, concurrency,
   action pins, no-build behavior, and rollback documentation.
4. Publish and obtain independent Claude ACCEPT.

Phase A may not change Pages settings, environment policies, `main`, release
refs, runtime files, or production.

### Phase B: separately authorized production execution

Only after Phase A ACCEPT and explicit Product Owner authorization:

1. Reconfirm production PWA `main/86b8b4d/v79` and server readiness.
2. Record current Pages and `github-pages` environment configuration.
3. Add one exact custom deployment policy for
   `pages-actions-v95-66a7985`.
4. Change Pages `build_type` from `legacy` to `workflow`.
5. Create the previously absent control ref at the reviewed workflow commit;
   that one push triggers execution.
6. Require the expected workflow run, environment deployment, accepted
   artifact SHA assertion, and Pages deployment success.
7. Verify the complete 13-asset set for up to ten minutes.
8. Require HTTP 200 and exact Git blob equality for every asset.
9. Require cache v95, canonical module composition, server readiness, exact
   CORS allow/deny behavior, and missing/invalid session rejection.
10. Perform no production business-record write.

Changing `build_type`, changing environment branch policy, and creating the
trigger ref are production configuration mutations. They are not authorized by
this plan and must be recorded individually in future evidence.

## Immediate rollback contract

At the first material failure or timeout in a future Phase B:

1. Stop the Actions rollout.
2. Change Pages `build_type` back to `legacy`.
3. Restore source `main`, path `/`.
4. Explicitly request a legacy build of
   `86b8b4dd7e9496833a021319167589b49f0ac418`.
5. Require Pages metadata `built`, live index/sw HTTP 200, and cache v79.
6. Reconfirm orchestrator `/health` and `/ready`.
7. Preserve the workflow run, control ref, artifact ref, and configuration
   evidence; do not delete or rewrite them.

No destructive database or application rollback is part of this mechanism.

## Alternatives rejected

- `workflow_dispatch` on a non-default immutable branch: incompatible with the
  documented default-branch requirement.
- Workflow commit on an accepted artifact ref: violates exact-SHA immutability.
- Workflow on `main`: violates the current no-main boundary.
- Another legacy source branch: tested variable space is exhausted.
- Orphan `gh-pages` content commit: changes packaging and history together.
- Railway PWA publication: introduces a new public domain and hosting path.

## Independent review questions

Claude must answer:

1. Is the `workflow_dispatch`/default-branch conflict correctly identified?
2. Does the separate immutable artifact plus push-triggered control branch
   preserve exact application bytes without touching `main`?
3. Is Phase A genuinely non-production and incapable of triggering Pages?
4. Are Phase B configuration ordering and immediate legacy rollback complete?
5. Are workflow permissions, environment policy, concurrency, exact-SHA, and
   full-asset verification gates sufficient?

## Handoff

Next required actor: `Claude`

Decision gate: `AUTO_CONTINUE_ALLOWED`

Next bounded action: independently review this design only. Do not add a
workflow, create a branch, change Pages configuration, or execute a deployment.
If ACCEPT, assign only Phase A non-production workflow implementation to Codex.

