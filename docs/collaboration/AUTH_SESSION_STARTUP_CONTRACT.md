# Auth / Session / Startup Behavior Contract

## Scope and evidence boundary

- Slice: `1A - Auth/Session/Startup Behavior Contract Baseline`
- Implemented-behavior source: `origin/main` at `86b8b4dd7e9496833a021319167589b49f0ac418`
- Purpose: freeze observable startup/auth/session behavior before extraction.
- This is not an extraction plan and makes no runtime changes.

Every statement uses one evidence level:

- `STATIC_CONTRACT`: source shape/order is pinned; runtime outcome is not proven.
- `UNIT_CONTRACT`: deterministic module behavior is exercised without a full browser.
- `E2E_REQUIRED`: a real browser is required to prove the outcome.
- `STAGING_REQUIRED`: authenticated backend/staging evidence is required.
- `UNKNOWN`: evidence is currently insufficient.

Every current behavior also has one disposition:

- `PRESERVE_IN_EXTRACTION`: approved current behavior that Slice 1B must preserve.
- `KNOWN_UNSAFE_CURRENT_BEHAVIOR`: implemented behavior that must not be normalized as desired behavior.
- `UNKNOWN / NEEDS_RUNTIME_VERIFICATION`: observed source intent without sufficient runtime proof.

## 1. Startup sequence

Current load/startup path:

1. `index.html` synchronously loads `core.js`, then static tags for `sync.js`, `pti.js`, `loads.js`, and `fleet-load-resolution.js`.
2. `core.js` uses `document.write` to synchronously inject the fixed 18-script chain documented in `HOTFIX_LOAD_ORDER_CONTRACT.md`.
3. `core-runtime.js` installs the core object and authenticated fetch adapter; later wrappers retain the fixed loader order.
4. Inline initialization runs `runLaunchCleanResetOnce()`, `migrateStorage()`, `loadAll()`, `initSync()`, `initPTI()`, `initLoads()`, role/theme rendering, and splash timers in that order.
5. Startup reads `fiqD_sessionToken`, `fiqD__savedSyncUrl`, and the loaded driver's `syncUrl`.
6. If a token and sync URL exist, startup calls `restoreSession(..., silent:true)`, logs a rejection, and invokes `boot()` from `finally`.
7. Otherwise startup marks fleet restore settled and calls `boot()` directly.
8. `boot()` shows setup when no driver exists. With a driver, it renders identity/assignment header state, then calls `needsPTI()`.
9. `needsPTI() === true` selects `showPTIBlocker()`; otherwise `showApp()` exposes the existing initial page.
10. `showApp()` renders current state, schedules auto-sync, and schedules a silent `pullFromCloud()` after one second when sync is configured.

Evidence: `STATIC_CONTRACT` in `tests/auth-session-startup-contract.test.mjs`; browser-visible startup outcome remains `E2E_REQUIRED`.

Disposition: `PRESERVE_IN_EXTRACTION`, except for the unsafe fallback and one-time reset risks called out below.

## 2. Session restore sequence

`restoreSession(options)` currently performs this order:

1. `setFleetRestoreSettled(false)`.
2. Resolve token from `options.sessionToken` or `fiqD_sessionToken`.
3. Resolve sync URL from options/login input, `fiqD__savedSyncUrl`, driver config, or the default URL.
4. Reject before transport when the token is missing.
5. `authPost('auth_restore', {sessionToken}, syncUrl)`.
6. `applyAuthRestoreData(data, syncUrl)`.
7. When CrewBIQ ID exists and truck/profile data is incomplete, attempt `restoreFleetConfigFromOrchestrator(driver.crewId)`.
8. Persist, save the profile, render, then `setFleetRestoreSettled(true)`.

`core-runtime.js` adapts `auth_restore` into authenticated `/v1/me` and `/v1/fleet/config` reads. Apps Script-style callers still submit the legacy action envelope; the adapter owns the current Orchestrator translation.

Evidence: startup integration `STATIC_CONTRACT`; transport adapters `UNIT_CONTRACT` in `orchestrator_transport.test.mjs`, `full_restore_transport.test.mjs`, and `settings_restore_transport.test.mjs`; end-to-end restore `STAGING_REQUIRED` in `staging-auth-restore.spec.mjs`.

Disposition: `PRESERVE_IN_EXTRACTION`.

## 3. CrewBIQ identity resolution

- `applyAuthRestoreData()` derives email and CrewBIQ ID from restore/profile fields and classifies the transition from the previous raw `crewId`/`email` pair.
- CrewBIQ ID takes precedence over email for the scoped identity slug.
- Identity-scoped driver data uses `fiqD_data_crew_<slug>_<key>` or `fiqD_data_email_<slug>_<key>`.
- Account switches do not carry the previous driver's local fields, loads, PTI log, or local account ID into the incoming account.
- The account registry reuses the same local account ID for a previously seen identity.
- Server-side owner scope is derived from the Bearer session, not client-submitted owner fields.

Evidence: `STATIC_CONTRACT`/`UNIT_CONTRACT` in `driver_projections.test.mjs` and transport tests; cross-tenant enforcement is `STAGING_REQUIRED` in `staging-tenant-isolation.spec.mjs`.

Disposition: `PRESERVE_IN_EXTRACTION`.

## 4. Role restoration rules

- Local UI role is `fiqD_userRole`, defaulting to `driver`.
- `core-runtime.js` persists authenticated roles in `fiqD_authRoles`, authenticated user data in `fiqD_authUser`, and maps the highest authorized server role to `fiqD_userRole`.
- `setUserRole` is guarded after core initialization so a requested UI role cannot exceed authenticated roles.
- Owner snapshot data can promote a local `driver` role to `owner_op` or `fleet` based on restored owner-data counts.
- `applyRoleUI()` runs before startup restore and may run again through rendering after restore.

Evidence: source mapping is `STATIC_CONTRACT`; authorization and visible-role outcome are `E2E_REQUIRED`/`STAGING_REQUIRED`.

Disposition: `PRESERVE_IN_EXTRACTION`.

## 5. Workspace/account restoration

- The primary PWA session and the optional Settings Orchestrator account are separate current mechanisms.
- The optional Orchestrator session and canonical-read cache are identity-scoped (`orchestratorSession`, `orchestratorCanonicalRead`).
- Active workspace selection in Settings is a local override for display; it does not mutate server workspace state.
- Canonical Company/Truck reads require the active membership capability and never overwrite local fallback records.
- The optional Settings account does not run during startup.

Evidence: `STATIC_CONTRACT` in `orchestrator_account_settings.test.mjs`; live membership/capability behavior is `E2E_REQUIRED`/`STAGING_REQUIRED`.

Disposition: `PRESERVE_IN_EXTRACTION`.

## 6. PTI gate position

- `initPTI()` completes before any restore decision or `boot()` call.
- `boot()` checks for a loaded driver before PTI.
- `needsPTI()` executes before `showApp()` and decides between `showPTIBlocker()` and the app.
- Daily cadence requires an entry for today; weekly cadence requires an entry in the current week.
- PTI disabled explicitly (`driver.ptiEnabled === false`) bypasses the gate.

Evidence: ordering is `STATIC_CONTRACT`; PTI module logic is `UNIT_CONTRACT`; browser gate behavior is `E2E_REQUIRED` and full lifecycle evidence is `STAGING_REQUIRED`.

Disposition: `PRESERVE_IN_EXTRACTION`.

## 7. Logout and session clearing

`logoutDevice()` currently:

- requires confirmation;
- registers the outgoing identity/account ID and safely archives legacy pay settings before clearing session state;
- attempts remote `auth_logout` best-effort;
- removes `fiqD_driver` and `fiqD_sessionToken`;
- preserves fleet/owner configuration, `fiqD_userRole`, sync URL, PTI schedule, identity-scoped records, and cloud data;
- reloads the page;
- cancels logout if corrupt pay settings cannot be archived/quarantined safely.

The separate optional Orchestrator disconnect clears only its identity-scoped session/read cache.

Evidence: selective clearing is `STATIC_CONTRACT`; server revocation is `STAGING_REQUIRED`; complete browser storage outcome is `E2E_REQUIRED`.

Disposition: `PRESERVE_IN_EXTRACTION`.

## 8. Failed or expired session behavior

- Missing token before explicit restore throws `auth_restore: sessionToken missing before restore`.
- Transport 401/invalid responses reject `authPost()`/`restoreSession()`.
- Cold-start restore catches the rejection, logs a warning, and still calls `boot()` in `finally`.
- The generic startup failure path does not distinguish expired credentials from transient network failure and does not clear the saved token.
- Explicit login failures remain on the setup/auth surface and display the endpoint-qualified error.

Evidence: source behavior is `STATIC_CONTRACT`; revoked backend token response is `STAGING_REQUIRED`; PWA-visible expired-session outcome is `E2E_REQUIRED` and is not currently proven.

Disposition: generic no-destructive-clear behavior is `PRESERVE_IN_EXTRACTION`; expired-vs-transient UX is `UNKNOWN / NEEDS_RUNTIME_VERIFICATION`.

## 9. Offline startup behavior

- The service worker cache-first app shell includes `index.html`, loader/runtime/hotfix files, `sync.js`, `pti.js`, and other startup modules.
- API hosts and POST requests are network-only.
- A cached shell can therefore load offline, while `auth_restore` fails through the network path; startup then reaches `boot()` through `finally` using locally loaded state.
- Offline queue replay covers authenticated sync mutations and triggers one guarded `doSync()` on reconnect; it does not make auth restore available offline.
- A stale service-worker cache can preserve an older startup graph until `sw.js`/`CACHE_NAME` rotates.

Evidence: SW/queue source and deterministic queue behavior are `STATIC_CONTRACT`/`UNIT_CONTRACT`; actual installed-PWA cold start is `E2E_REQUIRED`; offline retry against backend is `STAGING_REQUIRED`.

Disposition: local/offline continuity is `PRESERVE_IN_EXTRACTION`; actual cold-start UX is `UNKNOWN / NEEDS_RUNTIME_VERIFICATION`.

## 10. Relevant persistence keys

| Key or pattern | Current purpose |
| --- | --- |
| `fiqD_sessionToken` | Primary PWA Bearer session |
| `fiqD_authUser`, `fiqD_authRoles`, `fiqD_userRole` | Authenticated identity/roles and visible local role |
| `fiqD_driver` | Current local driver/profile shell |
| `fiqD_data_crew_<slug>_*`, `fiqD_data_email_<slug>_*` | Identity-scoped loads, PTI, settings, optional Orchestrator session/cache |
| `fiqD_accountRegistry` | Stable local account-ID mapping by CrewBIQ ID/email |
| `fiqD_authProfile`, `fiqD_assignments`, `fiqD_profiles` | Restore/profile and device profile records |
| `fiqD_paySettings`, scoped `paySettings` | Legacy mirror plus canonical identity-scoped compensation settings |
| `fiqD__savedSyncUrl`, `fiqD__savedPtiSched`, `fiqD_deviceId` | Device/environment startup continuity |
| `fiqD_launchCleanResetVersion`, `fiqD_schemaVersion` | One-time reset/migration markers |
| offline queue keys owned by `offline-sync-queue.js` | Pending authenticated mutation journal and status |

No session/auth startup dependency on `sessionStorage` was found in the inspected current-main path (`STATIC_CONTRACT`).

## 11. API and orchestrator dependencies

- Legacy action-envelope calls: `auth_login`, `auth_signup`, `auth_restore`, `auth_logout`.
- Orchestrator adapter endpoints: `POST /v1/auth/login`, `POST /v1/auth/bootstrap`, `GET /v1/me`, `GET /v1/fleet/config`, `POST /v1/auth/logout`, and authenticated sync endpoints.
- Optional Settings account additionally uses `/v1/canonical/company-truck` with capability gating.
- `restoreFleetConfigFromOrchestrator()` can retry the public `/v1/fleet/config/pwa` path after an authenticated fleet-config 401.

Transport shape is `UNIT_CONTRACT`; live authorization and owner scoping are `STAGING_REQUIRED`.

## 12. Hotfix and loader dependencies

- `core.js` is a synchronous `document.write` loader and remains technical debt plus an ordering risk.
- `core-runtime.js` must precede wrappers that depend on `CrewBIQCore` and its fetch adapter.
- `offline-sync-queue.js` wraps the downstream fetch path before later restore/settings hotfixes.
- `restore-hotfix.js` owns restore compatibility helpers used by owner snapshot behavior.
- The exact 18-script order and file existence are already protected by `tests/hotfix-load-order-contract.test.mjs`.

Evidence: `STATIC_CONTRACT`. Disposition: loader order is `PRESERVE_IN_EXTRACTION`; `document.write` itself remains approved technical debt, not an extraction target in Slice 1B.

## 13. Service-worker/cache implications

- App-shell startup files are cache-first.
- Auth/API POSTs are network-only.
- Startup-contract changes in a future runtime slice require synchronized service-worker cache rotation; changing only the registration query does not update an already installed stale shell.
- Slice 1A changes no service-worker or cache behavior.

Evidence: `STATIC_CONTRACT`; installed-client update behavior is `E2E_REQUIRED`.

## 14. Behavior disposition updates

### `AMBIGUOUS_FIRST_TRUCK_FALLBACK`

Category: `RESOLVED_IN_SLICE_1A_1`.

The prior implementation returned:

`findTruckByIdOrUnit(driver && driver.unitNumber) || activeTrucks()[0] || null`

The corrected resolution contract is:

- A valid explicit driver unit/truck reference resolves that truck.
- An invalid explicit reference returns no truck and never falls back.
- With no explicit reference, zero active trucks returns no truck.
- With no explicit reference, exactly one active truck is treated as unambiguous and resolves that truck.
- With no explicit reference, multiple active trucks return no truck and surface `Truck assignment required` in existing selectors.
- Load, fuel, service, and current-week deduction mutations refuse to persist until a truck is explicitly resolved.

The exactly-one convenience is retained because the canonical prohibition is against ambiguous assignment, the existing UI already supports a single active operational truck, and no competing assignment exists in that state. Any non-empty invalid explicit reference remains authoritative evidence of unresolved assignment and fails closed.

### Call-site inventory reviewed in Slice 1A.1

| Call site | Type | Null behavior / correction |
| --- | --- | --- |
| `currentCarrierCompany()` | Read-only projection | Already null-safe; falls back to legacy company display only, no truck mutation |
| `currentDriverAssignment()` | Read-only projection | Already null-safe; returns empty truck/company refs |
| `renderTruckSelect()` / `selectedTruckId()` | Shared fuel/service/deduction selector | Removed first-option fallback; unresolved/ambiguous state renders disabled `Truck assignment required` placeholder |
| `populateLoadTruckSelect()` / `getLoadTruckSelection()` | Load selector and mutation context | Removed `trucks[0].id`; unresolved state renders placeholder and `saveLoad()` refuses persistence |
| Fuel save | Mutation | Refuses save without resolved truck |
| Service save | Mutation | Refuses save without resolved truck |
| Current-week deduction creation/apply/edit/delete | Mutation | Returns a non-persisted unresolved view or refuses mutation without resolved truck |
| OCR fuel/service apply | Form prefill | Uses explicit scanned unit when resolvable; invalid scanned unit remains unresolved for user selection |

### One-time launch reset

`runLaunchCleanResetOnce()` removes `fiqD_*` driver/session data once per reset version while preserving recognized fleet config. Its installed-client and interrupted-storage outcomes are `UNKNOWN / NEEDS_RUNTIME_VERIFICATION`. Future extraction must introduce no new destructive clearing and must not broaden this reset.

## 15. Existing coverage inventory

| Area | Existing protection | Evidence |
| --- | --- | --- |
| Loader order | `hotfix-load-order-contract.test.mjs` | `STATIC_CONTRACT` |
| Core auth adapter and restore transport | `orchestrator_transport`, `full_restore_transport`, `settings_restore_transport` | `UNIT_CONTRACT` |
| Identity transitions/account isolation/pay settings | `driver_projections.test.mjs` | `STATIC_CONTRACT` |
| Optional Orchestrator account/workspace cache | `orchestrator_account_settings.test.mjs` | `STATIC_CONTRACT` |
| Offline mutation queue/reconnect | `offline_sync_queue` and terminal-409 contracts | `UNIT_CONTRACT` |
| Auth login/logout/restore backend behavior | `staging-auth-restore.spec.mjs` | `STAGING_REQUIRED` |
| Tenant collision/isolation | `staging-tenant-isolation.spec.mjs` | `STAGING_REQUIRED` |
| PTI lifecycle | `staging-pti-lifecycle.spec.mjs` | `STAGING_REQUIRED` |
| Offline retry | `staging-offline-retry.spec.mjs` | `STAGING_REQUIRED` |
| Inline startup/restore/boot/PTI ordering and selective logout | `auth-session-startup-contract.test.mjs` | `STATIC_CONTRACT` |
| Explicit/default truck resolution and fail-closed mutation paths | `first-truck-fallback.test.mjs` | `UNIT_CONTRACT` + `STATIC_CONTRACT` |

Not yet protected by meaningful runtime evidence: installed offline cold start, browser-visible expired-session handling, and complete role restoration after cold restore. Static source checks must not be interpreted as proof of those outcomes.

## 16. Extraction invariants

Future extraction must preserve:

- the same successful login outcome;
- the same restore behavior;
- the same authorized role visibility;
- the same account/workspace selection behavior;
- the same PTI gate semantics and position;
- the same supported offline behavior;
- the same selective logout behavior;
- the same current invalid-session behavior until separately changed by an approved contract;
- no cross-account leakage;
- no new destructive storage clearing;
- no duplicate network mutations during startup;
- no loader/hotfix ordering change.

The corrected invariant is enforced: no first-truck fallback for ambiguous ownership or assignment.

## 17. Slice 1B readiness

`READY_FOR_SLICE_1B`

Blocking item: none after Slice 1A.1 corrected-behavior tests pass.

Next bounded action: independent Claude review of Slice 1A.1. Do not begin Slice 1B until that review accepts this correction.
