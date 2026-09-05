# IA-3 canonical-identity harness reconciliation: evidence

Status: PUBLISHED / AWAITING RE-REVIEW
Author: Claude, acting as implementer under explicit Product Owner instruction while Codex's usage limit is exhausted ("Можешь продолжить сам. Сделай всю доступную работу. Когда лимит Codex обновится он сделает ревью на всю проделанную тобой работу"). This is a deliberate, temporary role-swap: Claude implements, an independent reviewer verifies, matching the role-swap pattern already used earlier in this coordination.

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
capability path.

## Correction after independent re-review (NEEDS_FIX addressed)

An independent reviewer found two real defects in the first version of this
fix (commit `184e1b910066625db56464a74e3ff5afe4a26163`), both confirmed
correct by re-reading the actual current source before changing anything
further:

1. **`RENDERED_RESULT_SHAPE_STALE_AFTER_IA3`.** The first version still called
   `refreshDriverSelfCard(true)` separately and asserted
   `state.rendered?.status === 'success'`. Reading `index.html` directly
   confirms `refreshDriverSelfCard(force)` is now `return
   coordinator.refresh(!!force)` - it resolves the coordinator's
   `{context, projection, selfState, applyDriver, snapshotKey}` shape, which
   has no top-level `status` field. That assertion would have evaluated
   `undefined === 'success'` and failed on any real run. Fixed by removing
   the separate `refreshDriverSelfCard(true)` call entirely and calling
   `coordinator.refresh(true)` exactly once; since `refreshDriverSelfCard` is
   now a thin wrapper over the same coordinator singleton, one call already
   triggers the identical `onResult` callback that renders the DOM card, so
   no coverage is lost and no duplicate canonical-relationship reads occur
   under two different evaluation timestamps.
2. **`FLEET_ROLE_ASSERTION_DOES_NOT_PROVE_RESOLVED_FLEET_CONTEXT`.** The first
   version asserted only `expect(state.applyDriver).toBe(false)`. Reading
   `driver-presentation.js` directly confirms `applyDriver` is also `false`
   whenever `selfState.status !== 'success'` or `projection.status !==
   'resolved'` or `projection.membershipRole !== 'driver'` - i.e. it is
   `false` for unresolved/unavailable/unauthorized/ambiguous projection
   states just as much as for a correctly-resolved Fleet membership. Asserting
   it alone could not distinguish "Fleet A correctly recognized as canonical
   fleet, narrowing correctly withheld" from "projection resolution silently
   broke". Fixed by adding `expect(state.projectionStatus).toBe('resolved')`
   and `expect(state.projectionRole).toBe('fleet')` alongside the existing
   `applyDriver` assertion, so the test now positively proves canonical Fleet
   authority resolved before checking that Driver-only narrowing was withheld
   because of that role, not because resolution failed.

Both corrections are additive/replacing within the same single test; no other
file changed. Final corrected commit: see HISTORY for this cycle's commit
SHA in `docs/collaboration/COLLABORATION_STATE.md`.

## Change (final, corrected state)

`tests/e2e/staging-canonical-identity.spec.mjs`:

- Replaced `getDriverSelfReader()` / `selfReader.read(...)` with
  `getDriverPresentationCoordinator()` / one `coordinator.refresh(true)` call.
  The coordinator's `selfState` is produced by the exact same
  `CrewBIQDriverSelf.create(...)` reader class the old accessor used
  (confirmed by reading `driver-presentation.js` directly), so `state.self`
  keeps its identical `{status, workspaceId, accountId, driverId, truckId,
  assignment}` shape and every pre-existing SELF assertion is unchanged.
- Kept the pre-existing direct `linkAdapter.read(...)` /
  `assignmentAdapter.readCurrent(...)` calls untouched, preserving the test's
  original independent-path cross-check design (raw wire roster, direct
  adapters, coordinator-composed/rendered card) - now via exactly one
  coordinator refresh rather than two redundant ones.
- Added three assertions that together prove Driver-only narrowing is
  withheld from Fleet A specifically because canonical Fleet authority
  resolved (not because resolution failed):
  `expect(state.projectionStatus).toBe('resolved')`,
  `expect(state.projectionRole).toBe('fleet')`,
  `expect(state.applyDriver).toBe(false)`. This is new, real coverage this
  harness did not previously exercise - it directly proves the accepted
  IA-3A "Driver-only application rule" holds against a live authenticated
  session, once staging execution of this spec is separately authorized.
- Updated the test's own `annotation` step descriptions to describe the
  single-refresh coordinator composition and the strengthened assertions.
- Left `serviceWorkers: 'block'` untouched. The prior discovery evidence
  separately noted this prevents establishing cache-first/offline
  correctness; that is a distinct concern from the accessor breakage this
  change fixes, and addressing it would require its own bounded scope
  (a different browser-context configuration and likely a different
  assertion set) rather than being folded into this narrow reconciliation.

No other spec file references `getDriverSelfReader`
(`grep -rn "getDriverSelfReader" --include="*.mjs" --include="*.html"
--include="*.js"` across the repository returns only this file's own
explanatory comment). A broader heuristic sweep of every `tests/e2e/*.spec.mjs`
file for calls to functions absent from `index.html`'s top-level declarations
found no other genuine dormant breakage - every other flagged name was
confirmed to exist (as an `async function`, or defined in `sync.js`/`loads.js`,
which the sweep's crude extraction missed).

## Verification performed

- `node --check tests/e2e/staging-canonical-identity.spec.mjs`: syntax valid
  (re-run after the correction).
- Confirmed `getDriverPresentationCoordinator` is a real, currently-existing
  top-level function in `index.html`, and independently re-read
  `refreshDriverSelfCard`'s and `driver-presentation.js`'s actual source
  before writing the correction above - not merely trusting the reviewer's
  claims.
- Ran `npm run test:e2e:tooling` on the full tree with the corrected change
  applied: **366 passed, 0 failed** - no regression in the suite that does
  run in CI.
- Attempted `npx playwright test tests/e2e/staging-canonical-identity.spec.mjs
  --list` again after the correction. Same pre-existing environment failure
  as before (`Playwright Test did not expect test.use() to be called here`),
  independently reproduced as identical on the unmodified file and on an
  unrelated spec file (`tests/e2e/svc-rate.spec.mjs`) in this same local
  checkout; `npm ls @playwright/test playwright` shows only one resolved
  version. Not caused by this change; not further chased since it is outside
  this change's scope and does not affect source-level correctness.
- This spec cannot be executed end-to-end without live staging credentials
  regardless of the above (`test.skip(!prerequisites.ready, ...)`); no
  attempt was made to supply or discover such credentials.

## Handoff

Next required actor: independent reviewer (Codex, when usage limit resets, or
whoever picks this up in the meantime). Re-review this corrected change
against the accepted IA-3A contract and the coordinator's actual behavior;
confirm the corrected assertions and shape assumptions are accurate, and
reproduce whatever local verification is available. If sound, this closes one
named coverage gap; the harness remains otherwise gated on live staging
execution, which is unchanged by this commit. No production, deployment,
merge, migration, credential use, or unrelated work occurred.
