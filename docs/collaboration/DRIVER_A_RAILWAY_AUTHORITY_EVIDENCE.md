# Driver A RailwayAuthority provider: fake-response evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW
No live provider invocation, staging preflight or fixture mutation performed.

## References and scope

- Authorization: `380e073ed810423cdc78dead57c6e566dd08ad24`, under DEFAULT DELEGATED AUTHORITY.
- Accepted adapter: `d1c13cdfefe2f6db6644f72363f365863fceab0c`.
- Independent adapter review: `386832ab1b8f8990fdf9e9fe45bb2e74729c7edc`.
- Provider implementation: `010dffe29c10d0d5d2a11f35c640eda20c4a9927`.
- Orchestrator branch: `agent/account-driver-link-read`.
- Files: `app/testing/driver_a_railway_authority.py`, `tests/test_driver_a_railway_authority.py` only.

The new concrete provider implements the accepted RailwayAuthority protocol.
The adapter, shared validators, runtime, auth, schemas, migrations, workflows,
settings and existing tests were not edited.

## Authoritative transport discovery

Unauthenticated GraphQL introspection at Railway's official endpoint,
`https://backboard.railway.app/graphql/v2`, established actual query arguments,
return types, metadata fields and TCPProxySyncStatus enum. No project data,
service variables, DB credentials or authenticated target query was requested
in discovery. This was public schema inspection, not live provider execution.

Confirmed read-only shapes:

- `project(id: String!)` returns Project with id/deletedAt.
- `environment(id: String!, projectId: String)` returns Environment with id/projectId/deletedAt.
- `service(id: String!)` returns Service with id/projectId/deletedAt.
- `serviceInstance(environmentId: String!, serviceId: String!)` returns id/environmentId/serviceId/deletedAt.
- `tcpProxies(environmentId: String!, serviceId: String!)` returns TCPProxy list with id, domain, proxyPort, applicationPort, environmentId, serviceId, deletedAt and syncStatus.
- `variables(projectId: String!, environmentId: String!, serviceId: String, unrendered: Boolean)` returns EnvironmentVariables scalar. Provider always supplies the exact service ID and `unrendered: false`.
- ACTIVE is a defined TCPProxySyncStatus value; transitional or deleted states are refused.

Official references: [Railway public API](https://docs.railway.com/integrations/api)
and [PostgreSQL connection variables](https://docs.railway.com/databases/postgresql).
The PostgreSQL documentation identifies the PG variables and explains that
public TCP exposure supplies DATABASE_PUBLIC_URL. This provider only reads an
existing proxy; it never creates/exposes one.

## Implemented controls

RailwayReadClient accepts an explicitly supplied existing bearer token. It does
not read environment variables, CLI config or credential files, log in, refresh
tokens or change security ownership. It uses fixed HTTPS, normal certificate
verification, disabled ambient proxies and rejected redirects. No endpoint
override or arbitrary GraphQL query is supported: exactly two constant queries
are allowlisted. Both use the fixed project/environment/Postgres service IDs.

Metadata discovery does not request service variables. The provider requires
active/nondeleted exact project/environment/service/instance relationships and
exactly one active PostgreSQL TCP proxy for that service/environment. Missing,
ambiguous, transitional or mismatched proxies abort, without selection fallback.

An attestation is timestamped before its request, validated within the accepted
60-second window, and retained as a bounded in-memory one-use metadata receipt.
Credentials require that exact issued receipt. A second scoped request fetches
metadata plus service variables together and must reproduce the original target,
service instance and proxy identity. The original attestation cannot be refreshed
silently or reused to obtain credentials twice.

Rendered DATABASE_PUBLIC_URL must match the attested proxy host/port, exact
database, PGUSER and PGPASSWORD. PGDATABASE and PGPORT must match the fixed
database/internal PostgreSQL port. Missing/unrendered values, URL overrides,
query parameters, fragments and mismatched credentials abort. Secrets are not
cached in the provider; returned Credentials retain the adapter's redacted repr.

HTTP/GraphQL/parse/network errors are reduced to fixed error codes. Response
bodies, tokens and passwords are never included in raised error messages.
There is no Railway mutation, DB connection, proxy creation or deployment path
in this provider. Existing adapter TLS checks and all fixture guards remain.

## Tests and results

All provider responses/tokens/passwords were synthetic. HTTP tests intercepted
the opener and asserted the fixed endpoint, exact query variables, verifying
TLS, no redirects and no mutations. No provider request reached Railway.
Existing PostgreSQL tests used the already-prepared disposable loopback DBs
at ports 52037 and 57624; no new SQL migration execution was needed.

```text
python -m pytest -q --tb=short tests/test_driver_a_railway_authority.py tests/test_driver_a_staging_fixture_link.py tests/test_driver_a_staging_fixture_link_postgres.py tests/test_driver_a_fixture_link_postgres.py tests/test_account_driver_links_postgres.py
106 passed in 36.88s

python -m pytest -q --tb=short
504 passed in 55.02s
```

The new provider contributes 41 tests. Coverage includes fixed query shapes,
successful re-attestation, single-use credentials, wrong project/environment/
service, deleted objects, inconsistent membership, wrong/multiple/missing proxy,
stale/forged attestation, proxy/instance replacement, missing variables,
unrendered values, public URL/credential mismatch, HTTP/GraphQL failures,
redirects, oversized/malformed responses, and secret-redacted failures.

No live token validity, actual target data, actual staging variable layout,
PostgreSQL TLS compatibility or staging preflight PASS is claimed by these tests.

## Independent review and continuation

Next required actor: Claude. Independently review exact provider code and fake
response proof, especially authority/credential binding and error redaction.
No live use as part of this review.

After ACCEPT, Codex may record a separate bounded read-only staging preflight
authorization under DEFAULT DELEGATED AUTHORITY; it is not a Product Owner
checkpoint unless a reserved boundary would be crossed. That preflight must
still establish actual endpoint/TLS/schema/provenance compatibility before any
single-row mutation can be considered. The Driver A insert remains a distinct
gate requiring proven uniquely synthetic scope and reversibility.

CANONICAL_DRIVER_A_ACCOUNT_LINK_MISSING remains. NOT_READY_FOR_PRODUCTION.
Second-Driver/cross-workspace fixtures, IA-3 harness compatibility, authenticated
browser/mobile/offline proof and CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remain
queued. No production, deployment, merge, legacy backfill or unrelated work.
