# GitHub Pages Publication Incident Package

Status: DRAFT FOR INDEPENDENT REVIEW - NOT SUBMITTED

Submission status: SUBMITTED TO GITHUB SUPPORT

Ticket: `#4718739`

Ticket URL: `https://support.github.com/ticket/personal/0/4718739`

Submitted from account: `crewbiq`

GitHub authoritative status after submission: `closed`

Repository: `crewbiq/crewbiq-driver`

Production project site: `https://crewbiq.github.io/crewbiq-driver/`

Incident date: 2026-09-01

## Summary

GitHub reports successful Pages builds/deployments, but the production project
site returns HTTP 404 for every required static application asset whenever the
accepted PWA artifact is published by any tested non-`main` mechanism. The
same repository immediately serves normally again after restoring the legacy
Pages source to `main`.

The behavior reproduced with three structurally distinct mechanisms:

1. Legacy source branch `agent/production-release-20260901-v95`.
2. Legacy source branch `production-v95-66a7985`.
3. Actions artifact deployment from `pages-actions-v95-66a7985`.

The accepted artifact was unchanged in all controlled attempts:
`66a7985765b76e0702d015ca1e300390156f8ad6`, cache
`crewbiq-driver-v95`.

## Expected behavior

After GitHub reports a successful Pages build/deployment, the project-site
root and all 13 required app-shell assets should return HTTP 200 and match the
Git blobs at the accepted artifact SHA.

## Actual behavior

GitHub reported `built` or Actions deployment `success`, but all required
assets returned HTTP 404 throughout the complete observation windows:

- `index.html`
- `sw.js`
- `core.js`
- `core-runtime.js`
- `startup-session.js`
- `workspace-attribution.js`
- `workspace-driver-roster.js`
- `driver-truck-assignment.js`
- `account-driver-link.js`
- `driver-self.js`
- `loads.js`
- `pti.js`
- `manifest.json`

Exact-hash validation could not begin because no required asset was served.

## Controlled attempts

### Legacy source, slash-containing branch

- Source: `agent/production-release-20260901-v95`, path `/`.
- Exact SHA: `66a7985765b76e0702d015ca1e300390156f8ad6`.
- GitHub reported the legacy build as `built` twice.
- The second attempt polled all 13 assets for ten minutes.
- Every asset remained HTTP 404.
- Restoring legacy `main` restored the site immediately.

### Legacy source, slash-free branch

- Source: `production-v95-66a7985`, path `/`.
- Exact SHA: `66a7985765b76e0702d015ca1e300390156f8ad6`.
- Only branch-name shape changed relative to the prior legacy attempt.
- GitHub reported the build as `built`.
- All 13 assets remained HTTP 404 for ten minutes.
- Restoring legacy `main` restored the site immediately.
- This falsified the slash-containing-name hypothesis.

### GitHub Actions Pages deployment

- Reviewed workflow commit: `f19f05129fee94004505fc321fcef925e5cd4d99`.
- Control branch: `pages-actions-v95-66a7985`.
- Artifact checkout: `66a7985765b76e0702d015ca1e300390156f8ad6`.
- Run: `33515902286`.
- URL: `https://github.com/crewbiq/crewbiq-driver/actions/runs/33515902286`.
- Created: `2026-09-01T13:51:10Z`.
- Completed: `2026-09-01T13:51:32Z`.
- GitHub conclusion: `success`; deploy job: `completed/success`.
- Observation window: about `2026-09-01T13:51:42Z` through
  `2026-09-01T14:01:23Z`.
- All 13 assets remained HTTP 404.
- Automatic rollback restored `build_type=legacy`, source `main`, path `/`.

## Variables ruled out

- Missing app-shell files: serving and accepted trees contain the files.
- Artifact differences: the same accepted SHA was used.
- Slash-containing branch names: slash-free failed identically.
- Short CDN delay: complete ten-minute windows failed.
- Legacy publication mechanism: Actions failed identically.
- Deployment branch allow-list: tested refs were explicitly allowed.
- `.nojekyll`: absent equally from serving and failing trees.
- Workflow failure: run `33515902286` and deploy job succeeded.

## Current safe state

- Pages `build_type`: `legacy`.
- Pages source: `main`, path `/`.
- Serving commit: `86b8b4dd7e9496833a021319167589b49f0ac418`.
- Live cache: `crewbiq-driver-v79`.
- Live `index.html` and `sw.js`: HTTP 200.
- Orchestrator health/readiness: green; missing migrations: none.
- No production business-record write, merge, or force-push occurred.

## Requested GitHub investigation

Please investigate why this project site reports successful builds or
deployments while serving HTTP 404 for the complete artifact whenever the
artifact is not the existing legacy `main` publication. Please check
repository/project-site binding, artifact activation, edge/CDN routing, and
server-side Pages state not exposed through the repository Pages API.

## Operational boundary

Production is stable on legacy `main/v79`. Do not change the Pages source or
attempt another publication while this incident remains unresolved. This is
an evidence package only; it does not authorize ticket submission, deployment,
configuration mutation, migration, merge, or production-data write.

## Evidence references

- Phase A implementation: `f19f05129fee94004505fc321fcef925e5cd4d99`.
- Phase A ACCEPT: `f5cd4dbdbb6996943ad26cea63b787eab0dc963a`.
- Phase B evidence: `b44feee7231489dde13a3a7d2842f4f4faea7555`.
- Phase B review: `78e140b13db0b8d55a70e2137386cfc6178352f1`.
- State repair: `31b7e798cee4d570b677fa2a28076df130266a9d`.
- Stable-state decision: `2a39e01`.
- Detailed records: `PRODUCTION_PWA_PUBLICATION_CORRECTION_PLAN.md`,
  `PRODUCTION_PWA_ACTIONS_DEPLOYMENT_CORRECTION_PLAN.md`, and
  `CLAUDE_REVIEW.md`.

## Submission record

On 2026-09-01, after explicit action-time Product Owner confirmation, the
accepted package was submitted through the authenticated GitHub Support
Repositories form. The selected issue type was bugs/problems/API rate limits,
Actions workflow problems, and GitHub migrations. No CC, attachment,
credential, customer record, or private production data was included. GitHub
confirmed successful submission and listed ticket `#4718739` as `open` for
account `crewbiq`.

### GitHub Support disposition

Within approximately ten minutes, GitHub Support automatically closed ticket
`#4718739`. The response states that the support resources available to the
current account are self-service only and directs the account to GitHub
Community Discussions, GitHub Docs, and GitHub Skills. The ticket UI does not
permit reopening/commenting. No GitHub-side Pages investigation or technical
root-cause finding was provided.
