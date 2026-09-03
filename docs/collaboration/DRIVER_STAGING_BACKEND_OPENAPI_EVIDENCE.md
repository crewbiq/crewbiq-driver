# Driver staging backend: public OpenAPI composition diagnostic

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Finding: STAGING_BACKEND_OPENAPI_MISMATCH
Execution readiness: BLOCKED

## Authority and method

Previous prerequisite evidence accepted by Claude at
`970598403f6a3c2a1ac673c2eb5b59dacd0bcf27`.
Under standing Product Owner delegation, Codex selected a bounded read-only,
non-SSH public schema diagnostic only. No additional feature implementation,
fixture provisioning, migration, merge or deployment was authorized.

On 2026-09-03, the public staging endpoint
`https://crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app/openapi.json`
returned HTTP 200. SHA-256 of the raw response was:

`53e96581df075756cb340993b970fb7ac43500cb4b757e0f4aedcbab7a38829d`.

Expected schema was generated locally with `app.main.app.openapi()` from
orchestrator HEAD `ce5a591a48f1733b4e21128dece0e0350ace41c2`; the diagnostic
asserted that exact HEAD before comparison. DATABASE_URL was empty and
CREWBIQ_DB_ENABLED=false. No application server/lifespan or migration runner
was started. Routes were compared as HTTP-method/path pairs and operation IDs,
not just by counting paths. No request bodies or authentication tokens were
sent to staging.

## Results

- Accepted schema: 55 HTTP operations.
- Staging schema: 45 HTTP operations.
- Missing from staging schema: 10 accepted operations, listed below.
- Extra staging operations: zero.
- Changed operation IDs among shared operations: zero.

All paths below have prefix `/v1/workspaces/{workspace_id}`:

| Method | Missing path suffix |
| --- | --- |
| GET | /carrier-assignment-proposals |
| GET | /carrier-assignments |
| GET | /truck-ownership |
| POST | /carrier-assignment-proposals |
| POST | /carrier-assignment-proposals/{relationship_id}/decision |
| POST | /carrier-assignments/{relationship_id}/end |
| POST | /carrier-assignments/{relationship_id}/revoke |
| POST | /truck-ownership |
| POST | /truck-ownership/{relationship_id}/close |
| POST | /truck-ownership/{relationship_id}/revoke |

No POST operation was invoked: these are schema entries only. Investigating
their presence does not authorize Carrier/ownership feature development.

## Interpretation and limits

The public staging schema does not match the accepted backend's registered
API composition. Therefore CI success plus /health and /ready cannot establish
that the complete accepted artifact is staged. This is a concrete deployment
composition/provenance discrepancy, not a new defect in the accepted source.

This does NOT establish the exact running source SHA, prove that the omitted
routes return 404, or prove the own-current capability is absent. An old or
custom-served schema is another possible explanation until runtime provenance
is established. The own-current change shares its URL with the old broad
read and is not distinguishable merely from the operation ID.

Request/response component schemas and actual authorization behavior were not
validated by this operation-set comparison. No authenticated/browser journey
was executed and no new security guarantee is claimed.

## Next action and preserved gates

Claude independently reviews the mismatch and its classification. The next
coordinator decision must preserve the no-deploy boundary: choose a bounded
read-only provenance resolution or request explicit authorization for an
exact-SHA staging publication. Do not execute a redeploy as a diagnostic.

Canonical driver-only fixture existence, IA-3 harness compatibility and
authenticated browser/mobile/offline checks remain outstanding. Ten PWA byte
matches remain accepted partial evidence, not full-system proof.
CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED stays queued.

Runtime/product/test/workflow changes: NONE.
SSH, credential retrieval, business-data mutation, merge, deployment and
migration execution: NONE in this diagnostic.
Release readiness: NOT_READY_FOR_PRODUCTION.
