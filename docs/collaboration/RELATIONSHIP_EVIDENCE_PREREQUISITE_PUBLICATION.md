# Canonical Relationship Evidence Prerequisite Publication

## Result

`PUBLISHED / AWAITING CLAUDE REVIEW`

This slice supplies the previously missing server-authoritative, read-only
evidence paths for canonical `TruckOwnership` and `CarrierAssignment`, plus
disconnected PWA adapters that validate those responses fail closed.

## Published commits

- Orchestrator branch: `agent/account-driver-link-read`
- Orchestrator commit: `73551f08775c34ec8cf5a791729177d0e0136df7`
- Driver branch: `agent/pre-base44-audit`
- Driver implementation commit: `a583ccfad3539e9eca8be7d14622c080b88dea39`

## Orchestrator changes

- `migrations/012_relationship_evidence.sql`
  - additive `truck_ownership` and `carrier_assignments` tables;
  - effective-dated status and interval constraints;
  - stable UUID primary keys and restrictive foreign keys;
  - current-record uniqueness/indexes;
  - no backfill, DML, destructive DDL, or migration execution.
- `app/routers/relationship_evidence.py`
  - `GET /v1/workspaces/{workspace_id}/truck-ownership`;
  - `GET /v1/workspaces/{workspace_id}/carrier-assignments`;
  - canonical session via existing `current_user` dependency;
  - exact active-workspace membership, canonical role, and capability checks;
  - server-derived account for ownership;
  - carrier-home filtering with relationship-proven cross-workspace targets;
  - malformed, duplicate, temporal, tenant, account, truck-owner, and
    driver-owner inconsistencies fail closed.
- `app/services/capabilities.py`
  - `canonical.truck_ownership.read` only for canonical `fleet` role;
  - `canonical.carrier_assignment.read` only for canonical `carrier` role.
- Router registration and focused tests were added; one existing exact
  capability fixture was updated for the new fleet read capability.

Orchestrator validation:

```text
pytest -q --tb=short tests/test_relationship_evidence.py tests/test_auth.py tests/test_account_driver_links.py tests/test_driver_truck_assignments.py
50 passed in 2.84s
```

## PWA changes

- `relationship-evidence.js` validates and normalizes current ownership and
  carrier-assignment responses without storage, direct transport, legacy
  truck snapshots, identity inference, first-item selection, or mutation.
- `core-runtime.js` maps two semantic actions to authenticated `no-store` GET
  requests to the exact endpoints above.
- `index.html` loads and lazily composes the adapter but never invokes either
  reader; PresentationContext integration is deliberately absent.
- `sw.js` rotates the cache from `crewbiq-driver-v96` to
  `crewbiq-driver-v97` and caches the new module.
- `package.json` wires the focused contract test into existing tooling.

PWA validation:

```text
node --test tests/relationship-evidence.test.mjs tests/account-driver-link.test.mjs tests/driver-truck-assignment.test.mjs tests/workspace-attribution.test.mjs tests/workspace-driver-roster.test.mjs tests/driver-self-ui.test.mjs tests/load-driver-attribution.test.mjs tests/pti-attribution-context.test.mjs tests/index-startup-composition.test.mjs tests/e2e/service-worker-path.test.mjs tests/hotfix-load-order-contract.test.mjs
97 passed, 0 failed
```

## Preserved boundaries

- No migration was executed.
- No staging or production environment was changed.
- No relationship data was inserted, inferred, migrated, or backfilled.
- No relationship write/admin endpoint was added.
- Legacy records and local carrier snapshots were not modified or promoted.
- No PresentationContext resolver, navigation, scope selector, carrier UI, or
  IA-2 work was started.

The new tables will remain empty until a separately authorized, explicit,
provenance-preserving population path exists. Empty evidence is a valid result;
the adapters never synthesize canonical relationships from legacy data.
