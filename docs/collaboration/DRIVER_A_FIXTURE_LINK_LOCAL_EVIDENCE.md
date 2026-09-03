# Driver A fixture link: disposable PostgreSQL evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Date: 2026-09-03 UTC
Scope: local rehearsal only; NOT staging execution readiness or production readiness.

## References

- Accepted fixture contract: `ab41ad4e1e5ab09e0916736e2d7b9d7eda8fef67`.
- Independent contract review: `6c932543f1c5dcd892968d83cbb7849968f26398`.
- Implementation authorization: `92c63837aaf60ae3b194da7788bb792d1a23959e`.
- Orchestrator branch: `agent/account-driver-link-read`.
- Implementation: `15f28b19ae017dc5e6e42f83701648f0e63996be`.
- Changed orchestrator files: `app/testing/driver_a_fixture_link.py`, `tests/test_driver_a_fixture_link_postgres.py`.
- Runtime routes, auth, existing provisioning, schemas and migrations: unchanged.

## Implemented boundary

The standalone utility accepts only an explicit PostgreSQL URL at numeric
loopback `127.0.0.1`, an explicit port and database `crewbiq_fixture_local`,
without query overrides. It verifies the database name after connecting.
It has no runtime route, CLI, environment credential discovery or remote mode.
Loopback URL validation is not independent proof of a remote database's
identity: the evidence here also identifies the newly provisioned local Docker
container. Do not forward a remote database to that endpoint.

The explicit subject, sponsor and reserved link ID are fixed by the contract.
Apply uses serializable isolation, migration 011's advisory-lock namespace,
row locks, canonical membership/role checks, exact Driver/Truck predicates,
the protected Fleet A link and canonical assignment. Conflicting account
history of any status/workspace and UUID collision abort without repair.
Database constraints and triggers remain enabled during utility execution.

Dry-run uses a read-only repeatable-read transaction and reserves nothing.
Apply inserts exactly one link. A rerun requires the original receipt and
matches original row fields/timestamps; it does not refresh timestamps.
Rollback requires a separate explicit approval and the original receipt.
Local-only whole-table digests, excluding the reserved link, detect database
changes; rollback holds table locks and refuses any changed digest. This
deliberately conservative approach is not a general staging rollback design.
No claim is made that database digests can detect a read-only external use.

## Local environment and evidence limits

- Container: `crewbiq-driver-a-link-local-20260903`.
- Container ID: `a66a60ddaef276eaac38c439684fed7a7e5a6a265331ca41d3b580eb466f35ef`.
- Image: `postgres:16-alpine`; Docker server: `29.4.3`.
- Endpoint: `127.0.0.1:52037`; database: `crewbiq_fixture_local`.
- Real repository migrations were applied by the existing migration runner,
  including migration 011; no migration source was modified.
- Fixture resets and deliberately ambiguous assignment seeding happened only
  in this disposable database. The assignment trigger was restored before
  exercising the utility against that deliberately corrupt fixture.
- Tests use an explicitly synthetic provenance object/source SHA. They prove
  exact-object validation, not the actual staging provenance JSON key layout.
  A future staging adapter must use independently established exact provenance
  and verify the authorized Railway project/environment/service, not just a URL.
- No staging account login, DB credential retrieval, staging fixture write,
  production access, migration execution remotely, merge or deployment occurred.

## Commands and results

Both PostgreSQL test URL variables pointed only to the container above;
`DATABASE_URL` was empty and `CREWBIQ_DB_ENABLED=false`.

```text
python -m pytest -q --tb=short tests/test_driver_a_fixture_link_postgres.py
26 passed in 19.26s

python -m pytest -q --tb=short
425 passed in 38.10s
```

The full suite includes existing account-link/assignment PostgreSQL,
fixture, authorization and Driver own-current checks. No tests were weakened.
Earlier runs failed in two new fixture INSERTs, first for ambiguous timestamp
typing and then missing required attribution columns. Both test-data errors
were corrected with explicit user permission; final results above supersede
those failed runs without concealing them.

Covered cases: dry-run zero writes; one-row apply; original Fleet A link and
assignment preservation; exact no-write rerun (including unchanged xmin);
separate rollback approval; changed-row/new-use rollback refusal; concurrent
attempts (one winner, one safe failure); missing/mismatched/inactive account;
membership multiplicity; role drift/additional/future role; workspace, Driver,
Truck and provenance mismatch; missing/ambiguous assignment; UUID collision;
existing account history; rejected remote/ambiguous targets.

## Publication safety

Railway's authoritative read-only queries confirmed PWA staging auto-deploy
disabled. Orchestrator auto-deploy is enabled, but its staging trigger is
`feat/deduction-period-integrity`, not `agent/account-driver-link-read`;
other observed triggers use `main`. No settings were changed. Initial API
authorization failed; after CLI session refresh, the authoritative reads
succeeded before publication.

## Handoff / remaining blockers

Next required actor: Claude.
Review the implementation independently, including guard sufficiency,
concurrency, receipt/rollback limitations and fidelity to the accepted contract.
Do not execute staging writes as part of this review.

`CANONICAL_DRIVER_A_ACCOUNT_LINK_MISSING` remains in staging. Remote target
verification/execution adapter and separately authorized staging execution are
not completed by this local-only proof. Release remains NOT_READY_FOR_PRODUCTION.
Second-Driver/cross-workspace fixtures, IA-3 harness compatibility, browser,
mobile/offline evidence and `CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remain queued.
