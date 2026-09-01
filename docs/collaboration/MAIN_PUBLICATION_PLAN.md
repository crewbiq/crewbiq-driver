# CrewBIQ Main Publication Plan

Result: MAIN_PUBLICATION_PLAN_READY

Status: DESIGN ONLY - NO MERGE / NO DEPLOY

Prepared: 2026-09-01

Repository: `crewbiq/crewbiq-driver`

## 1. Decision summary

The accepted production commit must NOT be merged or fast-forwarded directly
into `main`.

The safest procedure is a curated promotion branch created from the exact
current `main` commit. It will carry accepted product and validation files by
content, not the collaboration branch's 241-commit ancestry. All active
production runtime files must be byte-identical to accepted candidate
`66a7985765b76e0702d015ca1e300390156f8ad6`. One CI-only correction is
mandatory before merge: update the stale PWA workflow cache assertion from
`v94` to the accepted service-worker cache `v95`.

No execution is authorized by this plan.

## 2. Authoritative current state

- `origin/main`: `86b8b4dd7e9496833a021319167589b49f0ac418`.
- Pages API: `build_type=legacy`, source `main`, path `/`, status `built`.
- Latest Pages build: `1187942506`.
- Latest Pages build commit:
  `86b8b4dd7e9496833a021319167589b49f0ac418`.
- Live `index.html`: HTTP 200.
- Live `sw.js`: HTTP 200.
- Live cache: `crewbiq-driver-v79`.
- Accepted candidate:
  `66a7985765b76e0702d015ca1e300390156f8ad6`.
- Accepted candidate cache: `crewbiq-driver-v95`.
- Main branch protection: absent.
- Repository rulesets: none.
- Worktree at discovery: clean.

The lack of branch protection means every gate in this document must be
enforced operationally; GitHub will not prevent an early merge.

## 3. Why main serves and non-main publication did not

The exact internal GitHub Pages cause remains unavailable through repository
APIs. What is proven is:

1. The live site is configured to publish the root of `main` through legacy
   Pages.
2. The latest successful serving build reports the exact current `main` SHA.
3. Two non-main legacy sources and one Actions artifact deployment all
   reported success but served every required asset as HTTP 404.
4. Restoring legacy `main:/` restored the site each time.
5. GitHub's documentation says changes pushed to the configured source branch
   are published automatically and can take up to ten minutes.

Therefore the plan does not claim an unsupported root cause. It uses the one
publication path proven to activate this project site: a normal human-created
merge/push to configured source branch `main`.

References:

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/rest/pages/pages

## 4. Ancestry and divergence

- Merge base: `86b8b4dd7e9496833a021319167589b49f0ac418`.
- `main` is an ancestor of accepted candidate `66a7985`.
- Accepted candidate is not an ancestor of `main`.
- Left/right count for `main...candidate`: `0 / 241`.
- Main-only commits: none.
- Candidate-only commits: 241.
- `git merge-tree --write-tree main candidate`: clean, exit 0.

A direct merge is technically conflict-free and would normally be a
fast-forward. It is operationally rejected because it would place all 241
collaboration commits and their complete documentation/prototype history on
`main`.

## 5. Complete main-to-candidate diff

Total: 77 files, 13,631 insertions, 592 deletions.

### Workflow and package

- `M .github/workflows/pwa-auth-contract.yml`
- `M package.json`

### Product/runtime modules

- `A account-driver-link.js`
- `A analytics.js`
- `M core-runtime.js`
- `A driver-self.js`
- `A driver-truck-assignment.js`
- `M index.html`
- `A links.js`
- `M loads.js`
- `A navigation-model.js`
- `M pti.js`
- `A startup-session.js`
- `M sw.js`
- `A workspace-attribution.js`
- `A workspace-driver-roster.js`

`core.js` and `manifest.json` are unchanged between main and candidate.
`analytics.js` is accepted product code but is not loaded by the current
production `index.html` and is not in `APP_SHELL`.

### Validation files

- `M sidr-contract-resolver-integration-v1.test.mjs`
- `A tests/account-driver-link.test.mjs`
- `A tests/analytics.test.mjs`
- `A tests/auth-session-startup-contract.test.mjs`
- `A tests/charts-prototype.test.mjs`
- `A tests/driver-self-ui.test.mjs`
- `A tests/driver-truck-assignment.test.mjs`
- `M tests/e2e/staging-fleet-integrity.spec.mjs`
- `A tests/e2e/staging-load-lifecycle.spec.mjs`
- `M tests/e2e/staging-pti-lifecycle.spec.mjs`
- `M tests/e2e/support/staging-api.mjs`
- `A tests/e2e/ui-shell-standalone.spec.mjs`
- `A tests/first-truck-fallback.test.mjs`
- `A tests/hotfix-load-order-contract.test.mjs`
- `A tests/index-startup-composition.test.mjs`
- `A tests/links-contract.test.mjs`
- `A tests/links-url-safety.test.mjs`
- `A tests/load-driver-attribution.test.mjs`
- `A tests/load-truck-attribution.test.mjs`
- `A tests/navigation-contract.test.mjs`
- `M tests/navigation_shell.test.mjs`
- `A tests/pti-attribution-context.test.mjs`
- `A tests/startup-session-coordinator.test.mjs`
- `A tests/ui-shell-prototype.test.mjs`
- `A tests/workspace-attribution.test.mjs`
- `A tests/workspace-driver-roster.test.mjs`

### Prototype files

- `A prototype/crewbiq-next/app.js`
- `A prototype/crewbiq-next/charts.js`
- `A prototype/crewbiq-next/crewbiq-next-standalone.html`
- `A prototype/crewbiq-next/index.html`
- `A prototype/crewbiq-next/styles.css`

### Collaboration documentation

- `A docs/collaboration/ACCOUNT_DRIVER_LINK_API_CONTRACT.md`
- `A docs/collaboration/ANALYTICS_ENGINE_CONTRACT.md`
- `A docs/collaboration/ANALYTICS_SCOPE_CONTRACT.md`
- `A docs/collaboration/ARCHITECTURE.md`
- `A docs/collaboration/AUTH_SESSION_STARTUP_CONTRACT.md`
- `A docs/collaboration/CLAUDE_REVIEW.md`
- `A docs/collaboration/COLLABORATION_STATE.md`
- `A docs/collaboration/CURRENT_STATUS.md`
- `A docs/collaboration/DECISIONS.md`
- `A docs/collaboration/DRIVER_SELF_UI_DISCOVERY.md`
- `A docs/collaboration/DRIVER_TRUCK_ASSIGNMENT_DISCOVERY.md`
- `A docs/collaboration/FUNCTIONAL_AUDIT.md`
- `A docs/collaboration/HANDOFF.md`
- `A docs/collaboration/HOTFIX_LOAD_ORDER_CONTRACT.md`
- `A docs/collaboration/IDENTITY_ATTRIBUTION_CONTRACT.md`
- `A docs/collaboration/LINKS_CONTRACT.md`
- `A docs/collaboration/NAVIGATION_CONTRACT.md`
- `A docs/collaboration/NORMALIZED_RECORD_ID_CONTRACT.md`
- `A docs/collaboration/PRODUCTION_DEPLOYMENT_READINESS.md`
- `A docs/collaboration/PRODUCTION_UI_INTEGRATION_CONTRACT.md`
- `A docs/collaboration/README.md`
- `A docs/collaboration/STAGING_VALIDATION_EVIDENCE.md`
- `A docs/collaboration/UI_SHELL_PROTOTYPE.md`
- `A docs/collaboration/WORK_LOG.md`

### Product documentation

- `A docs/product/DEPRECATED_DECISIONS.md`
- `A docs/product/DOCUMENTATION_AUTHORITY.md`
- `A docs/product/FEATURE_REGISTRY.md`
- `A docs/product/LEGACY_ARTIFACT_MATRIX.md`
- `A docs/product/PRODUCT_CONTRACT.md`
- `A docs/product/ROADMAP.md`

## 6. Curated main-promotion content

The future promotion branch must start from the exact current `main` SHA and
must not be branched from the collaboration branch or candidate SHA.

### Product files to restore byte-for-byte from accepted candidate

- `account-driver-link.js`
- `analytics.js`
- `core-runtime.js`
- `driver-self.js`
- `driver-truck-assignment.js`
- `index.html`
- `links.js`
- `loads.js`
- `navigation-model.js`
- `pti.js`
- `startup-session.js`
- `sw.js`
- `workspace-attribution.js`
- `workspace-driver-roster.js`

The active production composition is the 13-file subset above excluding
unloaded `analytics.js`. Each active file must have the same Git blob ID as
candidate `66a7985` before merge.

### Validation files to restore from candidate

- `.github/workflows/pwa-auth-contract.yml`
- `package.json`
- `sidr-contract-resolver-integration-v1.test.mjs`
- Every validation file listed in section 5 except the three prototype-only
  tests:
  `tests/charts-prototype.test.mjs`,
  `tests/e2e/ui-shell-standalone.spec.mjs`, and
  `tests/ui-shell-prototype.test.mjs`.

### Files explicitly excluded

- All `docs/collaboration/**` files.
- All `docs/product/**` files.
- All `prototype/crewbiq-next/**` files.
- The three prototype-only tests named above.
- Any file not present in this section's allowlist.

This keeps collaboration chronology, audit history, and the read-only visual
prototype out of `main` while retaining accepted product code and durable
regression coverage.

## 7. Mandatory CI-only correction

Candidate `sw.js` declares `crewbiq-driver-v95`, but candidate
`.github/workflows/pwa-auth-contract.yml` still contains:

`grep -q "crewbiq-driver-v94" sw.js`

An uncorrected promotion PR is guaranteed to fail PWA Auth Contract. On the
future promotion branch, change exactly that assertion to `v95`. This is the
only planned non-candidate byte in the curated content.

Before merge, assert:

1. The workflow diff versus candidate contains only `v94 -> v95`.
2. No runtime file differs from candidate.
3. The workflow and cache assertion agree on `v95`.

## 8. Exact future preparation procedure

This procedure is NOT authorized for execution yet.

1. Fetch `origin/main` and candidate refs.
2. Abort unless `origin/main` remains exactly
   `86b8b4dd7e9496833a021319167589b49f0ac418`.
3. Create a new release branch from that exact main SHA using a normal branch
   creation; never force-push or rewrite it.
4. Restore only the section 6 allowlist from candidate `66a7985`.
5. Apply only the section 7 `v94 -> v95` CI correction.
6. Require `git diff --check` clean.
7. Require the changed-file set to equal the allowlist exactly.
8. Require every active runtime file's blob ID to equal candidate `66a7985`.
9. Require no `docs/**` or `prototype/**` path in the promotion diff.
10. Commit the curated change as one normal promotion commit.
11. Push the new release branch normally.
12. Open a PR to `main`; do not merge it.
13. Obtain an independent Claude review of the actual PR diff and CI results.
14. Obtain explicit coordinator authorization for the exact PR/commit.
15. Re-fetch `main` immediately before merge; abort on any movement.
16. Merge through a normal PR merge commit to create an explicit rollback
    boundary. Do not squash, rebase, force-push, or reset `main`.

## 9. Required pre-merge CI

No CI was run during this design-only slice because no promotion branch or
code change was created.

The future PR must require all of the following green:

1. `PWA Auth Contract`, including corrected cache v95 assertion.
2. `E2E PR Smoke`:
   - `npm ci`
   - `npm run test:e2e:tooling`
   - `npm run test:e2e:self`
   - fail-closed parse of `npm run test:e2e:staging`
   - evidence-policy checks
   - `git diff --check`
3. The complete accepted narrow runtime contract set for startup, links,
   navigation, workspace attribution, roster, DriverTruckAssignment,
   AccountDriverLink, Driver SELF, Load truck/driver attribution, PTI
   attribution/graceful degradation, transport/restore/offline, and service
   worker path/cache behavior.
4. Static inline-script parse/startup-composition smoke.
5. Exact changed-file and candidate-blob allowlist checks.

Because `main` has no branch protection or rulesets, green status must be
checked manually and recorded before merge authorization.

## 10. Expected publication behavior

After an authorized human merges the PR:

1. The merge commit becomes the new `main` tip.
2. Legacy Pages observes a change on configured source `main:/` and starts a
   Pages build/deployment.
3. Publication may take up to ten minutes according to GitHub documentation.
4. The Pages API latest-build record must reach `built` with no error and its
   `commit` must equal the exact merge commit, not candidate `66a7985`.
5. The project site must then serve the accepted runtime bytes from that merge
   tree.

The served commit cannot literally be `66a7985`, because direct promotion of
that commit is intentionally rejected. Exactness is proven by combining the
Pages build commit with byte/hash equality for the curated runtime files.

## 11. Cache and service-worker gates

- Pre-promotion live cache: `crewbiq-driver-v79`.
- Promoted cache: `crewbiq-driver-v95`.
- `sw.js` bytes change, so installed clients can detect a new worker.
- Install caches the complete v95 `APP_SHELL`.
- Activate deletes caches whose key is not v95 and calls `clients.claim()`.

Required validation:

1. Fresh browser loads the v95 shell.
2. Existing installed/controlled client detects and activates v95.
3. Every v95 `APP_SHELL` URL returns HTTP 200 before offline smoke.
4. Offline restart works after v95 activation.
5. No required module is served from stale v79 cache.

## 12. Exact post-publication verification

Poll for no more than ten minutes:

1. `GET /repos/crewbiq/crewbiq-driver/pages` remains
   `build_type=legacy`, source `main:/`, status `built`.
2. `GET /repos/crewbiq/crewbiq-driver/pages/builds/latest` reports the exact
   main merge commit and no error.
3. Every `APP_SHELL` URL returns HTTP 200.
4. Downloaded bytes for every curated product file hash exactly to the
   corresponding Git object in the authorized promotion merge tree.
5. The 13 active changed runtime files also match candidate `66a7985` exactly.
6. Live `sw.js` declares `crewbiq-driver-v95`.
7. Startup/auth/restore, workspace isolation, roster, assignments, Load, PTI,
   Driver SELF, graceful degradation, and offline restore smoke are green.
8. No cross-workspace or cross-tenant leakage is observed.

At the first material failure, stop smoke and execute rollback only.

## 13. Rollback to stable main/v79

Do not reset, force-push, or repoint Pages to a non-main branch.

1. Record the failed merge SHA and Pages build state.
2. Create a rollback branch from the failed current `main`.
3. Revert the promotion merge using a normal revert commit with the correct
   mainline parent.
4. Open/merge the bounded rollback PR, or use the pre-authorized emergency
   normal revert path if separately approved.
5. Require the resulting tree's production files to equal stable main
   `86b8b4d` and `sw.js` to declare v79.
6. Wait for the legacy Pages build to report `built` at the revert commit.
7. Require live `index.html` and `sw.js` HTTP 200 and live cache v79.
8. Verify v79 installed-client recovery and orchestrator health/readiness.

The rollback SHA will be a new revert commit; stable content equality is
verified against `86b8b4d`.

## 14. Readiness gates and stop conditions

The plan is READY for independent review, not execution.

Stop before merge if any condition is true:

- `main` moved from `86b8b4d`.
- The promotion diff contains a path outside the curated allowlist.
- Any active runtime blob differs from candidate `66a7985`.
- The cache assertion is not exactly v95.
- Any required CI/check is missing, skipped, or red.
- Claude has not accepted the actual promotion PR.
- Exact coordinator merge authorization is absent.
- Pages configuration is no longer legacy `main:/`.
- Production health/readiness is not green.

## 15. Parallel external and queued work

- GitHub Community Discussion `#206480` remains open and may be monitored.
- It does not block independent review of this plan.
- `CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remains queued as a coverage task.
- No alternate-hosting redesign is part of this plan.

## 16. Preparation-through-PR execution evidence

Execution date: 2026-09-01

Status: PREPARED / NOT MERGED / NOT DEPLOYED

- Standing Product Owner delegation used for bounded preparation-through-PR.
- Promotion branch: `release-main-promotion-v95-66a7985`.
- Branch base: exact stable main
  `86b8b4dd7e9496833a021319167589b49f0ac418`.
- Promotion commit: `e6ea4418a303d24219bc0469c3aa1c36167c6c56`.
- Pull request: `https://github.com/crewbiq/crewbiq-driver/pull/101`.
- Changed-file allowlist: exactly 39 files.
- All 14 product-file Git blobs: exact match to accepted candidate
  `66a7985765b76e0702d015ca1e300390156f8ad6`.
- Paths under `docs/**` or `prototype/**`: none.
- Only workflow delta from candidate: cache assertion `v94 -> v95`.
- `git diff --check`: clean.
- PWA Auth Contract run `33539640742`, job `orchestrator-transport`:
  PASS, 17 seconds.
- E2E PR Smoke run `33539640708`, job `smoke`: PASS, 48 seconds.
- Main merge: NOT PERFORMED.
- Pages configuration/deployment: NOT CHANGED.
- Migration/production-data mutation: NONE.

The PR remains explicitly gated for independent Claude review and separate
coordinator authorization before any merge.
## Production publication execution evidence - 2026-09-01

Result: `PRODUCTION_VALIDATION_PASS`

- PR `#101` was merged by a normal merge commit. No squash, rebase, force-push, or branch-history rewrite was used.
- Production `main` publication commit: `bcfd74a22449b974755b8b48bc01a3b261107b93`.
- GitHub Pages run: `33542396944`; build ID: `1188354332`; authoritative final status: `built`; published commit: `bcfd74a22449b974755b8b48bc01a3b261107b93`.
- Post-merge PWA Auth Contract run: `33542397641`; result: `success` at the exact publication commit.
- Pages remained configured as legacy publication from `main:/` with HTTPS enforced.
- All 13 active runtime assets returned HTTP `200` and their downloaded Git blob IDs matched the publication commit exactly: `account-driver-link.js`, `core-runtime.js`, `driver-self.js`, `driver-truck-assignment.js`, `index.html`, `links.js`, `loads.js`, `navigation-model.js`, `pti.js`, `startup-session.js`, `sw.js`, `workspace-attribution.js`, and `workspace-driver-roster.js`.
- The live service worker declares cache `crewbiq-driver-v95`.
- Production orchestrator deployment `87f7d41a-b677-4f05-a09e-4fc2b9fa7702` remained `SUCCESS` and `RUNNING` in Railway production.
- Production `/health` returned `ok=true`, `env=production`, and `secret_configured=true`.
- Production `/ready` returned `ok=true`, database configured/connected, and `missing_migrations=[]` for required migrations 010 and 011.
- Unauthenticated Driver roster, AccountDriverLink, DriverTruckAssignment read/write, restore, and sync probes all returned `401`; no anonymous workspace data or mutation was possible.
- Browser smoke returned HTTP `200`, loaded `CrewBIQ Driver` without page errors, acquired a controlling service worker, observed only cache `crewbiq-driver-v95`, and reloaded successfully offline with HTTP `200` and intact shell content.
- An initial ad-hoc offline probe attempted an offline reload before the first navigation was service-worker-controlled and therefore returned Chromium `ERR_FAILED`. The corrected lifecycle probe first waited for activation and an online controlled reload; it then passed. This was a smoke-harness sequencing issue, not an application failure.
- No production database record was created, changed, or deleted. No migration ran. Rollback was not required.
- Rollback remains a normal revert of merge commit `bcfd74a22449b974755b8b48bc01a3b261107b93`, followed by exact Pages build/SHA and live cache verification; force-push/reset are prohibited.

Remaining non-blocking coverage gap: `CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED`.
