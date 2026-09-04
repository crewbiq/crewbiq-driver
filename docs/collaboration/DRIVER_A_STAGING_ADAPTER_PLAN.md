# Driver A staging fixture adapter: bounded design

Status: PROPOSED / AWAITING CLAUDE REVIEW
Date: 2026-09-03 UTC
Design authorization: `d7e289374dd8d4e90d0058477e0d21d01496060e`.
No staging access, implementation or execution is authorized by this document.

## Accepted basis and remaining gap

- Subject/sponsor contract: `ab41ad4e1e5ab09e0916736e2d7b9d7eda8fef67`.
- Local implementation: orchestrator `15f28b19ae017dc5e6e42f83701648f0e63996be`.
- Independent local acceptance: `5043e8ed640f2887e526674e5c44a47cb7a5c560`.
- Local evidence: `DRIVER_A_FIXTURE_LINK_LOCAL_EVIDENCE.md`.

The accepted local utility cannot be executed against staging unchanged. Its
endpoint restriction is intentionally local-only; its whole-database digest
and rollback table-lock strategy are unsuitable for a shared staging database.
The independent local ACCEPT does not prove staging identity, actual protected
provenance JSON, fixture exclusivity or absence of downstream read-only use.
`CANONICAL_DRIVER_A_ACCOUNT_LINK_MISSING` remains unresolved.

## Fixed target and single permitted data change

| Dimension | Required value |
| --- | --- |
| Repository / branch | crewbiq/crewbiq-orchestrator / agent/account-driver-link-read |
| Railway project | 89eb12bf-57ee-4228-a841-4008ef7a0e59 |
| Railway environment | ce5fe955-2a0c-4fba-8d57-571acbf7bded |
| PostgreSQL service | 59601072-9820-4404-af50-d47e8f2c335c |
| Database / schema | railway / public |
| Workspace | 243289f3-7da8-881d-7773-7dfea2083863 |
| Account / sponsor | CBQ-E2E-DRIVER-A / CBQ-E2E-FLEET-A |
| New link UUID | f6c7e85d-5f8c-4df0-b43b-20d51b7a9301 |
| Explicit Driver | e2e-staging-20260714-fleet-a-driver-active |
| Explicit Truck | e2e-staging-20260714-fleet-a-truck-active |
| Protected Fleet A link | d5f4db9b-e2c8-5a5b-9e5e-9bbce2f67d5f |
| Protected assignment | 8066e9d7-89e4-568c-b01f-b8b6bf817c8d |

The only proposed mutation is the contract's one new AccountDriverLink.
No Account, Person, membership, role, Driver, Truck, assignment, legacy record,
schema or deployment change. The sponsor convention is not an impersonated
login. Execution evidence must identify Codex and the exact approval reference.

## Target attestation before connecting

An eventual read-only preflight must obtain authoritative Railway metadata
for all three fixed IDs, establish their relationship and record the database
service's current endpoint binding. Database credentials must be resolved only
from that exact service/environment through the existing approved mechanism,
kept in memory and redacted from logs, receipts and exceptions.

Do not accept an arbitrary DSN, a caller-supplied `staging=true`, environment
display name, local port forward or database name alone as authority. Reject
endpoint overrides, ambiguous bindings and any production identity. Connect
using the attested endpoint and the repository's verified transport/TLS
convention; do not weaken TLS to make connection succeed. Reconfirm
`current_database()`, schema and required migration state after connecting.
These PostgreSQL values corroborate, but do not replace, Railway attestation.

Exact public/private endpoint and TLS details are intentionally not invented
here. Determine them in a separately authorized read-only target preflight. If
they cannot be unambiguously bound to the fixed service, stop before writes.
Attestation must be fresh for apply, not reused indefinitely from planning.

## Procedure interface and implementation boundary

Propose a standalone testing adapter, not an HTTP route or app startup hook.
Keep the accepted `LocalFixtureLink` loopback-only public boundary intact.
Reuse its subject/authority/protected-row validators through a narrow shared
helper extraction if needed; do not duplicate them with weaker staging checks.
The shared validator must not open connections, discover credentials, migrate,
commit, retry or grant target authorization.

Separate operations: read-only preflight, explicitly approved apply, exact
receipt-based no-write rerun, and separately approved rollback assessment.
Apply must require an approval bound to the reviewed implementation SHA,
attested target, reserved UUID, contract and protected snapshot digest. A dry
run result is evidence, not execution authorization. No default remote mode.

Potential implementation files are a dedicated adapter and targeted tests,
plus only the small testing-helper extraction required for validator reuse.
An exact allowlist must be established at implementation authorization. Runtime
routes/auth, the broad provisioning utility and migration files stay untouched.

## Read-only preflight

1. Verify target attestation and real migration 011 objects/constraints/triggers;
   absence or disabled enforcement aborts, never invokes migrations.
2. Validate exact Account, active Person, default driver-only membership,
   current role, active workspace/owner and Fleet sponsor chain.
3. Validate the exact active Driver/Truck IDs, names, owner and stored fixture
   truck linkage. No identity inference or first-row fallback.
4. Require exactly one current non-revoked assignment with the accepted UUID,
   Driver, Truck, workspace, interval, type and protected marker. Establish
   actual provenance JSON and source commit from authoritative fixture evidence;
   the local test's synthetic source SHA is not acceptable staging evidence.
5. Capture exact protected Fleet A link/assignment snapshots. Verify zero rows
   for Driver A of any status/workspace and zero reserved-UUID collisions.
6. Record redacted counts, fixture IDs, protected hashes, database timestamp,
   migration evidence and authorization references. No unrelated row contents.

Run in a read-only repeatable-read transaction. It reserves no rows and cannot
guarantee that later apply will pass. Record preconditions for an exclusive
synthetic-fixture test window; do not change sessions or roles to manufacture it.

## Apply and concurrency

Re-attest the target immediately before a serializable transaction. Recheck
the approved snapshot/identity predicates inside the transaction with exact
row locks, not merely against a prior JSON report. Acquire the exact migration
011 account-link transaction advisory lock. Retain all canonical FK/check/
trigger enforcement. Check ANY Driver A history and UUID collision again.

Capture T once from the database. Insert exactly the accepted record with
explicit provenance, sponsor and actual-executor approval marker; require
one RETURNING row and compare every intended field. Recheck the effective
link count and protected rows before commit. Serialization, timeout, guard,
constraint or transport failure ends the attempt; no automatic mutation retry,
upsert, history deletion, timestamp refresh or alternate-ID repair.

Do not scan/hash or lock all staging tables. Prove the adapter's write surface
through its bounded SQL and tests, snapshot the exact protected fixtures, and
check the inserted row/count. This is not a claim that unrelated concurrent
staging writes are globally absent. Any such requirement needs its own evidence.

On connection loss around COMMIT, classify outcome UNKNOWN and use a new
read-only exact-row reconciliation. Never assume rollback or re-insert. Reconcile
the original T, target, reason and snapshots before reporting an outcome.

## Receipt, rerun and rollback

Persist a redacted receipt containing target attestation references,
implementation/contract/approval references, the inserted row's exact fields
and original T, protected snapshot hashes, operation timestamps and outcome.
Keep secrets out. Rerun requires the original receipt and exact sole-row match;
any drift or missing original evidence aborts without mutation.

Rollback is NOT an automatic consequence of failed subsequent smoke. First
perform a separately authorized read-only assessment of exact row identity,
all provenance fields/T, protected snapshots, declared foreign-key references
and canonical Load/PTI or other downstream uses of the designated fixture.
Do not assume direct FK absence proves no semantic use. Map actual reference
columns and available evidence before implementing a rollback delete path.

New use may be read-only and leave no detectable database row. Thus unchanged
database hashes do not prove rollback safety. If an exclusive fixture window
and absence of downstream use cannot be established, report
ROLLBACK_BLOCKED_UNPROVEN_USE and retain the link for coordinator review.
Do not delete business evidence, revoke sessions, rewrite IDs or broadly lock
staging to make rollback possible. After any browser journey uses the new
link, require a fresh bounded rollback decision rather than reusing an earlier
approval. A permitted deletion must match the exact original receipt, require
DELETE 1 and leave the Fleet A link, Driver, Truck and assignment untouched.

## Independent validation and gates

1. Claude reviews this design; ACCEPT authorizes no remote execution by itself.
2. Codex establishes the exact implementation allowlist under delegation.
   Implement target-attestation failure cases and shared guards using fake
   Railway responses plus disposable PostgreSQL only. No credentials or login.
3. Test wrong project/environment/service, production endpoint, stale or
   missing attestation, endpoint overrides, schema/trigger mismatch and wrong
   provenance. Retain every accepted local guard/concurrency/receipt test.
4. Prove one-row apply, zero collateral fixture changes, zero-write rerun,
   uncertain-commit reconciliation, protected drift, downstream-use refusal,
   and separately gated rollback. Exercise two competing writers with real 011.
5. Run targeted adapter/local-fixture/link tests and full backend pytest;
   publish exact code/evidence to Claude before any staging execution.
6. After independent ACCEPT, authorize one read-only staging preflight with
   explicit credential scope and no writes. Publish exact target/provenance
   evidence; resolve any mismatch before granting apply approval.
7. Separately authorize one guarded staging insert bound to the accepted code
   and fresh preflight. Collect evidence and independent review before the
   authenticated journey. No broad provisioning or automatic cleanup.

## Current decision and handoff

Design output: PLAN_PROPOSED_FOR_REVIEW. Staging execution remains BLOCKED on
unimplemented/unreviewed adapter, actual target/provenance preflight and explicit
execution approval. No external endpoint/DB lookup was performed for this plan.

Next required actor: Claude. Review target-binding sufficiency, guard reuse,
uncertain-commit handling, bounded write surface and rollback evidence limits.
If ACCEPT with no design blockers, next actor Codex for the separately bounded
adapter implementation authorization, not staging execution or deployment.

Second-Driver/cross-workspace fixtures, IA-3 harness compatibility, authenticated
browser/mobile/offline proof and CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remain
queued. No IA-4, SIDR, Dispatch, Safety, Truckpedia, GitHub #206480 work, merge,
deployment, migrations, legacy backfill or production-data mutation.
