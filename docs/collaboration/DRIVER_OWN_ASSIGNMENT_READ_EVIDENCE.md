# Driver own-current-assignment read implementation evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Release readiness: NOT_READY_FOR_PRODUCTION

## Exact references

- Accepted design: driver `1f277ebb4fa5447d210a0d61892cca7e0d07ea71`.
- Independent design acceptance and implementation authorization: driver `c8b5f72a7969ae11b7a464f20673064f321ff444`.
- Orchestrator implementation: `ce5a591a48f1733b4e21128dece0e0350ace41c2`.
- Orchestrator branch: `agent/account-driver-link-read`.
- Implementation parent: `4c85fd41d90ec542b7b1c0c15c9e1ca80ec1dda1`.
- PWA runtime under regression: `c0ec7d884f59f4eca91fee311a8b11cbfa98f628`, unchanged in this slice.

## Changes

Runtime files changed in orchestrator only:

- `app/services/capabilities.py`: separate `canonical.driver_truck_assignment.read_own_current`, granted to driver; broad READ and MANAGE not granted.
- `app/routers/driver_truck_assignments.py`: current-only dispatch after the existing broad-capability authorization fails specifically with capability_required. Workspace/membership errors are not swallowed. Own scope additionally requires driver membership, rejects extra/duplicate query parameters and cannot use truck or temporal filters to hide ambiguity.
- `app/services/driver_self_assignment.py`: one read-only repeatable-read transaction, database transaction timestamp, authenticated Account link proof, mandatory workspace/derived Driver query predicates, temporal/shape/reference validation and minimized provenance.

Tests changed: new `tests/test_driver_self_assignment.py`; one exact capability-list expectation in `tests/test_auth.py`. The new constant is added to that expected list, not replaced by a permissive membership assertion.

No PWA runtime, cache, schema, migration, CI, package or deployment files changed.
No broad role rewrite or AccountDriverLink mutation was introduced.

The helper reads only the authenticated Account's scoped link history and
derived Driver's scoped assignment history inside the server, validates the
rows, then selects current records at one instant. It does not expose history
to the caller. Validating before temporal selection ensures malformed or
orphaned records cannot silently disappear in a filter. Zero current
assignments retain the accepted empty envelope; ambiguous proof fails closed.

Existing session authentication bookkeeping (`auth_sessions.last_seen_at`)
is unchanged. No business-data write exists in the new read helper.

## Executed validation

1. Initial focused backend command: `python -m pytest -q --tb=short tests/test_driver_self_assignment.py tests/test_driver_truck_assignments.py tests/test_account_driver_links.py tests/test_driver_truck_assignment_commands.py`: 74 passed, 1 skipped before local PostgreSQL was available.
2. First full backend run with local PostgreSQL: 397 passed, 2 failed. Failures were the existing auth test's exact capability list and a missing-DATABASE_URL test affected by the runner's explicit DATABASE_URL. Added only the new expected capability; removed the general DATABASE_URL override for the next run. No test_db_phase1 edit and no runtime repair for these failures.
3. Final `python -m pytest -q --tb=short`: **399 passed in 19.09s, zero failures, zero skips**. CREWBIQ_TEST_DATABASE_URL pointed to the disposable local database. DATABASE_URL and CREWBIQ_E2E_VERIFIER_DATABASE_URL were empty; CREWBIQ_DB_ENABLED=false for general app defaults.
4. PWA `node --test tests/driver-truck-assignment.test.mjs tests/driver-self.test.mjs tests/driver-self-ui.test.mjs tests/driver-presentation.test.mjs`: **29 passed, zero failures/skips**.

## PostgreSQL environment and isolation evidence

- Local Docker image: `postgres:16-alpine`.
- Container: `crewbiq-own-read-test-20260903`.
- Container ID: `283403a70457f04286a163b7861861f53b2174b7cb3e0b7d7fd12b773519e8f5`.
- Target: `127.0.0.1:64471`, database `crewbiq_own_read_test`, test user `crewbiq_test`.
- This container was created for these tests, not a production/staging connection.
- Existing real-PostgreSQL assignment/link tests applied repository migrations and mutated their fixtures in this disposable database only. No repository migration file was modified; no production or staging migration was executed.
- The new snapshot test creates a unique `own_read_<uuid>` synthetic schema with the columns needed for the actual helper SQL. It asserts real `repeatable read` and `transaction_read_only=on`, pauses after reading the Account link, revokes that link through a second connection, and proves the first transaction still sees its original active link while the next request rejects the now-revoked link.
- Two synthetic Drivers share a team truck; only the authenticated Driver's assignment is returned. The unique synthetic schema is removed after the test.
- The new snapshot test proves actual SQL/MVCC behavior, not migration constraints by itself. Existing PostgreSQL suites separately exercise migration/trigger constraints in the same full run.
- Container was stopped after the run; no production/staging recovery or cleanup operation was performed.

## Evidence limits and remaining gates

The new endpoint tests exercise missing/invalid/expired/revoked-session labels
through the existing authentication dependency with a controlled rejection;
they do not create live expired production sessions. Other endpoint fixtures
use server-context overrides. The PostgreSQL test exercises the actual helper
against a real database, not a deployed HTTP authentication stack.

The cross-repository wire test feeds the actual endpoint response into the
unchanged PWA assignment normalizer via Node. Driver SELF and presentation
regressions run separately; this is not an authenticated browser journey.

CANONICAL_DRIVER_ASSIGNMENT_READ_NOT_AUTHORIZED now has a candidate server fix,
but is not declared closed before Claude reviews implementation and evidence.
No server deployment occurred. Authenticated browser/mobile/offline integration
and live server/client compatibility remain unexecuted release gates.
CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remains queued, as does deferred
historical attribution reconstruction; no backfill work was performed.

## Handoff

Next required actor: Claude.

Independently review orchestrator `ce5a591a48f1733b4e21128dece0e0350ace41c2`
against the accepted contract and proof matrix. Confirm broad/history/as-of/
command boundaries, cross-principal isolation, snapshot semantics and the
stated evidence limits. Publish ACCEPT or precise NEEDS_FIX before further
work. No deploy, merge, IA-4, migration or production/staging data action.
