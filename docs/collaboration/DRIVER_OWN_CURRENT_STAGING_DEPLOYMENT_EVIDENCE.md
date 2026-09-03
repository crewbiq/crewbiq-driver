# Accepted own-current backend: authorized staging deployment evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Bounded deployment result: PASS
Overall authenticated staging validation: INCOMPLETE
Release readiness: NOT_READY_FOR_PRODUCTION

## Explicit authorizations

Product Owner approved deployment of exact orchestrator SHA
`ce5a591a48f1733b4e21128dece0e0350ace41c2` to staging only, without merge,
migration-runner execution or business-data changes. Preflight discovered
startup schema ensure functions; deployment paused. Product Owner separately
approved those specific additive startup-DDL statements in staging after
schema/unique-index validation. No other DDL or migration was authorized.

Independent mismatch review preceding this operation:
`b405986492fdfea635d224cb967be6f50334fc7a`.

## Target and preflight

- Project happy-sparkle: `89eb12bf-57ee-4228-a841-4008ef7a0e59`.
- Environment crewbiq-orchestrator-staging: `ce5fe955-2a0c-4fba-8d57-571acbf7bded`.
- Backend service: `dd23479b-f6b1-48ba-9d7c-27f4e0c01ba2`.
- Staging Postgres service: `59601072-9820-4404-af50-d47e8f2c335c`.
- Prior backend deployment: `d7ae4afa-ca3b-49f4-a8cc-5595e36627d2`, SUCCESS before rollout; source SHA unavailable in its metadata.
- CI run `33794891841`: completed/success at the exact accepted SHA, reconfirmed before upload.
- Preflight /health and /ready: HTTP 200, env=staging, database connected, missing_migrations=[].

Repository Procfile starts only uvicorn, one worker. Railway service instance
startCommand/buildCommand/preDeployCommand/rootDirectory were null. The
accepted app lifespan calls ensure_deduction_policy_schema and
ensure_service_invoice_schema. These execute additive ALTER TABLE / CREATE
INDEX IF NOT EXISTS statements, not the repository migration runner.

At 2026-09-03T22:24:28.051068Z a read-only repeatable-read database transaction
confirmed all startup-required columns and indexes already existed in
deduction_templates, weekly_deductions and service_logs. Their row counts
were 0 / 0 / 0. Duplicate groups for the proposed service invoice unique index
(owner_crewbiq_id, source_invoice_key), excluding null keys, were zero.
Existing unique index definition matched that predicate.

The application DATABASE_URL uses the staging internal Postgres hostname.
Direct local access failed with DNS gaierror; this was a local connectivity
limitation, not a database failure. A subsequent read-only connection preserved
the application's database credentials/path/query while replacing only the
internal host/port with that exact staging Postgres service's public endpoint.
It confirmed database railway, schema public, search_path "$user", public,
and matching table counts. No credential values were printed or saved in
evidence files. Existing Railway authentication was used; no credentials or
security ownership were changed.

Migration ledger showed 003_effective_dated_deductions.sql,
004_service_invoice_lineage.sql, 010_driver_truck_assignments.sql and
011_account_driver_links.sql applied. An existing duplicate 001_init.sql
ledger row was observed and left unchanged. No migration runner, ledger repair
or historical backfill was executed.

## Exact artifact and deployment

Created a Git archive directly from the accepted immutable SHA, not the mutable
worktree. No runtime file was edited. Extracted source was uploaded with
`railway up <source> --path-as-root --project <exact-project-id>
--environment <exact-staging-id> --service <exact-backend-id> --detach`.
The deployment message carried source SHA and archive digest.

- Git source: `ce5a591a48f1733b4e21128dece0e0350ace41c2`.
- Git tar archive SHA-256: `8f1f9f256f8acfc43073cf90ef51609c22fd02a3c96c2934ef544040f1940d2f`.
- New deployment: `d0f992ce-18cb-47e1-9433-a7d25cf2c8b2`.
- Railway createdAt: `2026-09-03T22:26:21.255Z`.
- Authoritative deployment status: SUCCESS.
- Previous deployment subsequently listed REMOVED as part of normal replacement.

The digest is of the source Git tar, not a claimed digest of Railway's internal
upload bundle or built container image. Artifact provenance is the controlled
exact-SHA extraction/upload chain plus the returned deployment ID; raw upload
does not supply a independently queried Git commitHash field.

## Post-deployment verification

At 2026-09-03T22:27:52Z:

- `/health`: HTTP 200, ok=true, env=staging.
- `/ready`: HTTP 200, ok=true, database connected; 010/011 required, missing_migrations=[].
- `/openapi.json`: 55 served operations versus 55 expected from accepted local app.openapi(). Method/path sets, complete operation definitions and the entire parsed OpenAPI document were equal.
- Raw served OpenAPI SHA-256: `345a98dc50bef5f8f4872a2076d43bebb7c7828b28e92097b64112aa6d8a58b8`.

All HTTP requests targeted
`https://crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app`.
No login, record creation or authenticated domain endpoint was invoked.

At 2026-09-03T22:27:56.005036Z, the repeated read-only schema check found
the same required columns and index names, no missing columns, no duplicate
invoice-key groups, and unchanged 0 / 0 / 0 row counts in the three affected
tables. The startup DDL therefore had no observed additive schema change on
these already-prepared objects. Row counts are scoped evidence, not a claim
of a complete database-wide mutation audit. The migration ledger was not
re-read after deployment; no post-ledger equality claim is made.

## Recovery and remaining gates

No rollback was needed or executed. Prior deployment ID is retained above as
the recovery reference, but its source SHA remains unproven and rollback was
not rehearsed in this slice. Do not execute destructive schema rollback or
silently treat an unverified old source archive as a verified recovery image.

The published API composition discrepancy is resolved by the observed schema
comparison. This does not prove real canonical driver-only authentication,
assignment dispatch, fixture readiness or browser/mobile/offline behavior.
Those checks, canonical harness reconciliation and
CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remain queued.

Production deployment/migrations/data, PWA deployment, merge to main, runtime
changes, fixture provisioning and historical attribution/backfill: NONE.
Next required actor: Claude for independent review of the authorization,
preflight, artifact chain, deployment result and evidence limitations.
