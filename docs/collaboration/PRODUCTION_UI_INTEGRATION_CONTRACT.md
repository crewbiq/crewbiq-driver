# CrewBIQ Next Production UI Integration Contract

## Decision

`READY_FOR_PRODUCTION_UI_INTEGRATION`, limited to a bounded first selector slice with no UI replacement.

The accepted Slice 4A.2 and 4A.3 shell is the visual baseline. Production integration must not copy prototype mock datasets or calculations into `index.html`. It must introduce read-only adapters and pure selectors over current canonical data, contract-test them, and connect one reviewed surface at a time.

The safest first implementation slice is **4B.1a - Driver SELF analytics snapshot and pure period selectors**. It should add no visual shell, no mutations, and no owner/fleet scope. It must reject unresolved scope rather than falling back.

## Production boundary

```text
auth/session + permission resolver
              |
              v
       normalized AnalyticsScope
              |
canonical runtime snapshot adapter (read only)
              |
       pure analytics selectors
              |
       AnalyticsViewModel
              |
accepted mobile or desktop presentation shell
```

Presentation components format and render view models. They do not read `localStorage`, choose a truck, calculate settlement values, infer permissions, or mutate business records.

A future `analytics-engine.js` may own pure aggregation only. It must not own auth, PTI, Loads, forms, persistence, sync, Expenses, or domain mutation. Existing authoritative finance calculations should be wrapped or extracted once, not independently reimplemented.

## Canonical data inventory

| Domain | Current source/shape | Canonical identifiers | Usable time | Scope/relationship evidence | Readiness |
| --- | --- | --- | --- | --- | --- |
| Identity/workspace | authenticated membership plus canonical workspace read; account-scoped local state | account/member ID, `workspaceId`, driver `crewId`/`accountId` | session/fetch timestamps | Workspace is available; owner-to-Driver link is not universally proven | `PARTIAL` |
| Loads/trips | `CrewBIQLoads` state; `id`, `loadId`, gross, driverPay, loaded/dead miles, status, truckId/unit | prefer stable record `id`; `loadId` is business identity | `pickup`/legacy `date`, `delivery`, status timestamps where present | `truckId` exists after assignment; driver reference currently mixes `crewId` and current profile | `PARTIAL` |
| Trucks | scoped truck records; active state, unit, carrier snapshot, maintenance rate | `truck.id` | `updatedAt` is not uniform | Company/workspace ownership is scoped; current assignment is not history | `READY` for current inventory, `PARTIAL` for history |
| Drivers | scoped Driver profiles; compensation, current `truckId`, team mate, active/terminated | `driver.id`; server linkage retained where present | `updatedAt`, `terminatedAt` | Current assignment only; stable account link not universal | `PARTIAL` |
| PTI | `ptiLog`: id, date, odometer, item states, issues, passed, type | `pti.id` | operational `date` | No canonical `driverId` or `truckId`; photo evidence absent | `PARTIAL` for self status, `MISSING` for scoped compliance |
| Fuel/DEF | scoped `fuelLogs`: id, date, odometer, gallons/cost, MPG/PPG, truckId | `fuel.id`, `truckId` | `date`; OCR entries add `createdAt` | Strong truck link; OCR retains request/document keys but not source binary | `READY` for truck totals, `PARTIAL` for audit/driver attribution |
| Expenses | scoped expenses: id, date, type, amount, owner label, optional loadId, status, odometer | `expense.id`, optional business `loadId` | `date`, `createdAt` | Owner is an enum, not stable entity ID; general truckId absent | `PARTIAL` |
| Deductions/settlements | templates, effective periods, immutable weekly snapshots, truck settlement resolution | template/snapshot IDs, `truckId`, `weekKey` | effective dates, week/settlement dates | Strong truck-period finance logic with overlap guards | `READY` through existing authoritative calculator |
| Maintenance/service | scoped service logs: id, date, odometer, amount/category, truckId, createdAt | `service.id`, `truckId` | `date`, `createdAt` | Strong truck link; evidence file linkage incomplete | `READY` for cost totals, `PARTIAL` for evidence |
| Documents/OCR | transient extraction/review; imported records retain request/document/dedupe metadata | request/source keys, operational record IDs | invoice/record date, `createdAt` | Original binary and canonical Document Vault link are missing | `PARTIAL` for review, `MISSING` for completeness/audit proof |
| Sync | record `synced`; offline queue status; orchestrator copy status/events | record IDs, queue record IDs, device ID | queue/status/event timestamps | Global/account operational signal, not an analytics subject metric | `READY` for status display |
| Exceptions/disputes | disputes linked by `loadId`; unassigned fleet loads; sync conflicts | dispute ID where present, `loadId` | `createdAt`, `resolvedAt` | Can count known issues; no unified exception taxonomy/severity | `PARTIAL` |

Canonical ID precedence for selectors is workspace ID, record/entity ID, then explicitly documented legacy aliases during normalization. Unit number, email, name, and array position are never canonical joins.

## Driver Today mapping

| UI component | Real source | Current function(s) | Required aggregation | Scope support | Readiness |
| --- | --- | --- | --- | --- | --- |
| Net pay | load `driverPay` for non-cancelled/non-disputed period loads | `CrewBIQLoads.renderHome`, `renderStats` | Sum by normalized driver and period | `self` now; selected driver after ID normalization | `PARTIAL` |
| Gross | load `gross` | `renderHome`, `renderStats` | Sum accepted period loads | same | `PARTIAL` |
| Loaded miles | load `loadedMiles` | `renderHome`, `renderStats` | Sum by scope/period | same | `PARTIAL` |
| Deadhead miles | load `deadMiles` | `renderHome`, `renderStats` | Sum by scope/period | same | `PARTIAL` |
| RPM | gross / loaded+dead miles under current stats semantics | `renderStats` (`stGpm`) | Safe zero denominator and documented metric definition | same | `PARTIAL` |
| Loads | load records/status | `getWeekLoads`, `renderHome` | Count after status policy | same | `PARTIAL` |
| Current truck | Driver profile/unit and truck lookup | `resolveDefaultTruck`, `findTruckByIdOrUnit` | Explicit current link only | `self` | `PARTIAL` |
| PTI state | `ptiLog` today's record | `needsPTI`, `renderHome`, `renderPTIPage` | Latest record for scope/date | self only today; no entity IDs | `PARTIAL` |
| Sync state | offline queue and orchestrator status | `pendingStatus`, `setSyncUI`, sync events | Compose queue/copy status | actor/workspace operational state | `READY` |
| Documents needing review | transient OCR review and future Vault | OCR review modules | Count unresolved review/evidence tasks | not reliably scoped | `MISSING` |
| Earnings chart | load gross/pay by operational day | existing load fields; no production series selector | Group by day | self first | `FUTURE_LAYER` |
| Loaded/deadhead chart | load mileage by day | existing load fields | Group two series by day | self first | `FUTURE_LAYER` |
| Recent activity | newest sorted loads, PTI/sync events separately | `_sortLoads`, `renderHome` | Normalize timeline and dedupe | self partial | `PARTIAL` |
| Quick actions | accepted navigation model/routes | `navigation-model.js`, `showPage` | None; capability/permission filter | role-visible today, authorization future | `READY` as navigation |

## Owner-operator Today mapping

| UI component | Real source/current function | Aggregation and scope | Readiness |
| --- | --- | --- | --- |
| Gross | `ownerFinanceForTruck` / settlement wrapper | Sum authorized truck loads by period | `READY` for truck/fleet; owner personal scope `PARTIAL` |
| Net | truck finance `realNet` | Existing gross - driver pay - fuel - service - carrier/deductions | `READY` through authoritative calculator |
| Fuel | `fuelLogs`, finance `fuelCost` | Truck/period sum including DEF | `READY` |
| RPM / real CPM | finance gross or realNet divided by miles | Metric name/definition must be explicit | `PARTIAL` |
| Reserve | truck maintenance rate/service-fund presentation | Define whether reserve is accrued, balance, or recommendation | `PARTIAL` |
| Truck status | active truck/current Driver profile assignment | Current inventory status, not historical utilization | `PARTIAL` |
| Receipt review | OCR review plus expense status | Normalize review tasks and source evidence | `PARTIAL`; Vault missing |
| Revenue/net analytics | load and authoritative finance results | Day/period series per authorized truck(s) | `FUTURE_LAYER` |
| Miles analytics | load mileage | Day/period loaded/dead series | `FUTURE_LAYER` |
| Fuel/RPM analytics | fuel logs + load miles/finance | Time-aligned truck series | `FUTURE_LAYER` |

## Fleet Today mapping

| UI component | Real source/current function | Aggregation and scope | Readiness |
| --- | --- | --- | --- |
| Active trucks | scoped trucks, `activeTrucks` | Count `active !== false` | `READY` |
| Drivers | Driver profiles, `renderDriversPage` | Count active profiles | `READY` |
| Gross | `renderFleetPage`, `renderFleetStats`, finance wrapper | Sum authorized truck finance | `READY` |
| Active loads | loads/status and fleet load resolution | Count period loads under explicit status policy | `READY` |
| Exceptions | disputes plus unresolved/unassigned loads | Unified categories, severity, and dedupe required | `PARTIAL` |
| Fleet gross series | loads grouped by day | Pure fleet selector | `FUTURE_LAYER` |
| Fleet utilization | active/available capacity vs moving trucks | Define availability and movement event | `MISSING` |
| PTI compliance | PTI records | Denominator/policy plus driver/truck IDs required | `MISSING` |
| Evidence completeness | Document Vault/evidence requirements | Required-vs-present evidence by load/trip | `MISSING` |
| Open exceptions | disputes/unassigned/sync review | Normalize open-state taxonomy | `PARTIAL` |

## Hub mapping

| Hub signal | Current derivation | Readiness |
| --- | --- | --- |
| Work: active loads | load status and period filters | `READY` |
| Work: next stop | pickup/delivery strings exist, but no normalized stop sequence/current-leg event | `PARTIAL` |
| Work: missing documents | no canonical required-document/Vault inventory | `MISSING` |
| Truck: PTI | today's PTI exists; truck/driver attribution missing | `PARTIAL` |
| Truck: fuel | truck-linked dated fuel logs | `READY` |
| Truck: maintenance | truck-linked dated service logs | `READY` |
| Money: net | authoritative truck finance | `READY` for truck/fleet |
| Money: RPM | derivable but definition must be fixed | `PARTIAL` |
| Money: pending receipts | expense statuses and transient OCR are insufficient for canonical receipt tasks | `PARTIAL` |
| Team/Fleet: active trucks | active truck inventory | `READY` |
| Team/Fleet: drivers | active Driver profiles | `READY` |
| Team/Fleet: exceptions | disputes and unassigned loads only | `PARTIAL` |

## Driver performance and ranking foundation

No composite score is approved in this slice. Gross revenue alone must never label a driver “best.” Future output should expose dimensions separately and show missing evidence.

| Dimension | Metric | Current evidence | Readiness |
| --- | --- | --- | --- |
| Production | revenue, loaded/dead miles, loads completed | Load fields/status exist; driver ID attribution is inconsistent | `PARTIAL` |
| Efficiency | deadhead %, RPM | Pure derivation from loads after attribution | `PARTIAL` |
| Efficiency | MPG, fuel cost/mile | Truck-linked fuel exists; driver attribution requires effective assignments | `PARTIAL` |
| Compliance | PTI compliance | PTI date/pass exists; entity IDs and policy denominator missing | `MISSING` |
| Compliance | document completeness, missing POD/BOL | Document Vault/requirements missing | `MISSING` |
| Reliability | exceptions/disputes | Load-linked disputes exist; taxonomy incomplete | `PARTIAL` |
| Reliability | on-time performance | No proven planned-vs-actual stop timestamps | `MISSING` |
| Safety | safety signals | No canonical safety dataset in inspected runtime | `MISSING` |

Ranking readiness is `NOT_READY`. Preconditions are normalized driver IDs on contributing records, effective-dated assignments, metric definitions/denominators, minimum sample rules, permission checks, and transparent missing-data handling. When available, selecting a ranked driver creates a Driver scope and reuses the same engine/dashboard.

## Proposed pure analytics API

```js
createAnalyticsSnapshot(runtimeState)
normalizeAnalyticsScope(requestedScope, actorContext)
authorizeAnalyticsScope(scope, permissionSnapshot)
getDashboardMetrics(snapshot, scope)
getEarningsSeries(snapshot, scope)
getMileageSeries(snapshot, scope)
getFleetUtilization(snapshot, scope)
getDriverPerformance(snapshot, driverScope)
getComplianceSummary(snapshot, scope)
getRelatedEntities(snapshot, scope, metricSelection)
```

Selectors return values plus provenance metadata such as metric definition, source record IDs, period, missing-data flags, and calculation version. They must not write, sync, call DOM APIs, or silently broaden scope.

## PWA, website, SIDR, and audit alignment

- Mobile PWA is the operational shell; `crewbiq.com` may be a larger analytical/command shell.
- Both use the same identity, workspace, entities, permissions, `AnalyticsScope`, selectors, and view-model contracts. The website is not a second backend.
- Chart selections may request related canonical IDs for future SIDR explanation. SIDR receives authorized read context and cannot write domain data.
- The model is compatible with the future Truck -> Driver assignment -> Trip -> Route -> Miles -> Fuel -> IFTA quarter chain, but route/jurisdiction and evidence retention are not implemented.

## Bounded integration sequence

1. **4B.1a:** Add read-only runtime snapshot adapter, normalized period resolver, Driver `SELF` scope validation, and pure load-based metrics/series. No UI and no fallback.
2. **4B.1b:** Add explicit account-to-Driver link contract and normalized record `driverId`; introduce effective-dated assignment storage only through a separately reviewed domain slice.
3. **4B.2:** Connect real Driver Today read-only view models behind contract tests; retain current production navigation/startup.
4. **4B.3:** Connect Owner-Op Today using existing authoritative truck finance; do not duplicate net/deduction math.
5. **4B.4:** Connect Fleet Today READY metrics; show explicit unavailable states for utilization/compliance/evidence.
6. **4B.5:** Add authorized compact scope selector and shared desktop selector/drill-down semantics.
7. **4B.6:** Build driver-performance metric facts only after attribution prerequisites; scoring/ranking requires separate product approval.

## Blocking findings and guardrails

There is no blocker to 4B.1a. Broader production scope is blocked by:

- `ACCOUNT_DRIVER_LINK`: owner-as-driver cannot rely on names or email.
- `NORMALIZED_RECORD_DRIVER_ID`: load/OCR/PTI records do not uniformly reference Driver profile IDs.
- `EFFECTIVE_DATED_DRIVER_TRUCK_ASSIGNMENT`: current profile assignment cannot explain history.
- `PTI_SCOPE_AND_POLICY`: PTI lacks driver/truck IDs and a fleet compliance denominator.
- `DOCUMENT_EVIDENCE_MODEL`: Document Vault and required-document inventory are missing.
- `UTILIZATION_DEFINITION`: available capacity and movement semantics are not approved.

Every implementation slice must preserve production hashes outside its allowed files, run existing startup/navigation/domain contracts, and add selector fixtures for zero data, ambiguous identity, unauthorized scope, mixed trucks/drivers, assignment changes, period boundaries, and double-count prevention.

## Slice 4B.1b identity dependency

Production owner/fleet SELF and selected-Driver integration must consume a server-authoritative `AccountDriverLink`; they may not match account and roster records by email/name or treat current account `crewId` as roster `driverId`. Historical Driver/Truck analytics separately depends on effective-dated `DriverTruckAssignment`. The accepted first identity implementation boundary is 4B.1b.1 server schema, authorization, read endpoint, and PWA read-only adapter, with no business-record migration.
