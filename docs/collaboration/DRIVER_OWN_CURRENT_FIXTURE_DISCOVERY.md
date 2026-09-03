# Driver own-current staging fixture discovery

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Finding: CANONICAL_DRIVER_A_ACCOUNT_LINK_MISSING
Authenticated positive-path readiness: BLOCKED

## Scope and provenance

After review `081a138c87ae6dc61a9818b9fda21a8b2e0f1749`, Codex used standing
coordination delegation to select read-only fixture discovery only.

Source: orchestrator `ce5a591a48f1733b4e21128dece0e0350ace41c2`,
`app/testing/e2e_provisioning.py::_IDENTITIES`. It defines the exact four
Account IDs and expected nicknames below; the discovery did not infer test
identity from arbitrary names, email addresses or database row ordering.

At 2026-09-03T22:58:49.962271Z, a read-only repeatable-read transaction inspected
only these exact Accounts and their membership/link/assignment prerequisites.
Target assertions checked project `89eb12bf-57ee-4228-a841-4008ef7a0e59`,
environment `ce5fe955-2a0c-4fba-8d57-571acbf7bded`, Postgres service
`59601072-9820-4404-af50-d47e8f2c335c`; database railway, schema public.
Server transaction_read_only was on.

Existing Railway-injected database connection was used. No test-account
email, password, password hash or session token was selected, exposed or
reset. No provisioning module or authentication/login endpoint was executed.

## Exact results

All four Account IDs resolved exactly once, were active and matched their
version-controlled expected nicknames. Their Persons/workspaces/memberships
were active; each had one default membership with effective_to null.

| Account | Workspace | Membership roles | AccountDriverLink |
| --- | --- | --- | --- |
| CBQ-E2E-DRIVER-A | 243289f3-7da8-881d-7773-7dfea2083863 | driver only | Zero rows |
| CBQ-E2E-OWNEROP-A | 7344c2eb-4258-2687-0f00-5dffbba0e4c7 | fleet only | Zero rows |
| CBQ-E2E-FLEET-A | 243289f3-7da8-881d-7773-7dfea2083863 | fleet only | One effective active link, one effective assignment for its linked Driver |
| CBQ-E2E-FLEET-B | bca08bc3-8069-183d-0fa4-81fabd100c5c | fleet only | Zero rows |

Driver A membership ID: `f505d384-63c4-1ed5-db7a-f9c5685b60a2`.
Fleet A link ID: `d5f4db9b-e2c8-5a5b-9e5e-9bbce2f67d5f`.
Its Driver ID: `e2e-staging-20260714-fleet-a-driver-active`.
Link effective_from: 2026-09-01T19:38:37.797892Z; effective_to null.

The active link calculation used status=active and half-open effective dates
at the transaction's current time. Assignment count used the same workspace
and linked Driver, non-revoked status and half-open effective dates.

## Interpretation

The canonical driver-only Account exists. The earlier uncertainty about that
Account's existence is narrowed to a concrete missing AccountDriverLink.
It cannot presently supply the positive own-current proof chain. This does
not mean no Driver records or assignments exist in its workspace; no subject
Driver ID was inferred for this Account.

Fleet A's relationship cannot be borrowed to impersonate Driver A, even though
both are members of the same workspace. The results also do not prove an
available second canonical Driver login or a valid complete cross-tenant
Driver fixture set. The inspected other-workspace Account is Fleet, not Driver.

Reading a unique matching synthetic ID/nickname is enough to describe this
inspection, not blanket mutation authority or proof of which Driver a new
link should target. Any future fixture link requires a separately explicit
target/provenance/count guard and independent review. Do not infer subject
identity from a Truck, fleet membership, unit number or first Driver row.

The existing PWA staging prerequisite helper inspected in this step declares
Fleet A/B credentials and validates fleet identity contracts. It does not by
itself prove a ready Driver-only browser configuration. No protected fixture
manifest or user credentials were obtained in this step.

## Handoff and limits

Claude reviews the exact discovery, provenance limits and remaining gap.
Next work may reconcile a bounded Driver-only fixture/harness contract, but
must not provision data or run authenticated scenarios under this discovery
authorization. Existing backend deployment is unchanged.

No runtime/tests/workflow edit, login, fixture/role/link/assignment mutation,
merge, deployment, migration or backfill. No browser/mobile/offline test run.
NOT_READY_FOR_PRODUCTION remains; CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED
stays queued. No successful own-current journey is claimed.
