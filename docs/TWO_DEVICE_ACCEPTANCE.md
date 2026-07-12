# CrewBIQ Two-Device Acceptance Test

Status: ready to run after the active-only Orchestrator restore and the PWA authenticated transport are deployed.

## Purpose

Prove that two clean devices use the same authenticated owner scope, restore only the active fleet, and cannot select another tenant or elevate access through local client fields.

## Preconditions

- Orchestrator active-only fleet restore is deployed.
- The production `auth_owner_mappings` row maps the authenticated account to the historical owner.
- This PWA branch is deployed.
- The test account has a known email/password and server role.
- PostgreSQL contains at least:
  - one active truck;
  - one inactive truck;
  - one active driver profile;
  - one inactive/terminated driver profile.
- Device A and Device B use separate browser profiles or separate physical devices.

Do not run the acceptance test with an account that is not mapped to the intended production owner.

## Evidence to capture

For every network request, capture:

- device label (A or B);
- endpoint and HTTP status;
- request ID / sync `record_id` when available;
- authenticated `crewbiq_id` from `/v1/me`;
- `effective_owner_crewbiq_id` from `/v1/me`;
- restored active truck IDs;
- restored active driver profile IDs;
- screenshot or exported HAR with tokens redacted.

Never paste a Bearer token into the acceptance report.

## Test 1 — Device A clean login and restore

1. Clear CrewBIQ site data on Device A.
2. Open the PWA and sign in with the production email/password.
3. Verify the network sequence:
   - `POST /v1/auth/login`;
   - `GET /v1/me` with `Authorization: Bearer …`;
   - `GET /v1/fleet/config` with `Authorization: Bearer …`.
4. Verify there is no successful Apps Script `auth_restore` request and no unauthenticated `/v1/fleet/config/pwa` fallback.
5. Verify `/v1/me` returns the expected authenticated user and expected historical effective owner.
6. Verify the PWA shows only active trucks and only active driver profiles.
7. Verify the inactive truck and terminated driver are absent.

Expected result: PASS.

## Test 2 — Authenticated write from Device A

1. On Device A, create or edit a harmless test fleet record using a clearly identifiable acceptance value.
2. Tap Sync Now.
3. Verify `POST /v1/sync/pwa` contains `Authorization: Bearer …`.
4. Verify the JSON body does not contain `sessionToken`.
5. Record the sync `record_id`.
6. Verify the Orchestrator returns success.
7. Verify only one accepted sync is created for that `record_id`; the client must not send a second legacy/Orchestrator copy.

Expected result: PASS.

## Test 3 — Device B clean login and restore

1. Clear CrewBIQ site data on Device B.
2. Sign in with the same account.
3. Verify the same authenticated sequence as Device A.
4. Verify `/v1/me` returns the same effective owner.
5. Verify Device B restores the active fleet state written by Device A.
6. Verify inactive and terminated records are still absent.

Expected result: PASS.

## Test 4 — Cross-device refresh

1. Make one additional harmless change on Device A and sync.
2. On Device B, use Restore / Sync Now or restart the PWA.
3. Verify Device B receives the Device A change without creating duplicate fleet IDs.
4. Verify Device B does not replace stable truck or driver IDs with locally generated IDs.

Expected result: PASS.

## Test 5 — Tenant and role tampering

On Device B, after recording the original values:

1. Change local `driver.crewId`, `ownerKey`, email, or a query-string `crewbiq_id` to a different value.
2. Attempt restore again.
3. Verify `/v1/fleet/config` still returns the authenticated effective owner's records.
4. Change local `fiqD_userRole` to `fleet` for an account whose server roles do not allow fleet access, or run this check with a dedicated driver-only account.
5. Verify the UI does not retain or grant the higher role and the server does not broaden access.

Expected result: PASS.

## Test 6 — Explicit inactive record

1. On Device A, mark the acceptance test truck or driver profile inactive through the normal UI and sync.
2. Clear Device B site data and sign in again.
3. Verify the inactive record remains in PostgreSQL for history but is absent from the clean-device fleet restore response.
4. Restore the production record to its intended state after evidence is captured.

Expected result: PASS.

## Acceptance decision

The release passes only when every test above passes on both devices.

Any of the following is an automatic failure:

- login or restore silently falls back to Apps Script;
- fleet restore succeeds without Bearer authentication;
- a client `crewbiq_id`, `ownerKey`, email, or role changes tenant scope;
- inactive trucks or terminated drivers return on clean-device restore;
- a sync payload contains a session token;
- the same sync `record_id` is accepted twice;
- Device B receives new fleet IDs for existing entities.

## Result record

| Test | Device A | Device B | Evidence | Result |
|---|---|---|---|---|
| Clean login/restore |  |  |  |  |
| Authenticated write |  | N/A |  |  |
| Second-device restore | N/A |  |  |  |
| Cross-device refresh |  |  |  |  |
| Tenant/role tampering |  |  |  |  |
| Explicit inactive record |  |  |  |  |

Final decision: `PASS / FAIL`
