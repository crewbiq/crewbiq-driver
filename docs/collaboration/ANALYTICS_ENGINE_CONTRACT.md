# CrewBIQ Analytics Engine Contract - Slice 4B.1a

## Boundary

`analytics.js` exports `window.CrewBIQAnalytics` as an independently tested, global-compatible pure-read module. It is intentionally not loaded by `index.html` in Slice 4B.1a. Loading is unnecessary until a reviewed UI composition slice consumes it, so this slice changes neither startup behavior nor the service-worker cache.

The module may validate scope and periods, normalize attributable input into a copied snapshot, and calculate read-only metrics/series. It must never access persistence, network, DOM, forms, auth storage, or domain mutation APIs.

## Driver SELF validation

Only `{type:'self', workspaceId}` is accepted. `driverId` and `truckId` narrowing are invalid in this slice. Expected failures are returned, not thrown:

```js
{ok:false, code:'invalid_scope'|'invalid_period'|'self_not_linked'|'self_ambiguous'|'self_unauthorized', message, details}
```

SELF resolution consumes explicit proof records. It does not search Driver/truck arrays or compare names, email, unit, role, count, or array position.

Two proof shapes are recognized:

- `authenticated_driver_partition`: an explicit account/workspace proof whose `account_crew_id`, record `crewId`, and authenticated driver account identity are equal.
- `canonical_account_driver_link`: an explicit account/workspace to fleet Driver-profile ID link that separately supplies the record `crewId` used for current loads.

The second form preserves the distinction between fleet `driver_profile_id` and account/session `account_crew_id`; they are never equated. Owner/fleet users without exactly one explicit canonical link fail `self_not_linked` or `self_ambiguous`.

## Period and timezone semantics

`resolvePeriod()` supports `today`, `week`, `month`, `quarter`, and `custom`. Results use local operational date strings with explicit `[startInclusive, endExclusive)` semantics.

- An explicit valid IANA `timeZone` argument is mandatory and returned as `timeZoneSource:'explicit_argument'`.
- Non-custom periods require an explicit local `referenceDate`; the resolver does not read the wall clock.
- Week means ISO-style Monday through next Monday and reports `calendar:'iso_week_monday'`.
- Month and quarter are calendar boundaries.
- Custom accepts user-facing `dateFrom` and `dateTo` as inclusive local operational dates, allows a single-day range, and normalizes internal `endExclusive` to the start of the local day following `dateTo`; only `dateFrom > dateTo` is invalid.

This does not invent a workspace timezone setting. A future composition layer must pass an authorized workspace timezone or explicitly approved fallback.

## Attribution and snapshot

A load is included only when:

- its `crewId` exactly equals the resolved proof's `recordCrewId`; or
- it has no record `crewId` and the caller supplies an explicit `canonical_account_partition` proof for the same owner `crewId`.

Different or unproven identities are excluded and surfaced in `excludedRecords` plus `records_excluded_unproven_attribution`. Snapshot records are copies; input arrays and records are not mutated.

Current record ID provenance uses an actual `id`, `record_id`, business `loadId`, or existing `key`. Missing provenance produces `relatedRecordIds:[]`; no ID is synthesized.

## Metric definitions

- `gross`: sum of attributable, in-period loads excluding `cancel` and `disputed`; unavailable if any contributing record lacks valid gross.
- `loadCount`: attributable, in-period loads excluding `cancel`.
- `loadedMiles`: sum of the existing `loadedMiles` field for non-cancelled attributable records.
- `deadheadMiles`: sum of the existing `deadMiles` field for non-cancelled attributable records. It is never inferred from total/route miles.
- `rpm`: `null` / `unavailable`. Current naming and denominator are not sufficiently approved for this new contract.
- `currentTruckId`: present only when carried by the explicit identity proof. Truck arrays and first/single-truck fallbacks are ignored.

Zero records safely produce zero sums/count. Missing contributing values produce `null`, never a fabricated zero.

## Series selectors

`getEarningsSeries(snapshot)` groups eligible gross by operational load `pickup`/legacy `date`. `getMileageSeries(snapshot)` groups existing loaded/deadhead fields by the same daily bucket. Points are sorted and include only real related record IDs.

## Data quality

Snapshots and metrics expose:

```js
dataQuality = {
  complete: boolean,
  missingFields: [],
  warnings: [],
  attribution: 'proven' | 'partial'
}
```

Warnings describe excluded attribution, partition-based attribution, unavailable record provenance, unapproved RPM semantics, and unavailable current truck. Missing metric fields make that metric unavailable.

## Purity invariant

The module has no `localStorage`, `fetch`, `XMLHttpRequest`, DOM access/mutation, `saveAll`, Links save, Driver-profile save, timers, or load-time composition. Its only load-time action is assigning the frozen namespace.

## Future extension points

Future reviewed slices may add `DRIVER`, `TRUCK`, and `FLEET` validators/selectors, but must retain fail-closed authorization and stable-ID attribution. They may not reinterpret this SELF proof as an account-to-Driver migration, infer historical assignments, or add UI/persistence ownership to the analytics module.
