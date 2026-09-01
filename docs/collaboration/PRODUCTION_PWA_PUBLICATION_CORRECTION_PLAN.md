# Production PWA Publication Correction Plan

Date: 2026-09-01

Status: `PUBLISHED / AWAITING CLAUDE REVIEW`

Scope: coordination and design evidence only. This document does not authorize
another GitHub Pages source change, branch creation, production deployment,
runtime edit, merge, migration, or production-data write.

## Current safe state

- Production Pages source is `main`, path `/`.
- Production PWA commit is
  `86b8b4dd7e9496833a021319167589b49f0ac418`.
- Live `index.html` and `sw.js` return HTTP 200; cache v79 is restored.
- Accepted orchestrator commit
  `27e3463220a2022ea1adf074d7131ec69eb32fe5` is live, healthy, and ready.
- Migrations 003, 004, 006, 007, 008, 009, 010, and 011 are applied exactly
  once.
- Failed release evidence branch
  `agent/production-release-20260901-v95` remains at exact accepted SHA
  `66a7985765b76e0702d015ca1e300390156f8ad6`, but is not a Pages source.

## Established evidence

GitHub accepted the slash-containing source branch and twice reported its
legacy Pages build as `built`. The second attempt then returned HTTP 404 for all
13 required app-shell assets throughout a complete ten-minute polling window.
Rollback to `main` rebuilt and restored the prior site immediately.

Read-only tree inspection proves the accepted SHA has `index.html`, `sw.js`,
and `manifest.json` at repository root. Neither accepted SHA nor `main` has a
`.nojekyll` file. The accepted root adds ten canonical runtime/prototype paths
and removes none of the `main` root paths.

Official GitHub documentation supports branch-based Pages publication from
either repository root `/` or `/docs`, and the REST contract represents source
as `branch` plus `path`. The inspected documentation does not state that `/` in
a branch name is invalid. Therefore:

`SLASH_CONTAINING_SOURCE_BRANCH_CAUSED_404` is a plausible but unproven
hypothesis, not an established root cause.

References:

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites
- https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#update-information-about-a-github-pages-site

## Smallest alternative candidate

Candidate branch name:

`production-v95-66a7985`

Candidate target:

`66a7985765b76e0702d015ca1e300390156f8ad6`

This is the smallest controlled A/B test because it changes only one relevant
input: a slash-containing source ref becomes a top-level slash-free source ref.
The commit tree, accepted runtime, cache v95, Pages path `/`, production URL,
CORS origin, server revision, and rollback target remain identical.

The branch is operationally immutable:

- future execution must abort if the ref already exists at any SHA;
- create it by a normal non-force push at the exact accepted SHA;
- verify the remote ref after creation;
- never move, overwrite, reuse, or force-push it.

No branch is created by this design slice.

## Future bounded execution contract

This section is a proposed contract for a later separately authorized attempt.

1. Re-read CURRENT and require an explicit accepted handoff to Codex.
2. Confirm Pages is still `main` `/`, commit `86b8b4d`, live v79.
3. Confirm orchestrator `/health` and `/ready` are green.
4. Confirm snapshot and migration evidence remain recorded; run no migration.
5. Require `production-v95-66a7985` not to exist remotely.
6. Create only that ref at exact SHA `66a7985`; verify it remotely.
7. Switch legacy Pages source to that branch at `/` and request one build.
8. Require build commit `66a7985` and status `built`.
9. Poll the complete 13-file app-shell set for up to ten minutes.
10. Require every asset HTTP 200 and byte-for-byte Git blob equality with
    `66a7985`.
11. Require live cache `crewbiq-driver-v95` and canonical module composition.
12. Recheck server readiness, exact CORS allow/deny behavior, and missing or
    invalid session rejection.
13. Perform no production business-record write.
14. At the first material failure or timeout, restore Pages source to `main`,
    explicitly rebuild `86b8b4d`, and require live index/sw HTTP 200 plus v79.
15. Preserve both release refs as evidence; do not delete or rewrite them.

## Rejected broader alternatives for the first correction

- Reusing `agent/production-release-20260901-v95`: already failed twice.
- Merge to `main`: explicitly outside the accepted no-merge boundary.
- Switching Pages from legacy branch publication to GitHub Actions: requires
  workflow and repository Pages configuration changes and adds more variables.
- Creating an orphan `gh-pages` artifact commit: changes content history and
  packaging rather than isolating branch-name behavior.
- Publishing through the existing Railway PWA service: it has no production
  public domain and would introduce hosting/routing configuration scope.
- Editing runtime files or adding `.nojekyll`: no evidence currently ties
  runtime content or Jekyll exclusion to the branch-specific 404.

## Independent review questions

Claude must answer:

1. Is the slash-containing branch hypothesis technically plausible but still
   correctly classified as unproven?
2. Does the slash-free branch candidate isolate one variable without changing
   the accepted artifact?
3. Is the branch creation guard sufficiently immutable and fail-closed?
4. Are the ten-minute full-asset, exact-hash, and rollback gates sufficient?
5. Is any smaller no-merge mechanism available within the current legacy Pages
   architecture?

## Handoff

Next required actor: `Claude`

Decision gate: `AUTO_CONTINUE_ALLOWED`

Next bounded action: independently review this plan only. Do not perform a
production attempt. If ACCEPT, return one bounded publication authorization
question to the coordinator. If NEEDS FIX, name only concrete design blockers.

