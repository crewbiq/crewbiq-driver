# Driver A staging adapter: implementation and disposable evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Scope: implementation/test gates only. NOT staging acceptance or permission to execute.

## Exact references

- Design: `7e1eccc215309a3e326a1bb6a93e799449b36159`.
- Independent design acceptance: `d1bbbcbbc268de6792b78ef7bfc97b53ab791f29`.
- Bounded implementation authorization: `c9a298f0901f338e193dffead38ebaa843cc5164`, followed by explicit Product Owner implementation/test approval in this task.
- Orchestrator implementation: `d1c13cdfefe2f6db6644f72363f365863fceab0c`.
- Orchestrator branch: `agent/account-driver-link-read`.
- Prior independently accepted local proof: `15f28b19ae017dc5e6e42f83701648f0e63996be`.

Changed orchestrator files only:

- `app/testing/driver_a_fixture_guards.py`: shared existing subject/authority/protected-fixture validators.
- `app/testing/driver_a_fixture_link.py`: consumes extracted validators; retains its local-only connection boundary and behavior.
- `app/testing/driver_a_staging_fixture_link.py`: bounded adapter and durable receipt journal.
- `tests/test_driver_a_staging_fixture_link.py`: fake metadata and pure tests.
- `tests/test_driver_a_staging_fixture_link_postgres.py`: disposable PostgreSQL adapter tests.

No runtime route, auth implementation, migration, schema source, broad provisioning,
workflow, package, production or staging configuration changed.

## Implemented controls

The adapter has no CLI, default credentials or enabled live Railway provider.
`RailwayAuthority` is an explicit trusted integration protocol, not a user-data
or HTTP request boundary. Tests supply fake normalized Railway metadata and
credentials; they do NOT prove a live GraphQL/CLI provider's authenticity or
compatibility. A real provider must be separately wired, independently reviewed
and authorized before any real staging read-only preflight.

The adapter validates fixed project/environment/service IDs and relationships,
database/schema, endpoint shape, source reference and a maximum 60-second
attestation age. It checks credential/source binding, obtains a fresh snapshot
for each operation, verifies database/schema after connection, and uses normal
certificate/hostname-verifying TLS with no insecure or arbitrary-DSN option.
Actual staging TLS/endpoint compatibility has NOT been tested here.

Schema validation uses a supplied reviewed catalog fingerprint, verified
constraint state, enabled original integrity triggers and migration 011 recorded
once. Tests derive the expected fingerprint from already migrated disposable
PostgreSQL; a production-usable reviewed manifest remains part of later evidence.
The PostgreSQL internal char field `tgenabled` is explicitly cast to text. The
initial failing run exposed bytes/string handling; this was corrected with user
approval without permitting disabled triggers.

Read-only preflight uses repeatable-read and reserves nothing. Apply requires
an unexpired approval bound to implementation revision, contract, exact target,
reserved link ID, schema fingerprint and protected fixture snapshot. It uses
serializable isolation, migration 011's advisory lock, existing exact-row guards,
one INSERT/RETURNING, full intended-field comparison and protected-row rechecks.
Any account history/UUID conflict aborts; there is no upsert or automatic retry.

The local append-only journal flushes/fsyncs the original intent before COMMIT.
Lost commit responses produce UNKNOWN, not a retry. Reconciliation re-attests
and reads only, comparing the exact original row/T and protected digest. It
reports ALREADY_APPLIED or NOT_APPLIED_AT_OBSERVATION without inserting again.
Caller-provided artifact revision/approval and journal storage are trusted
operator inputs; these tests are not a cryptographic approval or filesystem
tamper-resistance proof.

Rollback assessment needs separate explicit approval. It reconciles the exact
row but returns ROLLBACK_BLOCKED_UNPROVEN_USE while downstream/read-only use
cannot be established absent. No remote DELETE operation or blanket use-proof
flag is implemented. No whole-database digest/table lock is used by the staging
adapter. Tests alone use the accepted local hash helper to check collateral
fixture writes in isolated databases.

## Disposable environments

- Existing local fixture DB: `127.0.0.1:52037/crewbiq_fixture_local`.
- Separate adapter DB: `127.0.0.1:57624/railway`.
- Adapter container: `crewbiq-staging-adapter-local-20260904`.
- Container ID: `c835cad8d8a5965c20d02e049d157e935146337742f1b95be4c07478655914eb`.
- Image: `postgres:16-alpine`.

Both databases had real repository migrations applied during earlier authorized
disposable preparation. After the latest no-migration authorization, read-only
checks found `pending=[]` in each database before rerunning tests. No new SQL
migration execution was needed; existing runners saw already-applied state.
Fixture resets/guard corruption tests were confined to these disposable DBs.

Fake target host `fixture-staging.example.test` never received a network request:
test interception routed adapter connections solely to the explicit loopback
DSN. Synthetic artifact/provenance SHAs in tests are not staging evidence.

## Exact commands and results

`DATABASE_URL` was empty and `CREWBIQ_DB_ENABLED=false`.
`CREWBIQ_TEST_DATABASE_URL` and `CREWBIQ_FIXTURE_LOCAL_DATABASE_URL` targeted
the existing local fixture database; `CREWBIQ_STAGING_ADAPTER_TEST_DATABASE_URL`
targeted only the separate local adapter database. Credentials are omitted.

```text
python -m pytest -q --tb=short tests/test_driver_a_staging_fixture_link.py tests/test_driver_a_staging_fixture_link_postgres.py tests/test_driver_a_fixture_link_postgres.py tests/test_account_driver_links_postgres.py
65 passed in 36.23s

python -m pytest -q --tb=short
463 passed in 55.27s
```

The targeted run includes 22 fake-metadata/pure adapter tests, 16 real-PostgreSQL
adapter scenarios, all 26 accepted local fixture tests and the existing
AccountDriverLink constraint test. Full backend regressions passed with no failures.

Coverage includes wrong project/environment/service and relationships, invalid
endpoint/database/schema, stale/future metadata, credential binding, expired or
mismatched approval, protected/schema drift, disabled triggers, any-history/UUID
conflicts, competing writers (one winner), exact read-only rerun with unchanged
xmin, lost responses before/after COMMIT, receipt/protected-row drift, and
rollback refusal without use proof. Original local guard coverage remains green.

## Handoff and remaining gates

Next required actor: Claude.
Independently review the exact implementation, shared-guard fidelity, source
trust boundary, concurrency and receipt semantics, and limits of the proof.
Reproduce local tests; do not connect to staging as part of this review.

Real provider wiring/attestation evidence is not demonstrated. A real staging
read-only preflight requires separate authorization. The one guarded Driver A
insert requires another separate authorization after accepted preflight evidence.
`CANONICAL_DRIVER_A_ACCOUNT_LINK_MISSING` remains. Release readiness remains
NOT_READY_FOR_PRODUCTION; no staging write, deployment or production mutation.

Keep second-Driver/cross-workspace fixtures, IA-3 harness compatibility,
authenticated browser/mobile/offline and CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED
queued. Continue toward IA-3 acceptance, not SIDR/Dispatch/Safety/Truckpedia or
unrelated work.
