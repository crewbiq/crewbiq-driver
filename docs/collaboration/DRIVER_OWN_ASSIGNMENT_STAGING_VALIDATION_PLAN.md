# Driver own-current integration: staging validation plan

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Execution readiness: BLOCKED
Release readiness: NOT_READY_FOR_PRODUCTION
Scope: read-only discovery and documentation; not staging execution authority.

## Accepted inputs

- Orchestrator: `ce5a591a48f1733b4e21128dece0e0350ace41c2`, branch `agent/account-driver-link-read`.
- PWA: `c0ec7d884f59f4eca91fee311a8b11cbfa98f628`, branch `agent/pre-base44-audit`.
- Independent implementation review: `ee28bde274a6d9101adf7b47f0114cf2ac6c93d6`; backend 399/399 and PWA 29/29 independently reproduced.
- Planning authorization: `68878e8f1aeb7e2e42a83126e3d20bcaef77e5d7`.

## Read-only observations, 2026-09-03

Railway CLI status/deployment-list reads and unauthenticated HTTP GETs were
performed. No deployment, configuration, migration or business-data commands
were issued in this discovery step. No account credentials were retrieved.

| Dependency | Observation | Classification |
| --- | --- | --- |
| Orchestrator staging target | Project happy-sparkle `89eb12bf-57ee-4228-a841-4008ef7a0e59`; environment crewbiq-orchestrator-staging `ce5fe955-2a0c-4fba-8d57-571acbf7bded`; service crewbiq-orchestrator `dd23479b-f6b1-48ba-9d7c-27f4e0c01ba2` | READY for target identification |
| Backend health | `https://crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app/health`, HTTP 200 at 19:31:14.0670750Z, env=staging | READY at observation time |
| Backend readiness | Same origin `/ready`, HTTP 200 at 19:31:14.6864795Z; database connected; required migrations 010/011, missing_migrations=[] | PARTIAL: readiness is not a full schema/hash audit |
| Backend deployment | Latest listed SUCCESS `d7ae4afa-ca3b-49f4-a8cc-5595e36627d2`, created 2026-09-01T01:49:38.798Z; commitHash/branch metadata null | BLOCKED: accepted server SHA not proven staged |
| PWA staging target | Project imaginative-flow `d7c3148e-8feb-4ebb-ad1d-21c2b331a6d2`; environment staging `d24c84b0-2bd2-464f-aea8-09469a2cd1ca`; service sublime-learning `bbbb4777-6aa4-4a56-9494-3fd3baa41e47` | READY for target identification |
| PWA cache | `https://crewbiq-driver-staging.up.railway.app/sw.js`, HTTP 200 at 19:31:15.2351134Z; crewbiq-driver-v98 | PARTIAL: cache label alone does not prove served artifact bytes |
| PWA deployment | SUCCESS `a50693f3-95c1-48fd-a5da-78bc439c8a69`, created 19:30:13.542Z; source commit 68878e8f1aeb7e2e42a83126e3d20bcaef77e5d7 on agent/pre-base44-audit | PARTIAL: documentation descendant, not literal accepted implementation SHA |
| Server CI | Actions run 33794891841, completed/success, head ce5a591a48f1733b4e21128dece0e0350ace41c2 | READY for reported CI conclusion, not live authentication proof |
| Synthetic canonical Driver identity | Historical canonical evidence used CBQ-E2E-FLEET-A; current canonical driver-only membership/link/assignment not inspected | BLOCKED for own-only journey |
| Publication without deployment | Historical documentation pushes triggered staging; explicit authorization subsequently permitted disabling only this staging trigger | READY: API confirmed disabled on 2026-09-03T21:10:35.9928466Z |
| New migrations / main merge | Not required by the own-read change; existing staging migrations need read-only confirmation | NOT REQUIRED in this step |

CI reference: https://github.com/crewbiq/crewbiq-orchestrator/actions/runs/33794891841

There are separate `production` and `staging` environments in happy-sparkle
in addition to `crewbiq-orchestrator-staging`. Never resolve this target by
the word staging alone. Use the exact project/environment/service IDs above.
The production environments are explicitly excluded from all proposed checks.

## Publication safety prerequisite and authorized resolution

Documentation pushes are not operationally inert in the observed PWA setup.
Railway metadata associates consecutive documentation commits with new
staging deployments. Do not push this draft or CURRENT updates while that
side effect conflicts with the current NO-DEPLOY instruction.

The requested decision was to permit disabling only the staging PWA automatic deployment
trigger while preserving the running deployment and production settings, or
provide an independently verified publication route that triggers no deployment.
This plan itself does not authorize configuration changes. Do not silently add
watch-path rules, unlink services, change source branches or assume a skip-CI
commit message suppresses Railway deployments.

The Product Owner explicitly approved that narrow disable operation. On
2026-09-03T21:10:35.9928466Z, Codex executed only Railway's
`serviceInstanceAutoDeployUpdate(enabled:false)` for project
`d7c3148e-8feb-4ebb-ad1d-21c2b331a6d2`, environment
`d24c84b0-2bd2-464f-aea8-09469a2cd1ca`, service
`bbbb4777-6aa4-4a56-9494-3fd3baa41e47`.

Authoritative `serviceInstanceAutoDeployStatus` changed from enabled=true
to enabled=false, canEnable=true. The production PWA service's corresponding
state remained enabled=true; no production mutation was sent. Staging's
latest deployment remained `a50693f3-95c1-48fd-a5da-78bc439c8a69`, SUCCESS,
source `68878e8f1aeb7e2e42a83126e3d20bcaef77e5d7`.
No GitHub source disconnect, branch change, runtime deployment or restart
was requested. This clears documentation publication, not staging execution.
The plan now awaits independent Claude review.

Railway's documented control disables automatic deployment on new commits
without requiring repository disconnection:
https://docs.railway.com/deployments/github-autodeploys

## Existing procedures and limits

`STAGING_VALIDATION_EVIDENCE.md` records separate staging resources, migrations
010/011 and an archive-based staging server upload. It establishes a precedent
for staging without merging main, not authority to execute a deployment now.

`CANONICAL_STAGING_JOURNEY_EVIDENCE.md` records protected fixture provenance,
an exact Fleet A AccountDriverLink/assignment pair and runs 33550873310 and
33550974453. Those historical results cannot prove the new driver-only
capability: a Fleet account can pass the broad-capability route instead.
Its prior fixture mutation/rollback procedure is not authorized for reuse here.

The existing manual workflow offers role mission sets and an
app_deployment_commit input. The recorded full protected suite includes
fixture-owned mutations. Do not dispatch it merely because it is called a
staging test: first determine which selected scenarios are strictly read-only.
No workflow promotion, editing, new harness or broad suite dispatch is part
of this plan's current authorization.

## Minimum execution prerequisites, after review and separate authorization

1. Repeat target/health/readiness observations and record UTC times. Read the actual migration ledger and expected objects/hash evidence without running the migration runner. Any unexpected schema gap is a separate blocker, not permission to migrate.
2. Establish exact staged backend source provenance; null commit metadata is insufficient. If the accepted SHA is absent, request a separately bounded staging-only exact-archive deployment. No merge to main is inherently needed. Record archive digest, deployment ID and immutable source SHA.
3. Prove PWA asset bytes match the accepted runtime: index, sw, transport, presentation/context/navigation, SELF, link and assignment modules. A documentation descendant is acceptable only with evidence that every deployed runtime/config asset is identical; do not equate v98 or ancestry with byte equality. If equivalence cannot be proven, staging publication needs its own authorization.
4. Confirm PWA transport targets the exact staging orchestrator, including CORS and cache-first behavior. Never use production to compensate for a missing staging dependency.
5. Locate existing authorized synthetic accounts: canonical driver-only A, second Driver B in the same workspace and another workspace principal. Record redacted Account/workspace/Driver IDs and version-controlled fixture provenance. No role elevation, identity guessing or first-record fallback. Confirm one effective link/assignment for A and a distinct B record.
6. If suitable identities or links are absent, document exact missing fixtures and stop before creation. New synthetic provisioning, roles or relationships require separately bounded authorization. Reusing Fleet A or editing a real profile is not a substitute.
7. Use a fresh isolated browser profile, with explicit read-only checks and request capture. Confirm normal page startup/restore does not cause unauthorized business writes before execution. Authentication session bookkeeping must be disclosed separately from business mutation.

## Bounded proposed check matrix

| Check | Required evidence / pass condition |
| --- | --- |
| Login and restore | Existing authorized synthetic driver-only account; authenticated session and /v1/me identify the intended active membership, with own-current capability and without broad assignment READ/MANAGE; reload preserves scope |
| Own proof chain | AccountDriverLink GET and assignment current GET are 200 for the same proven workspace/Driver; one effective assignment; actual response accepted by PWA SELF and presentation; provenance minimized |
| Cross-driver denial | A requesting B driver_id in same workspace receives 403 with no B records; response does not disclose B details |
| Cross-workspace denial | A requesting unauthorized workspace receives 403; separate browser profiles prevent token contamination; correct independent scope for a multi-membership fixture if one already exists |
| Narrow endpoint boundary | Driver history/as-of GETs denied; truck/temporal/duplicate-driver filters rejected; no POST/command probes against real data |
| No-assignment / denied authority | Use existing synthetic no-link/no-assignment fixture if available; UI degrades without fabricating IDs or applying Driver narrowing; unavailable scenario is not relabeled success |
| Accountless behavior | Isolated unconnected profile retains legacy-compatible navigation and PTI access; inspect/open only, do not submit business records under this plan |
| Service unavailability | Browser-local network blocking only, not stopping the server; SELF unavailable and legacy presentation retained; restore network and refresh recomputes proof |
| Session/workspace switching | Prevent stale resolved Driver projection after key changes; old async completion cannot apply to new account/workspace |
| Desktop/mobile | Record viewport/device, screenshots and visible SELF/role navigation; mobile emulation is not physical-device validation and must be labeled |
| Offline/restore | Warm cache, browser-local offline, reload and reconnect; cache version/controller and session scope remain consistent; no duplicate startup or unintended queued business writes |
| Privacy / legacy traffic | Redacted network log proves only expected staging origins; no cross-tenant data or Google/Apps Script traffic; no tokens/cookies in artifacts |

If a scenario needs a new business record, membership/link change, revocation
or PTI submission, classify NOT_EXECUTED_REQUIRES_MUTATION. Do not invent test
data or mark it PASS. Unit/SQL tests remain supporting evidence, not a
substitute for missing browser journeys. Do not claim all mutation endpoints
were live-tested based on read-only HTTP denial checks.

## Recovery and output

Capture the actual pre-execution deployment IDs, revisions and configuration
before any later authorized rollout. A future failure stops the bounded run;
restore only browser-local network controls, preserve redacted evidence and
do not attempt environment repair. Any application rollback requires its own
authorized staging action and verified prior artifact; never undo additive
schema or delete historical business records as rollback.

Future evidence must include exact served SHA or verified runtime-byte
equivalence, cache/controller, server deployment provenance, account/workspace
scope, timestamps, request paths/statuses, screenshots/network artifacts and
per-scenario PASS/BLOCKED/NOT_EXECUTED. The current output is a blocked plan,
not STAGING_VALIDATION_PASS. CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remains
explicitly queued until its own scope has been executed and reviewed.

Next reviewer after safe publication: Claude. No implementation, merge,
deployment, migration, data cleanup, legacy backfill or IA-4 is authorized.
