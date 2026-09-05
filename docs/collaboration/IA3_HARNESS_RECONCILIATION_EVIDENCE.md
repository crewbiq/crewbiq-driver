# IA-3 canonical-identity harness reconciliation: evidence

Status: PUBLISHED / AWAITING CODEX REVIEW
Author: Claude, acting as implementer under explicit Product Owner instruction while Codex's usage limit is exhausted ("Можешь продолжить сам. Сделай всю доступную работу. Когда лимит Codex обновится он сделает ревью на всю проделанную тобой работу"). This is a deliberate, temporary role-swap: Claude implements, Codex reviews when available, matching the role-swap pattern already used earlier in this coordination.

## Scope and authority

This addresses one specific, previously-identified, non-credentialed gap:
`tests/e2e/staging-canonical-identity.spec.mjs` called `getDriverSelfReader()`,
a function removed from `index.html` by the accepted IA-3 implementation
(`c0ec7d884f59f4eca91fee311a8b11cbfa98f628`), which replaced it with the
`driver-presentation.js` coordinator (`getDriverPresentationCoordinator()`).
This was flagged as a coverage/prerequisite finding in
`DRIVER_A_STAGING_PREREQUISITE_EVIDENCE.md` ("The old SELF accessor needs
compatibility reconciliation with IA-3's coordinator composition before this
scenario can be treated as an executable new-path test") and left unresolved
pending a bounded fix. It requires no staging access, no credentials, and no
live Railway/database connection - it is a source-level fix to a Playwright
spec file that is itself gated behind live staging prerequisites
(`test.skip(!prerequisites.ready, ...)`) and was therefore never exercised in
CI on this branch, leaving the breakage dormant rather than causing visible
failures.

No staging preflight, no Driver A insert, no credential use, and no other
file was touched. This does not resolve `CANONICAL_DRIVER_A_ACCOUNT_LINK_MISSING`;
that remains gated on the separately-authorized real staging preflight using
the accepted RailwayAuthority provider (`010dffe29c10d0d5d2a11f35c640eda20c4a9927`),
which requires a real bearer token Claude will not request, receive, or handle.

## Confirmed defect

Independently confirmed `getDriverSelfReader` no longer exists anywhere in
`index.html` (`grep -n "getDriverSelfReader" index.html` returns nothing) -
this Playwright spec would have thrown `ReferenceError: getDriverSelfReader
is not defined` inside `page.evaluate` had it ever been run against the
current app shell, since IA-3's implementation commit renamed the module-level
state (`driverSelfReader`/`getDriverSelfReader`) to
`driverPresentationCoordinator`/`getDriverPresentationCoordinator`. This is a
genuine breakage, not merely an insufficiency for proving the new own-current
capability path (which was the framing in the prior discovery evidence).

## Change

`tests/e2e/staging-canonical-identity.spec.mjs` (commit
`184e1b910066625db56464a74e3ff5afe4a26163`):

- Replaced `getDriverSelfReader()` / `selfReader.read(...)` with
  `getDriverPresentationCoordinator()` / `coordinator.refresh(true)`. The
  coordinator's `selfState` is produced by the exact same
  `CrewBIQDriverSelf.create(...)` reader class the old accessor used
  (confirmed by reading `driver-presentation.js` directly), so `state.self`
  keeps its identical `{status, workspaceId, accountId, driverId, truckId,
  assignment}` shape and every pre-existing assertion on it is unchanged.
- Kept the pre-existing direct `linkAdapter.read(...)` /
  `assignmentAdapter.readCurrent(...)` calls and the separate
  `refreshDriverSelfCard(true)` call untouched, preserving the test's
  original three-independent-path cross-check design (raw wire roster,
  direct adapters, composed/rendered card).
- Added one new assertion: `expect(state.applyDriver).toBe(false)`. Fleet A
  authenticates with broad `DRIVER_TRUCK_ASSIGNMENT_READ` capability, not the
  canonical driver-only membership role, so the IA-3 coordinator must never
  apply Driver-only navigation narrowing to it regardless of how cleanly its
  SELF evidence composes. This is new, real coverage this harness did not
  previously exercise - it directly proves the accepted IA-3A "Driver-only
  application rule" holds against a live authenticated session, once staging
  execution of this spec is separately authorized.
- Updated the test's own `annotation` step descriptions to describe the
  coordinator-based composition instead of the removed accessor.
- Left `serviceWorkers: 'block'` untouched. The prior discovery evidence
  separately noted this prevents establishing cache-first/offline
  correctness; that is a distinct concern from the accessor breakage this
  change fixes, and addressing it would require its own bounded scope
  (a different browser-context configuration and likely a different
  assertion set) rather than being folded into this narrow reconciliation.

No other spec file references `getDriverSelfReader`
(`grep -rn "getDriverSelfReader" --include="*.mjs" --include="*.html"
--include="*.js"` across the repository returns only this file's own new
explanatory comment after the change).

## Verification performed

- `node --check tests/e2e/staging-canonical-identity.spec.mjs`: syntax valid.
- Confirmed `getDriverPresentationCoordinator` is a real, currently-existing
  top-level function in `index.html` (same file, same scope
  `getDriverSelfReader` used to occupy), not something invented for this fix.
- Ran `npm run test:e2e:tooling` on the full tree with this change applied:
  **366 passed, 0 failed** - no regression in the suite that does run in CI.
- Attempted `npx playwright test tests/e2e/staging-canonical-identity.spec.mjs
  --list` to have Playwright itself parse/enumerate the file. This failed
  with `Playwright Test did not expect test.use() to be called here` in this
  local scratch clone - confirmed this is a pre-existing environment issue,
  not caused by this change, by reproducing the identical failure on the
  unmodified file (`git stash` then re-running the same command) and on an
  unrelated spec file (`tests/e2e/svc-rate.spec.mjs`) in the same checkout.
  `npm ls @playwright/test playwright` shows only one resolved version, so
  it is not the "two different versions" case the error message suggests;
  the root cause was not further chased since it is outside this change's
  scope and does not affect the source-level correctness of the fix.
- This spec cannot be executed end-to-end without live staging credentials
  regardless of the above (`test.skip(!prerequisites.ready, ...)`); no
  attempt was made to supply or discover such credentials.

## Handoff

Next required actor: Codex, when usage limit resets. Independently review
this change against the accepted IA-3A contract and the coordinator's actual
behavior; confirm the `applyDriver` assertion and shape assumptions are
correct, and reproduce whatever local verification is available. If sound,
this closes one named coverage gap; the harness remains otherwise gated on
live staging execution, which is unchanged by this commit. No production,
deployment, merge, migration, credential use, or unrelated work occurred.
