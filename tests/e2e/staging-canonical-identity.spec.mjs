import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  browserJson,
  loginFleetA,
  openFreshApplication,
  readMe,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'canonical-identity-read-only' });
});

test(
  'CANONICAL-IDENTITY-01 roster, link, assignment, and Driver SELF compose from authoritative staging reads',
  {
    annotation: [
      { type: 'expected_result', description: 'The authenticated workspace roster, account link, current assignment, and Driver SELF card agree on canonical IDs without fallback or mutation; the IA-3 presentation coordinator composes the same SELF evidence and correctly withholds Driver-only navigation narrowing for this non-driver Fleet A account.' },
      { type: 'step', description: 'Login as the protected Fleet A identity and resolve canonical account/workspace IDs from /v1/me.' },
      { type: 'step', description: 'Compare the direct authorized Driver roster with the PWA roster adapter.' },
      { type: 'step', description: 'Read the explicit AccountDriverLink and current DriverTruckAssignment through production adapters.' },
      { type: 'step', description: 'Refresh the IA-3 Driver presentation coordinator and verify its composed SELF evidence and rendered read-only card use the same proven IDs, and that applyDriver is false for this fleet-role account.' },
      { type: 'step', description: 'Revoke the session; perform no business-record mutation.' },
    ],
  },
  async ({ page, context }, testInfo) => {
    const config = prerequisites.config;
    const observations = [];
    let token = '';

    try {
      const initialState = await openFreshApplication(page, context, config);
      expect(initialState.cookies).toEqual([]);
      expect(initialState.origins).toEqual([]);

      const login = await loginFleetA(page, config);
      expect(login.status).toBe(200);
      expect(login.body.ok).toBe(true);
      token = String(login.body.session_token || '').trim();
      expect(token).toBeTruthy();

      const me = await readMe(page, config, token);
      expect(me.status).toBe(200);
      expect(me.body.ok).toBe(true);
      const workspaceId = String(me?.body?.user?.active_workspace_id || '').trim();
      const accountId = String(me?.body?.user?.crewbiq_id || '').trim();
      expect(workspaceId).toBeTruthy();
      expect(accountId).toBeTruthy();

      const wireRoster = await browserJson(
        page,
        config.orchestratorUrl,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/drivers`,
        { token },
      );
      expect(wireRoster.status).toBe(200);
      expect(wireRoster.body.ok).toBe(true);
      const wireDriverIds = (Array.isArray(wireRoster.body.drivers) ? wireRoster.body.drivers : [])
        .map(driver => String(driver?.driver_id || '').trim())
        .filter(Boolean)
        .sort();
      expect(wireDriverIds.length).toBeGreaterThan(0);
      expect(new Set(wireDriverIds).size).toBe(wireDriverIds.length);
      expect((wireRoster.body.drivers || []).every(driver => (
        String(driver?.workspace_id || '').trim() === workspaceId
      ))).toBe(true);

      const state = await page.evaluate(async ({ sessionToken, expectedWorkspaceId, expectedAccountId }) => {
        await orchestratorFinishLogin(sessionToken);

        const roster = await readAuthorizedWorkspaceDriverRoster();
        const linkAdapter = getAccountDriverLinkAdapter();
        const assignmentAdapter = getDriverTruckAssignmentAdapter();
        // getDriverSelfReader() was replaced by the IA-3 presentation coordinator
        // (driver-presentation.js); reuse the app's own coordinator instance so
        // this composes SELF evidence exactly the way the running app does.
        const coordinator = getDriverPresentationCoordinator();
        if (!linkAdapter || !assignmentAdapter || !coordinator) {
          throw new Error('Canonical identity adapters are unavailable');
        }

        const link = await linkAdapter.read({
          sessionToken,
          workspaceId: expectedWorkspaceId,
          accountId: expectedAccountId,
          effectiveAt: new Date().toISOString(),
        });
        const driverId = String(link?.link?.driverId || link?.proof?.driverId || '').trim();
        const assignment = driverId ? await assignmentAdapter.readCurrent({
          sessionToken,
          workspaceId: expectedWorkspaceId,
          driverId,
        }) : null;
        const composed = await coordinator.refresh(true);
        const rendered = await refreshDriverSelfCard(true);

        return {
          roster,
          link,
          assignment,
          self: composed.selfState,
          applyDriver: composed.applyDriver,
          projectionStatus: composed.projection ? composed.projection.status : null,
          projectionRole: composed.projection ? composed.projection.membershipRole : null,
          rendered,
          card: {
            status: document.getElementById('driverSelfStatus')?.textContent || '',
            detail: document.getElementById('driverSelfDetail')?.textContent || '',
            editableControls: document.querySelectorAll('#driverSelfCard input, #driverSelfCard select, #driverSelfCard textarea').length,
          },
        };
      }, { sessionToken: token, expectedWorkspaceId: workspaceId, expectedAccountId: accountId });

      expect(state.roster?.ok, `roster adapter: ${state.roster?.code || 'unknown'}`).toBe(true);
      const adapterDriverIds = (state.roster.drivers || []).map(driver => driver.driverId).sort();
      expect(adapterDriverIds).toEqual(wireDriverIds);
      expect((state.roster.drivers || []).every(driver => driver.workspaceId === workspaceId)).toBe(true);

      expect(state.link?.ok, `AccountDriverLink: ${state.link?.code || 'unknown'}`).toBe(true);
      expect(state.link.link.workspaceId).toBe(workspaceId);
      expect(state.link.link.accountId).toBe(accountId);
      expect(adapterDriverIds).toContain(state.link.link.driverId);

      expect(state.assignment?.ok, `DriverTruckAssignment: ${state.assignment?.code || 'unknown'}`).toBe(true);
      expect(state.assignment.assignment.workspaceId).toBe(workspaceId);
      expect(state.assignment.assignment.driverId).toBe(state.link.link.driverId);
      expect(String(state.assignment.assignment.truckId || '')).toBeTruthy();

      expect(state.self?.status).toBe('success');
      expect(state.self.workspaceId).toBe(workspaceId);
      expect(state.self.accountId).toBe(accountId);
      expect(state.self.driverId).toBe(state.link.link.driverId);
      expect(state.self.truckId).toBe(state.assignment.assignment.truckId);
      expect(state.rendered?.status).toBe('success');
      expect(state.card.status.trim()).toBeTruthy();
      expect(state.card.status.toLowerCase()).not.toContain('unavailable');
      expect(state.card.detail.trim()).toBeTruthy();
      expect(state.card.editableControls).toBe(0);

      // Fleet A holds broad capability, not the canonical driver-only membership
      // role; the IA-3 coordinator must never apply Driver-only navigation
      // narrowing to it, regardless of how much SELF evidence composes cleanly.
      expect(state.applyDriver).toBe(false);

      observations.push({
        journey: 'CANONICAL-IDENTITY-01',
        roster_status: wireRoster.status,
        roster_count: wireDriverIds.length,
        roster_ids_deterministic: new Set(wireDriverIds).size === wireDriverIds.length,
        link_proven: state.link.ok === true,
        assignment_proven: state.assignment.ok === true,
        self_status: state.self.status,
        card_read_only: state.card.editableControls === 0,
        coordinator_apply_driver: state.applyDriver === true,
        coordinator_projection_status: state.projectionStatus,
        coordinator_projection_role: state.projectionRole,
        mutation_count: 0,
      });
    } finally {
      if (token) {
        const logout = await revokeSession(page, config, token);
        expect.soft(logout.status).toBe(200);
        observations.push({ cleanup: 'session-revoked', status: logout.status });
      }
      await attachSafeObservations(testInfo, 'canonical-identity-observations', observations);
    }
  },
);
