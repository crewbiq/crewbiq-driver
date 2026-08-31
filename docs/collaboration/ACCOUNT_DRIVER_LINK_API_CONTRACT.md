# AccountDriverLink Read API and PWA Adapter Contract

## Ownership and slice boundary

The canonical `AccountDriverLink` source of truth is server-side. This repository owns only the disconnected read-only adapter `account-driver-link.js` and its request/response validation contract.

The PWA does not own link schema persistence, authorization, admin mutations, audit storage, migrations, Driver/Truck assignments, or normalized business-record writes. It never creates a second source of truth in localStorage, IndexedDB, static configuration, profile guesses, or session heuristics.

The adapter is not loaded by `index.html` in Slice 4B.1b.1a. It performs no request on module load, changes no production behavior, and requires no service-worker cache rotation.

## Current transport alignment

CrewBIQ already uses action-envelope compatibility transport in `core-runtime.js`, which maps authenticated PWA actions to explicit Orchestrator REST routes and applies Bearer headers. The adapter therefore injects:

```js
request('account_driver_link_read', {
  sessionToken,
  workspaceId,
  accountId
})
```

The adapter does not call `fetch`. A future composition layer must map this action through the authenticated Orchestrator transport to the backend-owned read route. The server derives/verifies Account identity from the Bearer session and verifies workspace membership; client IDs are requested context, never authorization evidence.

The injected request returns parsed JSON directly or `{status, data}`. HTTP 401/403 maps to `account_driver_link_unauthorized`; 5xx/negative server envelopes map to `server_error`; thrown network/timeout failures map to `network_unavailable`. Current transport has no uniform adapter-owned timeout, so timeout enforcement belongs to the injected transport and is normalized by this adapter without adding a competing network stack.

## Minimum server response

```js
{
  ok: true,
  workspaceId: 'workspace-1',
  accountId: 'CBQ-ACCOUNT-1',
  accountIdSpace: 'crewbiq_account',
  links: [{
    linkId: 'link-1',
    workspaceId: 'workspace-1',
    accountId: 'CBQ-ACCOUNT-1',
    driverId: 'driver-profile-1',
    status: 'active' | 'inactive' | 'revoked',
    effectiveFrom: '2026-08-01T00:00:00Z',
    effectiveTo: null,
    provenance: {
      source: 'explicit' | 'manual_admin' | 'onboarding' |
              'verified_import' | 'system_backfill' | 'migration_proven',
      attributedByAccountId: 'CBQ-ADMIN-1',
      attributedAt: '2026-08-01T00:00:00Z',
      reason: null
    }
  }]
}
```

`manual_admin` requires a non-empty `reason`. Other sources may carry a reason. Timestamp intervals are `[effectiveFrom, effectiveTo)`; null `effectiveTo` is open-ended. The current canonical Account ID source is CrewBIQ account/`crewbiq_id`, so a validated response Account ID can also be emitted as current record `crewId` compatibility attribution without equating it to roster `driverId`.

Any malformed link invalidates the response. The client does not silently discard malformed candidates and then select another.

## Workspace, Account, and effective-link validation

- Response and every link must match the active authorized `workspaceId`.
- Response and every link must match the authenticated canonical Account ID.
- `accountIdSpace` must be `crewbiq_account`; device-local `driver.accountId` is forbidden.
- Exactly one `active` link must contain the requested effective timestamp.
- Zero qualifying links returns `account_driver_link_not_found`.
- Multiple qualifying links returns `account_driver_link_ambiguous` without newest/oldest/first/name selection.
- Future, expired, inactive, and revoked links remain in server history but do not qualify for current SELF.

## Canonical analytics proof

One valid link produces:

```js
{
  type: 'canonical_account_driver_link',
  proof: 'canonical_account_driver_link',
  workspaceId,
  accountId,
  driverId,
  driverProfileId: driverId,
  recordCrewId: accountId,
  linkId,
  effectiveFrom,
  effectiveTo,
  provenance
}
```

This matches `analytics.js` without adding transport to the pure analytics module. The adapter does not return or select a truck.

## Stable result codes

- `account_driver_link_not_found`
- `account_driver_link_ambiguous`
- `account_driver_link_unauthorized`
- `account_driver_link_invalid_response`
- `account_driver_link_workspace_mismatch`
- `account_driver_link_account_mismatch`
- `network_unavailable`
- `server_error`

Expected validation and transport outcomes are structured `{ok:false, code, message, details}` objects rather than thrown to callers.

## Offline and security behavior

The adapter fails `network_unavailable` when the authoritative server cannot be reached. It does not persist or reuse stale link state. A future server-authoritative proof embedded in a signed restore/session response requires a separate contract and expiry policy.

UI hiding is not authorization. The backend must derive Account from Bearer credentials, verify active workspace membership/capability, prevent cross-workspace reads, and avoid leaking candidate links in error details.

## SERVER IMPLEMENTATION HANDOFF

The backend/Orchestrator owner must implement in its repository:

1. An `AccountDriverLink` table/model with immutable relation ID, canonical Account/Driver/Workspace FKs, status, effective interval, provenance, and schema version.
2. Foreign-key and workspace-coherence constraints.
3. A constraint or transaction rule preventing overlapping active links for one Account/workspace effective instant.
4. Bearer-session authorization that derives Account identity server-side and verifies workspace membership/read capability.
5. An authenticated read route/action mapped from `account_driver_link_read`; client workspace/account fields are validation context, not authority.
6. Stable structured 401/403/404/conflict/5xx responses and no cross-tenant detail leakage.
7. Durable audit events for create, close, revoke, correction, and later admin mutations.
8. Mandatory `manual_admin` actor, timestamp, and non-empty reason.
9. Backend tests for zero/one/multiple effective links, interval boundaries, overlap prevention, workspace/account mismatch, revoked links, authorization, and audit history.
10. A separately approved admin mutation API later. This PWA slice defines no write endpoint.

This repository must not simulate the missing server table or endpoint with local persistence.
