# CrewBIQ Identity and Record Attribution Contract

## Decision and scope

`READY_FOR_IDENTITY_ATTRIBUTION_IMPLEMENTATION`, beginning with a server-authoritative `AccountDriverLink` schema and read API. This Slice 4B.1b is discovery and contract only. It changes no runtime, persistence, business record, UI, or migration.

This contract separates four identifiers that current code can otherwise make look interchangeable:

1. Authenticated Account identity.
2. Workspace tenancy identity.
3. Driver roster entity identity.
4. Truck entity identity.

Names, email addresses, unit numbers, roles, current/default entities, and array position are labels or context. They are never canonical joins.

## Current identifier inventory

`Canonical` below means suitable as a stable join inside its stated scope. It does not imply that every current record already carries the field.

| Domain | Current field | Source and scope | Stability/editability | Classification | Join suitability |
| --- | --- | --- | --- | --- | --- |
| Auth session | `sessionToken` | authenticated transport | Rotating secret; not user-editable | Credential, not entity ID | Never persist as attribution |
| Account | `crewbiq_id` -> `driver.crewId` | server restore/account identity | Server-assigned; not a profile label | Current canonical Account ID in `crewbiq_account` namespace | Yes for Account joins and current account-owned records |
| Account | restored `driver.driverId` | `core-runtime.js`/restore currently aliases `crewId` | Stable only as Account alias | Legacy semantic alias, not roster Driver ID | No Driver-profile join |
| Account | `driver.accountId` | locally generated device account registry | Stable on that device/account registry; not server-global | Local canonical partition ID only | Local storage scope only; never canonical cross-channel link |
| Account | `email` | profile/login fallback | User-editable | Legacy identity hint | No |
| Account partition | `ownerKey`, identity/data key | derived from `crewId`, else email slug | Derived; email fallback may change | Local partition key | Storage lookup only, not domain FK |
| Device | `deviceId` | local sync client | Device-stable | Technical ID | Sync diagnostics only |
| Workspace | membership `workspace.id`; cached `workspaceId` | authenticated Orchestrator membership | Server-assigned | Canonical tenancy ID | Yes; mandatory on canonical relations |
| Company | local `company.id` | account-scoped Company records | Stable locally; not user-editable in forms | Canonical local Company entity ID | Yes inside its workspace/local model |
| Company | `canonicalCompanyId`/canonical company reference | capability-gated platform registry | Server-assigned external reference | Canonical platform Company ID when present | Yes only with explicit namespace and workspace authorization |
| Company | name, legal name, MC/DOT, `companyRef` snapshots | editable local Company/carrier data | Editable or point-in-time snapshot | Business identifiers/snapshots | Search/display; not primary join |
| Driver entity | roster profile `driver.id` | scoped Driver profiles | Stable record ID; not an editable form label | Canonical Driver ID for this contract | Yes inside workspace |
| Driver entity | `truckId` | roster profile | Editable current assignment | Current configuration FK | Yes for current display, not historical attribution |
| Driver entity | `teamMateDriverId` | roster profile | Editable current relationship | Canonical roster FK | Yes for current team relation only |
| Driver entity | name/email/phone | roster profile | User/admin-editable | Labels/contact data | No |
| Truck entity | `truck.id` | scoped truck records | Stable entity ID | Canonical Truck ID | Yes inside workspace |
| Truck entity | `unitNumber` | truck profile and legacy records | Business-editable and potentially reused | Display/business identifier; legacy alias | No primary join |
| Truck entity | make/model/name/plate/VIN-like display fields | truck profile | Editable; plate may change | Attributes | No primary join |
| Load/trip record | `id`/`record_id` | local/cloud record identity | Intended stable record ID | Canonical technical record ID when present | Yes |
| Load/trip business | `loadId` | operational load number | Business identifier; current code also uses as fallback identity | Canonical business reference, not guaranteed globally unique | Join only with workspace and documented uniqueness |
| Load attribution | `crewId`, `driverEmail` | account stamping and sync | `crewId` is Account identity; email editable | Current Account attribution plus legacy hint | `crewId` can prove account partition; neither is roster `driverId` |
| Load attribution | `truckId`, `unitNumber` | explicit truck selection plus legacy mirror | `truckId` stable; unit editable | Canonical Truck FK plus display alias | Join by `truckId` only |
| Load time | `pickup`/legacy `date`, `delivery`, status timestamps | load record | Operational values may be edited with workflow | Current period evidence | Usable when metric declares event semantics |
| PTI | `id` | PTI submission | Locally generated stable record ID | Canonical PTI record ID locally | Yes |
| PTI attribution | stamped `crewId`/owner partition | save/load/sync layer | Account-level only | Current Account evidence | Not roster Driver attribution |
| PTI attribution | `driverId`, `truckId` | absent from current PTI record shape | Missing | Required future FKs | Not currently joinable |
| PTI time/evidence | `date`, odometer, item states, issues, pass/type | PTI record | Date-only operational evidence | Partial evidence | Timestamp/photo/policy provenance missing |
| Fuel/DEF | `id`, `truckId`, `date` | fuel logs/manual or OCR | Stable record/truck link; date editable | Canonical record and Truck FK | Yes for truck/date analytics |
| Fuel/DEF legacy | `unitNumber`, `driverName` | OCR/display snapshots | Editable/extracted text | Legacy/context only | No Driver/Truck primary join |
| Fuel OCR provenance | `sourceRequestId`, `sourceDocumentType`, `sourceStopKey`, invoice number | OCR import | Stable dedupe/provenance hints | Source metadata, not Document entity ID | Useful for dedupe; insufficient for Vault chain |
| Expense | `id`, optional `loadId`, `date` | scoped expense records | Stable record ID; load reference manually entered | Canonical expense ID, conditional business reference | Expense ID yes; load join requires validation |
| Expense attribution | `owner` enum (`driver`, `codriver`, `both`, `truck`, `company`, `load`) | expense form | User-selectable category | Legacy semantic label | No entity join; normalized IDs missing |
| Maintenance/service | `id`, `truckId`, `date` | service logs | Stable record and Truck FK | Canonical record/Truck attribution | Yes for truck analytics |
| Document/OCR | `request_id`/`sourceRequestId`, document type, invoice/source keys | extraction/review | Transport/import identity | Provenance hint | No canonical Document Vault ID yet |
| Document attribution | `truckId` in imported fuel/service; names/unit snapshots | review/import | Mixed stable ID and labels | Partial | Truck join where ID exists; Driver join absent |
| Settlement | snapshot `id`, `truckId`, `weekKey`, `settlementDate` | weekly deduction/settlement resolution | Stable immutable/derived period records | Canonical truck-period identity | Yes for truck-period joins |
| Settlement load reference | `loadId` resolved from current load identifiers | deduction-trip resolution | Depends on source identity | Business/technical reference | Join only with workspace and source rules |
| Settlement Driver attribution | calculated from current profiles/truck context | finance projection | Derived from current configuration | Derived-only, not historical proof | No canonical historical Driver join |
| Dispute/exception | dispute `id`, `loadId`, `createdAt`/`resolvedAt`; tombstone | dispute lifecycle | Record ID and durable tombstone | Canonical dispute record plus load reference | Driver/Truck must follow proven linked load or explicit future FKs |
| Generic exception | unassigned/sync/review conditions | multiple modules | Heterogeneous | No unified canonical exception entity yet | Not a cross-domain join |

The current comment/code path that aliases restored `driverId` to `crewId` is retained as an Account-profile compatibility alias. This contract does not reinterpret it as fleet roster `driver.id`.

## Canonical namespaces

Every API and persisted relation must make namespace and workspace unambiguous:

```text
Account ID: crewbiq_account:<crewbiq_id>
Workspace ID: crewbiq_workspace:<workspace_id>
Driver ID: crewbiq_driver:<driver_profile.id>
Truck ID: crewbiq_truck:<truck.id>
```

Storage may use native IDs rather than prefixed strings, but schema and API documentation must identify the namespace. The device-local `driver.accountId` is not the Account ID in `AccountDriverLink`.

## AccountDriverLink

`AccountDriverLink` connects an authenticated Account to a Driver entity in one workspace. It does not assign that Driver to a truck.

```js
AccountDriverLink = {
  id,                    // immutable relation ID
  workspaceId,           // canonical tenancy boundary
  accountId,             // canonical server Account ID (current source: crewbiq_id)
  driverId,              // canonical roster Driver profile ID
  status: 'active' | 'inactive' | 'revoked',
  effectiveFrom,         // inclusive timestamp
  effectiveTo: null,     // exclusive timestamp when closed
  source: 'onboarding' | 'workspace_admin' | 'verified_import' | 'system_backfill',
  createdAt,
  updatedAt,
  createdByAccountId,
  provenance: { evidenceType, evidenceId, schemaVersion }
}
```

### Invariants

- Account, Driver, and link belong to the same workspace.
- At most one active effective link may resolve for an Account/workspace instant.
- An Account may have no Driver link.
- Driver-role, owner-operator, and fleet-owner Accounts use the same relation shape.
- Historical links are closed, never overwritten or deleted to hide prior attribution.
- Re-linking creates or activates an auditable interval; it does not rewrite old business records.
- Duplicate or overlapping active links are invalid data and resolve as ambiguous.
- Name, email, unit, role, roster count, truck assignment, and array position cannot create or select a link.

## SELF resolution

```text
authenticated Account
  -> authorized Workspace membership
  -> active AccountDriverLink at requested time
  -> Driver profile in same Workspace
```

Results align with `analytics.js`:

| Result | Condition |
| --- | --- |
| Success | Exactly one effective, authorized, stable-ID link and existing Driver entity. |
| `self_not_linked` | No effective link. |
| `self_ambiguous` | Multiple effective links, duplicate candidates, or conflicting identity evidence. |
| `self_unauthorized` | Missing/denied membership, cross-workspace entity, revoked link, or unauthorized scope. |

`analytics.js` currently also accepts `authenticated_driver_partition` to prove a plain driver account's own account-scoped records without claiming a fleet Driver-profile ID. That transitional proof remains distinct from `canonical_account_driver_link`. A future adapter may emit the canonical proof only after reading an authorized `AccountDriverLink`; analytics must not query storage or infer the link itself.

## DriverTruckAssignment

`DriverTruckAssignment` records operational assignment over time. It is independent of login identity.

```js
DriverTruckAssignment = {
  id,
  workspaceId,
  driverId,
  truckId,
  effectiveFrom,       // inclusive timestamp
  effectiveTo: null,   // exclusive timestamp
  assignmentType: 'solo' | 'team' | 'temporary' | 'other',
  status: 'active' | 'closed' | 'revoked',
  createdAt,
  updatedAt,
  createdByAccountId,
  provenance: { evidenceType, evidenceId, schemaVersion }
}
```

Multiple Drivers may have overlapping intervals on one truck for team operation. One Driver should not have conflicting solo assignments unless explicitly reviewed. Current `driver.truckId` and `teamMateDriverId` remain current configuration projections; they are not historical source of truth.

## Normalized record attribution

Canonical `driverId` always means roster Driver entity ID. Canonical `truckId` always means Truck entity ID. Names and unit numbers may remain immutable snapshots for display but never substitute for these FKs.

| Record type | Future `driverId` | Future `truckId` | Attribution rule |
| --- | --- | --- | --- |
| New load/trip | Required | Required | Explicit subject at creation; assignment may validate but not silently choose. |
| Existing load/trip | Proven-only backfill | Proven-only backfill; current ID retained where valid | Never infer from current profile or first entity. |
| PTI | Required | Required | Captured from authorized inspection context at submission. |
| Fuel/DEF | Optional when Driver fact is claimed | Required | Truck owns fuel fact; Driver only when explicitly known or uniquely proven for event time. |
| General expense | Conditional | Conditional | Add stable IDs only for the selected entity subject; legacy owner enum is not attribution. Multi-driver allocation requires separate allocations, not a fake singular ID. |
| Maintenance/service | Optional | Required | Truck owns service fact; Driver generally not applicable unless event explicitly concerns a Driver. |
| Document/Vault item | Conditional | Conditional | Link to every proven subject plus source record; absence remains explicit. |
| Exception/dispute | Required for Driver-specific exception; otherwise derived from immutable linked record | Same | Store explicit subject when exception semantics require it; otherwise resolve from proven record chain. |
| Driver settlement/pay fact | Required | Required when truck-based | Freeze subject IDs with period/calculation provenance. |
| Truck-only aggregate snapshot | Not applicable | Required | Do not add a Driver merely because one is currently assigned. |
| Account/sync event | Not applicable or derived-only | Not applicable or derived-only | Account operational event is not automatically Driver work. |

## Minimum load/trip attribution shape

This contract does not redesign Loads. The minimum future analytics-safe extension is:

```js
{
  id, loadId, workspaceId, driverId, truckId,
  startedAt, completedAt,
  gross, loadedMiles, deadheadMiles,
  attribution: { source, confidence: 'proven', attributedAt, evidenceIds: [] }
}
```

Current pickup/date and delivery fields may map to timestamps only through a separately reviewed compatibility rule. `loadId` remains the business number; stable record `id` remains the technical identity.

## PTI evidence attribution

Future PTI evidence requires:

```js
{
  ptiId, workspaceId, driverId, truckId,
  inspectedAt, timeZone,
  policyId, cadence, checklistVersion,
  odometer, result, defectIds: [],
  photoEvidenceIds: [], documentEvidenceIds: [],
  attribution: { source: 'explicit'|'session', confidence: 'proven', attributedAt }
}
```

This supports Driver and Truck compliance, weekly photo PTI, carrier audit, maintenance linkage, and future Document Vault references. Current date-only PTI records remain partial and must not be bulk-attributed from today's assignment.

## Legacy classification and migration rules

Every candidate record is classified before any future write:

| Class | Definition | Future action |
| --- | --- | --- |
| `PROVEN` | Stable IDs already present, or one deterministic authorized relation/effective assignment matches the record event time with no conflicting evidence. | May be backfilled by idempotent, audited tooling after dry-run review. |
| `AMBIGUOUS` | Multiple candidate Drivers/Trucks, overlapping conflicting assignments, inconsistent aliases, or uncertain event time. | Preserve unresolved; queue for explicit review. |
| `UNRESOLVABLE` | No stable evidence chain exists. | Preserve unresolved permanently unless new primary evidence is supplied. |

Single available Driver/truck, current assignment, matching name/email/unit, role, likely route, or array order never upgrades a record to `PROVEN`. Backfill must be idempotent, workspace-scoped, reversible by audit event, and must not overwrite an existing verified attribution.

## Provenance

Any new or backfilled attribution carries:

```js
{
  attributionSource: 'explicit' | 'session' | 'assignment' | 'migration_proven' | 'manual_admin',
  attributionConfidence: 'proven',
  attributedAt,
  attributedByAccountId,
  evidenceIds: [],
  schemaVersion
}
```

There is no probabilistic score. If evidence is not proven, canonical IDs remain null/unresolved. `manual_admin` requires an authorized, audited server action and does not erase the prior unresolved state/history.

## Permissions and ownership

- Backend/server authorization is mandatory; UI visibility is not authorization.
- A Driver cannot arbitrarily link their Account to another Driver profile.
- An authorized workspace owner/admin may create, close, or correct links according to workspace policy.
- Cross-workspace links and joins are invalid even if raw IDs happen to match.
- APIs must verify Account membership, Driver/Truck workspace ownership, effective interval, and action capability.
- Relation changes emit durable audit events and preserve prior intervals.

The same server relation and normalized IDs are consumed by mobile PWA, `crewbiq.com`, SIDR read/admin tools, analytics, and audit tooling. Channel-specific identity tables are prohibited.

## Document Vault and IFTA/IRP compatibility

The model supports the future evidence chain:

```text
Workspace -> Truck -> effective Driver assignment -> Load/Trip
          -> Route -> jurisdiction Miles -> Fuel -> Documents -> IFTA quarter
```

AccountDriverLink proves who a user can resolve as SELF. DriverTruckAssignment proves operational truck context over time. Neither substitutes for source documents, route facts, fuel receipts, or immutable record IDs. Document Vault IDs and hashes remain a separate evidence layer.

## Bounded implementation sequence

1. **4B.1b.1 - Server-authoritative AccountDriverLink foundation:** schema, non-overlap/workspace constraints, authorized read endpoint, audit events, and PWA read-only adapter contract. No business-record migration.
2. **4B.1b.2 - New-record attribution only:** require normalized `workspaceId`/`driverId`/`truckId` on newly created Loads and PTI first; extend other domains separately. No legacy backfill.
3. **4B.1b.3 - Effective-dated DriverTruckAssignment:** server schema, team overlap rules, authorized mutations, current projections, and history reads.
4. **4B.1b.4 - Legacy attribution tooling:** dry-run inventory, `PROVEN`-only idempotent backfill, ambiguous/unresolvable queues, audit export, and rollback metadata.
5. **4B.2 - Real Driver SELF UI:** consume accepted analytics selectors through an authorized canonical link; plain driver partition remains supported during transition.

The exact safest first implementation slice is **4B.1b.1**, with server constraints/read authorization and a read-only PWA adapter before any write path or migration.

## Readiness and blockers

| Area | Readiness |
| --- | --- |
| AccountDriverLink contract | `READY` for server schema/read implementation |
| DriverTruckAssignment contract | `READY` for a later independent foundation slice |
| Normalized `driverId` on new records | `READY` after AccountDriverLink read foundation; domain-by-domain writes still require contracts |
| Normalized `truckId` on new records | `READY` where explicit truck selection already exists; PTI/new domain writes remain later slices |
| Legacy migration | `NOT_READY` for execution; classification and guardrails are ready |
| Audit/IFTA identity chain | `COMPATIBLE`, with route/jurisdiction/Vault evidence still missing |

No blocker prevents 4B.1b.1. Cross-repository ownership of the server schema/endpoint must be assigned before implementation, but it does not require changing this contract.

## Slice 4B.1b.2 discovery outcome

Slice 4B.1b.2 is `BLOCKED` before runtime implementation. The current repository does not prove backend round-trip persistence for normalized Load/PTI fields, the canonical AccountDriverLink read path remains disconnected, and PTI creation has no explicit stable Truck plus roster Driver attribution context.

The accepted identity distinctions remain mandatory: `crewId` is not a roster `Driver.id`, email/name matching is not identity proof, and first/default-truck selection is forbidden. See `NORMALIZED_RECORD_ID_CONTRACT.md` for the creation-path inventory, evidence boundary, and bounded prerequisites.

### Slice 4B.1b.2a workspace-only status

Explicit workspace attribution is implemented for new Load/PTI creation only. It requires an authenticated Orchestrator token plus an explicit active workspace ID that matches exactly one returned membership. Unresolved, ambiguous, or unauthorized context produces no `workspaceId`; no first-item/default fallback exists. Driver and PTI Truck attribution remain blocked and unchanged.
