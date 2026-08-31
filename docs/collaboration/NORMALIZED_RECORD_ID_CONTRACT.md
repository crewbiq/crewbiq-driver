# Normalized Record ID Contract - Slice 4B.1b.2 Discovery

Status: `BLOCKED`

## Scope

This contract covers normalized `workspaceId`, `driverId`, and `truckId` attribution for newly created Load and PTI records only. It does not authorize legacy backfill, migration, inferred identity, or changes to other record families.

## Creation-path inventory

| Record | Creation path | Proven context |
| --- | --- | --- |
| Load | `loads.js::saveLoad()` when no existing `editId` is present | The selected truck can provide a stable `truckId`. No universally proven canonical `workspaceId` or roster `driverId` is available in this path. |
| PTI | `pti.js::submitPTI()` for both daily and weekly records | The constructor has no explicit stable truck selection or canonical roster Driver context. |

Load edits, status/dispute mutations, and unassigned-load resolution are mutations of existing records, not new-record constructors, and are outside this slice. There is no separate photo-PTI constructor.

## Attribution rules

- `workspaceId` may be written only from a proven active workspace membership/context.
- `driverId` may be written only from the canonical roster Driver entity or an accepted `AccountDriverLink` read result.
- `truckId` may be written only from an explicit stable Truck entity selection/context.
- Email, display name, `crewId`, unit number, first matching record, and default/first-truck fallbacks are not valid substitutes.
- Missing proof must produce `null`/absence, never a guessed identifier.

## Persistence evidence

- Local save serializes complete Load/PTI objects and therefore preserves additional fields client-side.
- Sync payload construction and the offline queue preserve complete record objects client-side.
- Client restore applies returned Load/PTI arrays without deliberately removing these fields.
- The backend persistence implementation is external to this repository. This repository cannot prove that unknown normalized fields are stored and returned rather than silently stripped.

Client pass-through is not sufficient evidence of the required server round-trip guarantee.

## Blocking findings

1. `SERVER_NORMALIZED_ID_ROUNDTRIP_UNPROVEN`: no backend implementation or integration contract in this repository proves persistence and restore of the three fields.
2. `CANONICAL_ACCOUNT_DRIVER_LINK_READ_PENDING`: the accepted PWA adapter is disconnected and cannot yet supply a canonical roster `driverId` to record constructors.
3. `PTI_EXPLICIT_ATTRIBUTION_CONTEXT_MISSING`: PTI creation has no proven explicit stable Truck and roster Driver context.
4. `WORKSPACE_CONTEXT_NOT_UNIVERSAL`: Orchestrator membership can prove a workspace when present, but the Load/PTI creation paths do not have a universal accepted workspace resolver.

## Decision

`SLICE_4B_1B_2_BLOCKED`

No runtime files were changed. Implementing fields now would either guess identity, normalize a legacy alias, or claim an unproven server persistence guarantee.

## Required bounded prerequisites

- Establish and test the backend storage/restore contract for normalized Load/PTI IDs.
- Compose the accepted AccountDriverLink read adapter, or provide another explicit canonical Driver selection source.
- Provide explicit PTI Truck/Driver attribution context without default or first-match fallback.
- Define one accepted active-workspace resolver for these constructors.

After those prerequisites are accepted, resume this slice with new-record-only writes and the required local, sync, offline, restore, and reader compatibility tests. Legacy records must remain unchanged.
