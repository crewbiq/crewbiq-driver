# CrewBIQ Analytics Scope Contract

## Status and boundary

This Slice 4B contract defines a bounded, read-only analytics subject. It does not implement selectors, authorization, production UI, scoring, SIDR, IFTA, or persistence. The accepted CrewBIQ Next mobile shell and any future `crewbiq.com` account must consume the same scope semantics.

The central invariant is:

> Authentication establishes the actor and workspace permissions. Analytics scope identifies the subject and period being displayed. They are not interchangeable.

An owner viewing their own driving work remains authenticated as the owner. The UI changes analytics scope, not account, session, or product role.

## Proposed value object

```js
AnalyticsScope = {
  type: 'self' | 'driver' | 'truck' | 'fleet',
  workspaceId: 'stable-workspace-id',
  driverId: null | 'stable-driver-id',
  truckId: null | 'stable-truck-id',
  period: 'today' | 'week' | 'month' | 'quarter' | 'custom',
  dateFrom: 'YYYY-MM-DD',
  dateTo: 'YYYY-MM-DD',
  timeZone: 'IANA time-zone'
}
```

`companyId` may be carried as workspace metadata, but `workspaceId` is the mandatory tenancy boundary because current authenticated membership and canonical company reads already expose a workspace identifier. A selector must receive a normalized, immutable scope whose dates have already been resolved. `dateFrom` and `dateTo` are inclusive local operational dates.

### Validation rules

| Type | Required identifiers | Forbidden/empty identifiers | Meaning |
| --- | --- | --- | --- |
| `self` | `workspaceId`, resolved linked `driverId` | `truckId` | Personal operational activity of the authenticated account's explicitly linked Driver profile. |
| `driver` | `workspaceId`, selected `driverId` | `truckId` | One authorized driver, independent of the actor's own profile. |
| `truck` | `workspaceId`, selected `truckId` | `driverId` as a filter unless a future explicit composite scope is approved | Truck activity during the period, including every effective driver assignment. |
| `fleet` | `workspaceId` | `driverId`, `truckId` | Authorized workspace aggregate. |

Invalid, unauthorized, ambiguous, or unresolved scopes must fail closed with a structured reason. They must never fall back to the first driver, first truck, actor name, or all-fleet data.

## Identity resolution

The identity chain required by production is:

```text
authenticated account ID
  -> active workspace membership ID
  -> workspace ID
  -> explicit account-to-driver-profile link (optional)
  -> stable driver profile ID
```

Current evidence is mixed: the runtime has authenticated membership/workspace IDs, a driver `crewId`/`accountId`, and fleet Driver profile IDs, but it does not expose one proven canonical account-to-driver-profile foreign key for every owner/fleet user. Email and display name may help migration review but must not resolve analytics scope.

Required normalization before owner-as-driver `SELF` is generally available:

- Add or consume an authoritative `driverProfile.accountId`/membership link using stable IDs.
- Require at most one active linked Driver profile per account per workspace, or surface ambiguity.
- Preserve profile ID through restore and sync.
- Never infer a link from name, email, phone, unit number, or current truck.

A normal driver account may initially resolve `SELF` from its existing stable CrewBIQ identity bridge. Owner/fleet accounts without an explicit Driver link receive `self_not_linked`; accounts with multiple links receive `self_ambiguous`.

## Entity and ownership model

```text
Workspace/Company
  |-- Truck (truck.id)
  |-- Driver profile (driver.id)
  |-- DriverTruckAssignment (required effective-dated relationship)
  |-- Load/Trip (load.id/record_id; business loadId)
  |     |-- driverId/crewId (normalized driver reference required)
  |     |-- truckId
  |     `-- Document evidence links (future Document Vault)
  |-- PTI (pti.id; driverId/truckId required for scoped analytics)
  |-- Fuel (fuel.id, truckId)
  |-- Maintenance/service (service.id, truckId)
  `-- Exceptions/disputes (stable id, loadId; normalized entity links required)
```

Current truck and Driver profiles contain a current `driver.truckId` relationship and team-driver references. That is presentation/configuration state, not historical assignment evidence.

### Effective-dated truck assignments

Truck analytics must use assignment intervals, not the current Driver profile:

```js
DriverTruckAssignment = {
  id,
  workspaceId,
  truckId,
  driverId,
  effectiveFrom,
  effectiveTo, // null while current
  assignmentType: 'primary' | 'team' | 'temporary',
  source,
  createdAt,
  updatedAt
}
```

Intervals may overlap for legitimate team operation. A truck metric remains attributed to the truck. A driver metric includes only records explicitly linked to that driver or justified by an effective assignment at the record's operational time. Changing today's assigned driver must not rewrite August history.

## Time semantics

- `today`: one operational date in the workspace time zone.
- `week`: canonical workspace/settlement week; current helpers may seed this but must not silently mix ISO and configured settlement weeks.
- `month`: calendar month in workspace time zone.
- `quarter`: calendar quarter; IFTA consumers may later attach jurisdictional quarter rules without changing scope identity.
- `custom`: caller supplies both inclusive bounds; missing or inverted bounds are invalid.

The period resolver owns calendar math. Pure analytics selectors receive resolved bounds and never read the wall clock internally.

Current usable dates include load `pickup`/legacy `date` and `delivery`, fuel/service/expense `date`, settlement `weekKey`/`settlementDate`, dispute `createdAt`/`resolvedAt`, and sync/event timestamps. PTI currently stores a date and ID but not a canonical driver/truck reference. Loads also lack a uniform trip event timeline, so next-stop and on-time metrics remain partial or missing.

For each metric the contract must declare its event date. Revenue and mileage currently use pickup date for compatibility. Future trip analytics should use explicit pickup/delivery event timestamps rather than silently changing this definition.

## Read-scope permissions

UI visibility is not authorization. A trusted permission resolver must authorize the normalized scope before selectors read data.

| Actor capability | Candidate scopes |
| --- | --- |
| Driver | `self` only, unless explicitly granted another scope. |
| Owner-operator | `self` when linked; owned/authorized trucks; authorized company aggregate. |
| Fleet/carrier | Authorized drivers, authorized trucks, and fleet aggregate inside active workspace. |

Permission output should be an explicit allow/deny decision with workspace and entity IDs. Selectors must not accept unverified IDs directly from DOM controls. Cross-workspace aggregation is outside this contract.

## Scope selection and drill-down

Mobile keeps the accepted compact shell. A single compact control such as `My Work v`, `Truck 204 v`, `Askar v`, or `IzzI Motors v` may open a bottom sheet grouped as Personal, Drivers, Trucks, and Fleet. The control displays only authorized options, but the authorization check still occurs below the UI.

Desktop may keep a persistent selector and show more panels or tables. Both surfaces produce the same `AnalyticsScope` and consume the same view models.

Drill-down changes scope rather than opening a duplicate analytics implementation:

```text
Fleet -> Drivers -> Ranking -> Driver
                              |
                              `-> AnalyticsScope(type='driver', driverId=...)
```

## SIDR reuse

The prototype's `crewbiq:chart-select` event is a useful UI signal, not sufficient production evidence. A future explanation request should carry:

```js
{
  scope,
  metricId,
  period: { dateFrom, dateTo, timeZone },
  selectedDate,
  selectedSeries,
  selectedValue,
  relatedEntityIds: { loadIds: [], tripIds: [], driverIds: [], truckIds: [] }
}
```

The analytics engine resolves related IDs from canonical records. SIDR may explain a read result but may not mutate domain records or bypass permissions. Empty related IDs must mean “not available,” not fabricated provenance.

## Audit and IFTA compatibility

The scope model preserves the required chain:

```text
Truck -> effective Driver assignment -> Load/Trip -> Route -> Miles -> Fuel -> IFTA quarter
```

Current load miles and truck-linked fuel are useful foundations, but route/jurisdiction mileage, historical assignment evidence, and Document Vault proof are not complete. IFTA calculations therefore remain outside this slice. Adding them later must extend entity evidence, not redefine `AnalyticsScope`.

## Readiness and blockers

| Capability | Readiness | Reason |
| --- | --- | --- |
| Driver `SELF` period selectors | `PARTIAL` | Current driver/load data is usable; normalized ID/date contracts are still needed. |
| Owner/fleet user `SELF` | `MISSING` | No universally proven stable account-to-Driver link. |
| Selected Driver | `PARTIAL` | Driver profiles have IDs, but records do not uniformly carry canonical `driverId`. |
| Selected Truck | `PARTIAL` | Loads/fuel/service support `truckId`; PTI and historical assignments do not. |
| Fleet aggregate | `PARTIAL` | Current truck finance rollups exist; compliance/evidence/utilization definitions are incomplete. |
| Cross-surface PWA/website reuse | `READY` as architecture | Both must call the same scope/permission/selector contracts. |

Blocking data gaps for broad scope/ranking are `ACCOUNT_DRIVER_LINK`, `EFFECTIVE_DATED_DRIVER_TRUCK_ASSIGNMENT`, `NORMALIZED_RECORD_DRIVER_ID`, and `SCOPED_PTI_ENTITY_IDS`.

## Slice 4B.1b identity refinement

`IDENTITY_ATTRIBUTION_CONTRACT.md` defines the canonical resolution behind these placeholders. `AccountDriverLink` joins the authenticated server Account ID to one roster Driver ID inside a workspace and is distinct from `DriverTruckAssignment`, which relates a Driver to Trucks over effective time. Canonical `driverId` always means roster Driver profile ID; current account `crewId`, restored account-profile `driverId`, local `accountId`, names, email, and unit numbers must not be reinterpreted as that ID.

The existing analytics `authenticated_driver_partition` proof remains valid for a plain driver's own account-scoped records without claiming a roster Driver ID. Owner/fleet SELF and future DRIVER scope require an authorized canonical link and continue to fail `self_not_linked`, `self_ambiguous`, or `self_unauthorized` until one is available.
