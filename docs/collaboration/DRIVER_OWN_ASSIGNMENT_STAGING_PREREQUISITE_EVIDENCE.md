# Driver own-current staging: read-only prerequisite evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW
Execution readiness: BLOCKED
Release readiness: NOT_READY_FOR_PRODUCTION

## Authority and scope

Accepted plan: `aab642651d6733cd2f4eba2947f5a2f6adb1b286`.
Independent plan acceptance: `a5989a1b4ed548057d6b1718b91d913c27bdc79e`.
Under standing coordinator delegation, Codex selected only read-only
prerequisite investigation. No fixture creation, credential retrieval,
browser journey dispatch, deployment, merge, migration or runtime change.

## PWA byte comparison

On 2026-09-03T21:25:24.594Z through 21:25:26.202Z, GET requests to
`https://crewbiq-driver-staging.up.railway.app/<path>` returned HTTP 200
for every path below. Requests used Cache-Control: no-cache.
Response bytes were compared directly with `git show
c0ec7d884f59f4eca91fee311a8b11cbfa98f628:<path>` binary output, with no
newline normalization or source transformation. All comparisons were equal.

| Path | SHA-256, expected and served |
| --- | --- |
| index.html | 1ccbc811ddce2ba7db1e8f5d623b5294ce7ca6e13511b19f15ed809ad24b5456 |
| sw.js | 59e4f90b9c79fb0e62f20353a47ac78411ada48eb77d80dba3ebdb3e1dc7525b |
| core-runtime.js | 29c91e9830cef14ffc32daadd93c058b258139973527c30001081599f99ff72d |
| driver-self.js | 133a27afd2b5bf762c278e1e7007b35808a0ad02f4f690dd2b172c71c6665ff1 |
| driver-presentation.js | fc4c02f89c16e077f7681bc393c8db5d4c2859a9870e328efd114c8aac9f8e0b |
| presentation-context.js | 0e5c645947e8e8f7cdbaf63481a40b931df692d1a095f6c465e5944efcb64861 |
| navigation-projection.js | 9ce9d00fcbfb5af85e2bd4ed307b4da5f8472210045c4ca1b5c6fbf1d7d7375a |
| navigation-model.js | 0b5f18b52ef16ca7f5c6287a250b7fff8c4f1f6d3352e784bc43364062438484 |
| account-driver-link.js | 9e193b9602c50a21da9b97e51d34bb679be30c5e55a321c42f3fb4cdc914a5a3 |
| driver-truck-assignment.js | 1ea23e4f04a74da2d11704f909ce57757614622231442c00b6eea06c8835385a |

Classification: PASS for these ten artifacts only; PARTIAL for complete
served-runtime provenance. This is stronger than a cache label or Git
ancestry, but does not prove unlisted assets/configuration, the browser's
active service-worker cache, network routing or authenticated behavior.

## Backend provenance attempt

Target was selected explicitly, never by a default environment:

- Project: `89eb12bf-57ee-4228-a841-4008ef7a0e59`.
- Environment: `ce5fe955-2a0c-4fba-8d57-571acbf7bded`.
- Service: `dd23479b-f6b1-48ba-9d7c-27f4e0c01ba2`.
- Intended read-only command: `sha256sum /app/app/services/capabilities.py /app/app/routers/driver_truck_assignments.py /app/app/services/driver_self_assignment.py`.

The Railway SSH command selected an already registered local staging SSH key
but returned no remote checksum or error output after repeated waits.
Codex cancelled this diagnostic command with Ctrl-C; it exited 1. No key
was created/registered, no key material or server environment secrets were
read, and no remote write/deploy/restart command was sent.

Classification: NOT_VERIFIED. A cancelled/unresponsive diagnostic does not
prove the file is missing, the server is broken, or the accepted SHA is absent.
The prior null deployment commit metadata remains insufficient evidence of
accepted backend provenance. Do not substitute /health or /ready success for
proof of `ce5a591a48f1733b4e21128dece0e0350ace41c2`.

## Fixture and harness findings

Inspected `tests/e2e/staging-canonical-identity.spec.mjs` without executing it.
The scenario explicitly uses `loginFleetA`, requires a workspace roster read,
and calls `getDriverSelfReader()` while composing its old SELF flow. It also
blocks service workers for its browser context.

Consequences for the accepted plan:

- Fleet A is not proof of driver-only authorization; it can exercise the broad capability path instead.
- The old SELF accessor needs compatibility reconciliation with IA-3's coordinator composition before this scenario can be treated as an executable new-path test. No harness correction was made here.
- A service-worker-blocked scenario cannot establish cache-first/offline restore correctness.
- Existing driver-only, same-workspace second-Driver and other-workspace synthetic fixtures remain unverified. No database identity enumeration, credential retrieval, login or fixture provisioning was performed.

These are coverage/prerequisite findings, not newly demonstrated runtime
defects. The old journey was not run and no runtime failure is claimed.

## Next bounded decisions

Claude independently reviews these observations and their limits first.
After review, Codex can select a bounded read-only backend provenance
diagnostic and reconcile the canonical harness contract separately. Neither
requires silently deploying the backend, granting broader capabilities or
reusing Fleet A as a canonical Driver surrogate.

If fixture provisioning or staging deployment is actually needed, it needs
separate explicit authorization with exact target/provenance boundaries.
Authenticated browser/mobile/offline checks and
CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remain outstanding. No production
readiness or end-to-end PASS is declared by this partial evidence.
