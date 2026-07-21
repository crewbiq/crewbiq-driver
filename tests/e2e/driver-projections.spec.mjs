import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.setItem('fiqD_userRole', 'fleet');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Projection Tester', email: 'projection@example.test', crewId: 'CREW-PROJECTION-TEST',
      driverId: 'DRV-PROJECTION-TEST', ownerKey: 'owner-key-1',
      company: 'Legacy Shadow Carrier', truckName: 'Freightliner Cascadia', unitNumber: 'PJ-01', plate: 'PJ01',
      teamDriver: 'Alex Co-Driver', teamRate: 0.1,
      payType: 'cpm', cpmRate: 0.55, grossPercent: 0, cpmBase: 'loaded',
      currentAssignmentId: 'assign-server-1',
      syncUrl: '', ptiSchedule: 'daily',
    }));
  });
  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    const blocker = document.getElementById('ptiBlocker');
    if (blocker) blocker.classList.remove('show');
    applyRoleUI();
  });
});

test('Account Identity does not become Person: identity fields never leak name', async ({ page }) => {
  const identity = await page.evaluate(() => currentAccountIdentity());
  expect(identity).toEqual({
    accountId: identity.accountId, // backfilled by loadAll(); covered on its own below
    crewId: 'CREW-PROJECTION-TEST',
    driverId: 'DRV-PROJECTION-TEST',
    email: 'projection@example.test',
    ownerKey: 'owner-key-1',
    identityKey: 'crew_crew_projection_test',
  });
  expect(identity.accountId).toMatch(/^acct_local_.+/);
  expect(identity).not.toHaveProperty('name');

  const person = await page.evaluate(() => currentPersonProfile());
  expect(person.name).toBe('Projection Tester');
  expect(person).not.toHaveProperty('company');
  expect(person).not.toHaveProperty('payType');
});

test('global driver compensation projects the split cpmRate/grossPercent fields as-is', async ({ page }) => {
  const comp = await page.evaluate(() => currentCompensationTerms());
  expect(comp).toEqual({
    payType: 'cpm', cpmRate: 0.55, grossPercent: 0, cpmBase: 'loaded',
    effectiveFrom: null, effectiveTo: null, active: true,
  });
});

test('fleet roster compensation converts the unified rate by payType, legacy rate untouched', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cpmProfile = { id: 'drv_1', name: 'CPM Driver', payType: 'cpm', rate: 0.48, cpmBase: 'total', active: true };
    const grossProfile = { id: 'drv_2', name: 'Gross Driver', payType: 'gross_percent', rate: 28, active: true };
    return {
      cpm: compensationTermsFromProfile(cpmProfile),
      gross: compensationTermsFromProfile(grossProfile),
      // originals must be untouched — no legacy field renamed or removed.
      cpmOriginalRate: cpmProfile.rate,
      grossOriginalRate: grossProfile.rate,
    };
  });
  expect(result.cpm).toEqual({ payType: 'cpm', cpmRate: 0.48, grossPercent: 0, cpmBase: 'total', effectiveFrom: null, effectiveTo: null, active: true });
  expect(result.gross).toEqual({ payType: 'gross_percent', cpmRate: 0, grossPercent: 28, cpmBase: 'loaded', effectiveFrom: null, effectiveTo: null, active: true });
  expect(result.cpmOriginalRate).toBe(0.48);
  expect(result.grossOriginalRate).toBe(28);
});

test('current Driver Assignment finds the default truck and its carrier company snapshot', async ({ page }) => {
  const result = await page.evaluate(() => {
    saveTrucks([{
      id: 'truck_pj_1', unitNumber: 'PJ-01', make: 'Freightliner', model: 'Cascadia', plate: 'PJ01',
      carrierAssignment: { company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12, companyRef: 'company_abc', companyNameSnapshot: 'Prime Inc', mcNumberSnapshot: 'MC-999' },
      company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12,
      vin: '', maintenanceRate: 0.2, purchaseCost: 0, active: true,
    }]);
    return currentDriverAssignment();
  });
  expect(result).toEqual({
    driverRef: 'DRV-PROJECTION-TEST',
    truckRef: 'truck_pj_1',
    companyRef: 'company_abc',
    companySnapshot: { name: 'Prime Inc', mcNumber: 'MC-999' },
    currentAssignmentId: 'assign-server-1',
    teamId: '',
    active: true,
  });
});

test('fleet roster Driver Assignment uses profile.truckId, independent of unit-number matching', async ({ page }) => {
  const result = await page.evaluate(() => {
    // Deliberately a different unit than driver.unitNumber ('PJ-01') — proves this path
    // does not fall back to unit-number inference like currentDriverAssignment() does.
    saveTrucks([{
      id: 'truck_other_1', unitNumber: 'OTHER-99', make: 'Kenworth', model: 'T680', plate: 'OT99',
      carrierAssignment: { company: 'Other Carrier LLC', mc: 'MC-111', dispatchPercent: 10, companyRef: 'company_xyz', companyNameSnapshot: 'Other Carrier LLC', mcNumberSnapshot: 'MC-111' },
      company: 'Other Carrier LLC', mc: 'MC-111', dispatchPercent: 10,
      vin: '', maintenanceRate: 0.2, purchaseCost: 0, active: true,
    }]);
    const profile = { id: 'drv_roster_1', name: 'Roster Driver', truckId: 'truck_other_1', teamDriver: true, active: true };
    return driverAssignmentFromProfile(profile);
  });
  expect(result).toEqual({
    driverRef: 'drv_roster_1',
    truckRef: 'truck_other_1',
    companyRef: 'company_xyz',
    companySnapshot: { name: 'Other Carrier LLC', mcNumber: 'MC-111' },
    teamId: '',
    active: true,
    legacyTeamDriver: true,
  });
});

test('incompatible teamDriver string/boolean values never become teamId', async ({ page }) => {
  const result = await page.evaluate(() => {
    // driver.teamDriver is a string (teammate name) on the global object...
    const globalAssignment = currentDriverAssignment();
    // ...while a roster profile's teamDriver is a boolean flag.
    const profileWithStringLikeBool = driverAssignmentFromProfile({ id: 'drv_x', teamDriver: true, active: true });
    const profileWithFalsyTeam = driverAssignmentFromProfile({ id: 'drv_y', teamDriver: false, active: true });
    return { globalAssignment, profileWithStringLikeBool, profileWithFalsyTeam };
  });
  // teamId is always the empty string in both projections regardless of the legacy value's shape.
  expect(result.globalAssignment.teamId).toBe('');
  expect(result.profileWithStringLikeBool.teamId).toBe('');
  expect(result.profileWithFalsyTeam.teamId).toBe('');
  // The legacy value is preserved separately, never coerced into teamId.
  expect(result.profileWithStringLikeBool.legacyTeamDriver).toBe(true);
  expect(result.profileWithFalsyTeam.legacyTeamDriver).toBe(false);
  expect(result.globalAssignment).not.toHaveProperty('legacyTeamDriver');
});

test('ensureAccountId backfills a stable local id on first load for a driver that never had one', async ({ page }) => {
  // The fixture in beforeEach has no accountId — loadAll() on page load must have backfilled it.
  const identity = await page.evaluate(() => currentAccountIdentity());
  expect(identity.accountId).toMatch(/^acct_local_.+/);
  const storedDriver = await page.evaluate(() => JSON.parse(localStorage.getItem('fiqD_driver')));
  expect(storedDriver.accountId).toBe(identity.accountId);
});

test('accountId survives a page reload unchanged, not regenerated', async ({ page }) => {
  const firstId = await page.evaluate(() => currentAccountIdentity().accountId);
  expect(firstId).toBeTruthy();

  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    applyRoleUI();
  });
  const secondId = await page.evaluate(() => currentAccountIdentity().accountId);
  expect(secondId).toBe(firstId);
});

test('ensureAccountId never overwrites an existing accountId, including across reload', async ({ page }) => {
  const fixedId = 'acct_local_fixed-test-id-0001';
  await page.evaluate((id) => {
    const stored = JSON.parse(localStorage.getItem('fiqD_driver'));
    stored.accountId = id;
    localStorage.setItem('fiqD_driver', JSON.stringify(stored));
  }, fixedId);

  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    applyRoleUI();
  });

  const result = await page.evaluate(() => ({
    fromProjection: currentAccountIdentity().accountId,
    fromEnsureCall: ensureAccountId(), // calling again must be a pure no-op read
  }));
  expect(result.fromProjection).toBe(fixedId);
  expect(result.fromEnsureCall).toBe(fixedId);
});

test('accountId has no effect on current scoped storage keys', async ({ page }) => {
  const result = await page.evaluate(() => {
    const beforeIdentityKey = getDriverIdentityKey();
    const beforeDataKey = dataKey('trucks');
    saveTrucks([{ id: 'truck_scope_check', unitNumber: 'SC-01', active: true, carrierAssignment: {} }]);
    const rawKeys = Object.keys(localStorage).filter(k => k.includes('trucks'));
    return {
      accountId: currentAccountIdentity().accountId,
      identityKey: beforeIdentityKey,
      dataKeyResult: beforeDataKey,
      rawTruckKeys: rawKeys,
    };
  });
  // Scoping is still purely crewId/email-derived — accountId does not appear in the key at all.
  expect(result.identityKey).toBe('crew_crew_projection_test');
  expect(result.dataKeyResult).toBe('data_crew_crew_projection_test_trucks');
  expect(result.rawTruckKeys.some(k => k.includes(result.accountId))).toBe(false);
  expect(result.rawTruckKeys).toContain('fiqD_data_crew_crew_projection_test_trucks');
});

test('applyAuthRestoreData never carries the old local accountId onto a different account (account switch)', async ({ page }) => {
  const result = await page.evaluate(() => {
    const beforeSwitch = currentAccountIdentity().accountId;
    // A genuinely different identity than the beforeEach fixture (different crewId AND email).
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test', profile: { driver: { name: 'Switched Driver' } } }, '');
    return { beforeSwitch, afterSwitch: currentAccountIdentity().accountId, newIdentity: currentAccountIdentity() };
  });
  expect(result.newIdentity.crewId).toBe('CREW-SWITCH-TEST');
  expect(result.afterSwitch).toMatch(/^acct_local_.+/);
  expect(result.afterSwitch).not.toBe(result.beforeSwitch);
});

test('applyAuthRestoreData keeps the same accountId when the identity is unchanged (profile refresh / re-login as self)', async ({ page }) => {
  const result = await page.evaluate(() => {
    const beforeRefresh = currentAccountIdentity().accountId;
    // Same crewId/email as the beforeEach fixture — a session refresh, not a switch.
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test', profile: { driver: { name: 'Projection Tester Refreshed' } } }, '');
    return { beforeRefresh, afterRefresh: currentAccountIdentity().accountId };
  });
  expect(result.afterRefresh).toBe(result.beforeRefresh);
});

test('Step 3: account switch does not inherit the previous person\'s local fields (pay, team, company, name)', async ({ page }) => {
  const result = await page.evaluate(() => {
    const before = {
      teamDriver: driver.teamDriver, teamRate: driver.teamRate, cpmRate: driver.cpmRate,
      company: driver.company, name: driver.name,
    };
    // Thin server response — no profile.driver fields at all, exactly the shape that would
    // previously have let the object-spread and inline fallbacks leak the old person's data.
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, '');
    return {
      before,
      after: {
        teamDriver: driver.teamDriver, teamRate: driver.teamRate, cpmRate: driver.cpmRate,
        company: driver.company, name: driver.name,
      },
    };
  });
  expect(result.before.teamRate).toBe(0.1);
  expect(result.after.teamDriver).toBe('');
  expect(result.after.teamRate).toBe(0);
  expect(result.after.cpmRate).toBe(0);
  expect(result.after.company).toBe('');
  expect(result.after.name).not.toBe(result.before.name);
});

test('Step 3: a same-account profile refresh still keeps local fields the thin server response omits', async ({ page }) => {
  const result = await page.evaluate(() => {
    const before = { teamRate: driver.teamRate, company: driver.company };
    // Same crewId/email as the fixture — not a switch — with a thin response, same as above.
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, '');
    return { before, after: { teamRate: driver.teamRate, company: driver.company } };
  });
  expect(result.before.teamRate).toBe(0.1);
  expect(result.after.teamRate).toBe(0.1);
  expect(result.after.company).toBe('Legacy Shadow Carrier');
});

test('Step 3 regression: old loads/ptiLog never end up under the new account\'s scoped key after a switch', async ({ page }) => {
  const result = await page.evaluate(() => {
    // The old (fixture) account's own scoped data.
    scopedSave('loads', [{ id: 'load_old_1', pickup: '2026-01-01' }]);
    scopedSave('ptiLog', [{ id: 'pti_old_1', date: '2026-01-01' }]);
    loadDriverScopedData(false); // populate in-memory loads/ptiLog for the OLD identity
    const oldKey = dataKey('loads');

    // Thin switch response — no data.loads/data.ptiLog at all, exactly the shape that used to
    // leave stale in-memory arrays for saveAll() to persist under the wrong (new) scoped key.
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, '');
    saveAll();

    const newKey = dataKey('loads');
    return {
      oldKey, newKey,
      newScopedLoads: JSON.parse(localStorage.getItem('fiqD_' + newKey) || 'null'),
      oldScopedLoadsStillIntact: JSON.parse(localStorage.getItem('fiqD_' + oldKey) || 'null'),
      inMemoryLoadsAfterSwitch: loads,
      inMemoryPtiLogAfterSwitch: ptiLog,
    };
  });
  expect(result.oldKey).not.toBe(result.newKey);
  expect(result.inMemoryLoadsAfterSwitch).toEqual([]);
  expect(result.inMemoryPtiLogAfterSwitch).toEqual([]);
  expect((result.newScopedLoads || []).some(l => l.id === 'load_old_1')).toBe(false);
  // The old account's own scoped data must remain untouched, not deleted or moved.
  expect(result.oldScopedLoadsStillIntact.some(l => l.id === 'load_old_1')).toBe(true);
});

test('Step 4 regression: Account A -> Account B -> Account A migrates pay settings through scope instead of destroying them', async ({ page }) => {
  const result = await page.evaluate(() => {
    // Account A (the beforeEach fixture) has locally-edited pay settings sitting in the
    // legacy device-global key, exactly as FLEET_DIRECT_KEYS expects it to survive logout/reset.
    localStorage.setItem('fiqD_paySettings', JSON.stringify({
      payType: 'gross_percent', cpmRate: 0, grossPercent: 33, cpmBase: 'loaded', savedAt: new Date(0).toISOString(),
    }));

    // A -> B: B must start clean, and A's settings must be archived, not destroyed.
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, '');
    const afterSwitchToB = {
      payType: driver.payType,
      grossPercent: driver.grossPercent,
      legacyKeyAfterAtoB: localStorage.getItem('fiqD_paySettings'),
    };

    // B -> A: A's own archived settings must come back from ITS scope, not from the (now
    // cleared) legacy key and not from whatever B had (B never set anything).
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, '');
    const afterSwitchBackToA = {
      payType: driver.payType, cpmRate: driver.cpmRate,
      grossPercent: driver.grossPercent, cpmBase: driver.cpmBase,
    };

    return { afterSwitchToB, afterSwitchBackToA };
  });

  expect(result.afterSwitchToB.payType).toBe('cpm'); // B starts clean, not A's 33%
  expect(result.afterSwitchToB.grossPercent).toBe(0);
  expect(result.afterSwitchToB.legacyKeyAfterAtoB).toBeNull(); // migrated, not left dangling for B to see

  expect(result.afterSwitchBackToA.payType).toBe('gross_percent'); // A's rate genuinely restored
  expect(result.afterSwitchBackToA.grossPercent).toBe(33);
});

test('Step 4b regression: an edit after A -> B -> A is itself preserved through a second B round-trip (33% -> 35%)', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_paySettings', JSON.stringify({
      payType: 'gross_percent', cpmRate: 0, grossPercent: 33, cpmBase: 'loaded', savedAt: new Date(0).toISOString(),
    }));
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, ''); // B -> A, restores 33%
    const restored33 = driver.grossPercent;

    // A edits their rate (the equivalent of what saveSettings() does via saveAccountPaySettings).
    saveAccountPaySettings({ payType: 'gross_percent', cpmRate: 0, grossPercent: 35, cpmBase: 'loaded' });

    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B again
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, ''); // B -> A again

    return { restored33, restored35: driver.grossPercent };
  });
  expect(result.restored33).toBe(33);
  expect(result.restored35).toBe(35); // the edit survives a further switch cycle, not just the first
});

test('Step 4b regression: a stale server pay_config during a same-account refresh never overwrites a newer local rate', async ({ page }) => {
  const result = await page.evaluate(() => {
    // A's own current, recently-saved rate.
    saveAccountPaySettings({ payType: 'gross_percent', cpmRate: 0, grossPercent: 40, cpmBase: 'loaded' });
    // Simulate a stale write into the legacy mirror (e.g. an old Apps Script profile synced late).
    localStorage.setItem('fiqD_paySettings', JSON.stringify({
      payType: 'gross_percent', cpmRate: 0, grossPercent: 10, cpmBase: 'loaded', savedAt: new Date(0).toISOString(),
    }));
    // Same-account refresh (not a switch) — must reconcile by date, not blindly apply the legacy key.
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, '');
    return { grossPercent: driver.grossPercent };
  });
  expect(result.grossPercent).toBe(40); // newer local rate wins over the stale 10%
});

test('Step 4b regression: Account B\'s pay settings never affect Account A\'s scope, in either direction', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_paySettings', JSON.stringify({
      payType: 'gross_percent', cpmRate: 0, grossPercent: 33, cpmBase: 'loaded', savedAt: new Date(0).toISOString(),
    }));
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B

    // B sets their own, unrelated rate.
    saveAccountPaySettings({ payType: 'cpm', cpmRate: 0.72, grossPercent: 0, cpmBase: 'total' });

    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, ''); // B -> A
    const aAfterBEdited = { payType: driver.payType, grossPercent: driver.grossPercent };

    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B
    const bAfterReturning = { payType: driver.payType, cpmRate: driver.cpmRate, cpmBase: driver.cpmBase };

    return { aAfterBEdited, bAfterReturning };
  });
  // A's rate is untouched by B's edit.
  expect(result.aAfterBEdited.payType).toBe('gross_percent');
  expect(result.aAfterBEdited.grossPercent).toBe(33);
  // B's own rate survived the round trip, unaffected by anything on A's side.
  expect(result.bAfterReturning.payType).toBe('cpm');
  expect(result.bAfterReturning.cpmRate).toBe(0.72);
  expect(result.bAfterReturning.cpmBase).toBe('total');
});

test('Step 4d regression: invalid JSON in the legacy key is quarantined (with its raw content preserved) before the key is cleared', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_paySettings', '{not valid json');
    const importResult = importLegacyPaySettingsIntoScope();
    // Mirror what the real caller (applyAuthRestoreData's archive step) does with the result —
    // importLegacyPaySettingsIntoScope() itself never removes the legacy key.
    if (importResult.legacyCleared) localStorage.removeItem('fiqD_paySettings');
    const legacyAfterImport = localStorage.getItem('fiqD_paySettings');
    const quarantinedRaw = importResult.quarantineKey ? localStorage.getItem('fiqD_' + importResult.quarantineKey) : null;
    return { importResult, legacyAfterImport, quarantinedRaw };
  });
  expect(result.importResult.outcome).toBe('quarantined');
  expect(result.importResult.legacyCleared).toBe(true);
  expect(result.importResult.quarantineKey).toMatch(/^paySettings_quarantine_acct_local_.+_\d+$/);
  // The legacy key is safe to clear ONLY because the raw string genuinely survives elsewhere —
  // this is the check the previous version of this test never made.
  expect(result.legacyAfterImport).toBeNull();
  expect(result.quarantinedRaw).toBe('{not valid json');
});

test('Step 4d regression: a quarantine write failure leaves the corrupt legacy value in place instead of losing it', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_paySettings', '{not valid json');
    // Simulate quarantining itself failing (e.g. storage quota) by making setItem throw only
    // for the quarantine key, leaving every other localStorage write working normally.
    const realSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      if (key.indexOf('fiqD_paySettings_quarantine_') === 0) throw new Error('quota exceeded (simulated)');
      return realSetItem(key, value);
    };
    let importResult;
    try {
      importResult = importLegacyPaySettingsIntoScope();
    } finally {
      localStorage.setItem = realSetItem;
    }
    return { importResult, legacyAfter: localStorage.getItem('fiqD_paySettings') };
  });
  expect(result.importResult.outcome).toBe('quarantine_failed');
  expect(result.importResult.legacyCleared).toBe(false);
  expect(result.legacyAfter).toBe('{not valid json'); // never lost — left exactly where it was
});

test('Step 4c regression: Account A -> Account B -> Account A gives A the SAME local accountId both times', async ({ page }) => {
  const result = await page.evaluate(() => {
    const aFirst = currentAccountIdentity().accountId;
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B
    const bFirst = currentAccountIdentity().accountId;
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, ''); // B -> A
    const aSecond = currentAccountIdentity().accountId;
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B again
    const bSecond = currentAccountIdentity().accountId;
    return { aFirst, bFirst, aSecond, bSecond };
  });
  expect(result.aSecond).toBe(result.aFirst); // A's id is stable across repeated switches
  expect(result.bSecond).toBe(result.bFirst); // same for B
  expect(result.bFirst).not.toBe(result.aFirst); // still two genuinely distinct people
});

test('Step 4d regression: an empty {} legacy value is a deliberate cleanup, not a "successful migration" — nothing usable ever existed to lose', async ({ page }) => {
  const result = await page.evaluate(() => {
    saveAccountPaySettings({ payType: 'gross_percent', cpmRate: 0, grossPercent: 33, cpmBase: 'loaded' });
    localStorage.setItem('fiqD_paySettings', '{}');
    const importResult = importLegacyPaySettingsIntoScope();
    const scopedAfterDirectCall = loadAccountPaySettings();

    // Exercise the real end-to-end path too: a switch away must actually clear the (meaningless
    // but validly-parsed) legacy key, unlike the invalid-JSON case which quarantines instead.
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, '');
    const legacyAfterSwitch = localStorage.getItem('fiqD_paySettings');

    return { importResult, scopedAfterDirectCall, legacyAfterSwitch };
  });
  // {} is valid JSON but has no payType — normalizePaySettings() rejects it. The distinct
  // 'no_usable_data' outcome (not 'imported') is the point: this is cleanup of a value that was
  // never real data, not evidence that a migration happened. No quarantine either — there is
  // nothing to preserve.
  expect(result.importResult.outcome).toBe('no_usable_data');
  expect(result.importResult.legacyCleared).toBe(true);
  expect(result.importResult.quarantineKey).toBeUndefined();
  expect(result.scopedAfterDirectCall.grossPercent).toBe(33);
  expect(result.legacyAfterSwitch).toBeNull();
});

test('Step 4d regression: malformed legacy data is quarantined (not lost) and never blocks Account B\'s own scoped settings from restoring', async ({ page }) => {
  const result = await page.evaluate(() => {
    // B already has real, valid scoped settings from an earlier session.
    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B
    saveAccountPaySettings({ payType: 'cpm', cpmRate: 0.72, grossPercent: 0, cpmBase: 'total' });
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, ''); // B -> A
    const aAccountId = currentAccountIdentity().accountId;

    // Now A's own legacy value is corrupted (e.g. a bad write from an old app version).
    localStorage.setItem('fiqD_paySettings', '{corrupt');

    applyAuthRestoreData({ crewId: 'CREW-SWITCH-TEST', email: 'switch-target@example.test' }, ''); // A -> B again

    // Find whatever quarantine key got created for A's accountId and read it back directly —
    // this is the check the previous version of this test never made, and the exact gap
    // flagged in review: B's restore used to silently overwrite A's corrupt string.
    const quarantineKeys = Object.keys(localStorage).filter(k => k.startsWith('fiqD_paySettings_quarantine_' + aAccountId + '_'));
    const quarantinedRaw = quarantineKeys.length ? localStorage.getItem(quarantineKeys[0]) : null;

    return {
      payType: driver.payType, cpmRate: driver.cpmRate, cpmBase: driver.cpmBase,
      quarantineKeys, quarantinedRaw,
    };
  });
  // A's corrupt legacy value is genuinely findable in quarantine, not silently discarded.
  expect(result.quarantineKeys.length).toBe(1);
  expect(result.quarantinedRaw).toBe('{corrupt');
  // B's own valid scoped record still restores correctly — quarantining A's corrupt value
  // never blocked or corrupted B's own data.
  expect(result.payType).toBe('cpm');
  expect(result.cpmRate).toBe(0.72);
  expect(result.cpmBase).toBe('total');
});

test('Step 4b regression: a legitimately saved zero rate is applied, not silently replaced by a fallback', async ({ page }) => {
  const result = await page.evaluate(() => {
    // A deliberately zeroed-out CPM rate (e.g. payType is gross_percent, cpmRate genuinely 0).
    saveAccountPaySettings({ payType: 'gross_percent', cpmRate: 0, grossPercent: 25, cpmBase: 'loaded' });
    // Poison driver's in-memory value first so a `|| driver.cpmRate` fallback bug would be visible.
    driver.cpmRate = 999;
    const sameAccountResult = (() => {
      applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, '');
      return driver.cpmRate;
    })();

    // Same check through restoreFleetConfigFromOrchestrator's server-reconciliation path.
    driver.cpmRate = 999;
    const existing = loadAccountPaySettings();
    const reconciled = reconcilePaySettings(existing, { payType: 'gross_percent', cpmRate: 0, grossPercent: 25, cpmBase: 'loaded' });
    driver.cpmRate = reconciled.cpmRate;
    driver.grossPercent = reconciled.grossPercent;

    return { sameAccountResult, orchestratorPathCpmRate: driver.cpmRate, orchestratorPathGrossPercent: driver.grossPercent };
  });
  expect(result.sameAccountResult).toBe(0);
  expect(result.orchestratorPathCpmRate).toBe(0);
  expect(result.orchestratorPathGrossPercent).toBe(25);
});

test('Step 3 regression: an account first getting a crewId is not a false switch (email E -> crewId C + email E)', async ({ page }) => {
  const kind = await page.evaluate(() =>
    identityTransitionKind({ crewId: '', email: 'same@example.test' }, { crewId: 'NEW-CREW', email: 'same@example.test' })
  );
  expect(kind).toBe('unchanged');
});

test('Step 3 regression: a response temporarily missing crewId is not a false switch (crewId C + email E -> only email E)', async ({ page }) => {
  const kind = await page.evaluate(() =>
    identityTransitionKind({ crewId: 'CREW-X', email: 'same@example.test' }, { crewId: '', email: 'same@example.test' })
  );
  expect(kind).toBe('unchanged');
});

test('Step 3 regression: genuinely different crewId and email still classify as a switch', async ({ page }) => {
  const kind = await page.evaluate(() =>
    identityTransitionKind({ crewId: 'CREW-X', email: 'a@example.test' }, { crewId: 'CREW-Y', email: 'b@example.test' })
  );
  expect(kind).toBe('switch');
});

// ── REAL logout->login regressions (Step 4e) ──────────────────────────────────────────────
// Every switch test above calls applyAuthRestoreData() twice in the same in-memory page
// session — that correctly exercises the 'switch' transition, but it is NOT what the shipped
// UI actually does. The only real way to log in as someone else is: tap "Log out from this
// device" (logoutDevice(), which clears `driver` and calls location.reload()), THEN log in on
// the resulting empty setup screen. previousIdentity is therefore always empty at that point,
// and identityTransitionKind() always classifies the next login as 'initial', never 'switch' —
// a gap the in-memory tests above cannot see because they never reload the page. These three
// tests exercise the real reload path instead.
test('Real logout->login cycle never leaks account A\'s pay rate to account B', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    saveAccountPaySettings({ payType: 'gross_percent', cpmRate: 0, grossPercent: 42, cpmBase: 'loaded' });
  });
  const beforeLogout = await page.evaluate(() => ({
    legacyPaySettings: JSON.parse(localStorage.getItem('fiqD_paySettings')),
    accountId: driver.accountId,
  }));
  expect(beforeLogout.legacyPaySettings.grossPercent).toBe(42);

  // Real logout: confirm() is auto-accepted above, and the page genuinely reloads — this is
  // exactly the path that bypassed 'switch' detection before the fix.
  // logoutDevice() calls location.reload() itself, which destroys the execution context mid-
  // call — evaluate() legitimately never gets to resolve/serialize a return value for it, so
  // race it against the navigation instead of awaiting it first.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.evaluate(() => { logoutDevice(); }).catch(() => {}),
  ]);

  // Account B logs in on the same device — a genuinely different identity, never seen before.
  await page.evaluate(() => {
    applyAuthRestoreData({ crewId: 'CREW-B-REAL-LOGOUT', email: 'b-real-logout@example.test' }, '');
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    applyRoleUI();
  });
  const afterBLogin = await page.evaluate(() => ({
    payType: driver.payType,
    grossPercent: driver.grossPercent,
    accountId: driver.accountId,
    legacyPaySettingsAfter: localStorage.getItem('fiqD_paySettings'),
  }));
  expect(afterBLogin.payType).toBe('cpm');       // B's clean base default, not A's gross_percent
  expect(afterBLogin.grossPercent).toBe(0);       // not A's 42
  expect(afterBLogin.accountId).not.toBe(beforeLogout.accountId);
  // A's rate was archived into A's own scope before B ever logged in, not left in the legacy
  // mirror for B's own applyAuthRestoreData() call to pick up.
  expect(afterBLogin.legacyPaySettingsAfter).toBeNull();
});

test('Real A->logout/reload->B->logout/reload->A restores both A\'s accountId and A\'s pay rate', async ({ page }) => {
  page.on('dialog', d => d.accept());
  const aFirst = await page.evaluate(() => {
    saveAccountPaySettings({ payType: 'gross_percent', cpmRate: 0, grossPercent: 42, cpmBase: 'loaded' });
    return driver.accountId;
  });

  // A -> logout/reload -> B
  // logoutDevice() calls location.reload() itself, which destroys the execution context mid-
  // call — evaluate() legitimately never gets to resolve/serialize a return value for it, so
  // race it against the navigation instead of awaiting it first.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.evaluate(() => { logoutDevice(); }).catch(() => {}),
  ]);
  const bFirst = await page.evaluate(() => {
    applyAuthRestoreData({ crewId: 'CREW-B-ROUNDTRIP', email: 'b-roundtrip@example.test' }, '');
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    applyRoleUI();
    saveAccountPaySettings({ payType: 'cpm', cpmRate: 0.9, grossPercent: 0, cpmBase: 'total' });
    return driver.accountId;
  });

  // B -> logout/reload -> A
  // logoutDevice() calls location.reload() itself, which destroys the execution context mid-
  // call — evaluate() legitimately never gets to resolve/serialize a return value for it, so
  // race it against the navigation instead of awaiting it first.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.evaluate(() => { logoutDevice(); }).catch(() => {}),
  ]);
  const aSecond = await page.evaluate(() => {
    applyAuthRestoreData({ crewId: 'CREW-PROJECTION-TEST', email: 'projection@example.test' }, '');
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    applyRoleUI();
    return { accountId: driver.accountId, payType: driver.payType, grossPercent: driver.grossPercent };
  });

  expect(bFirst).not.toBe(aFirst);
  expect(aSecond.accountId).toBe(aFirst); // A's registry-backed id survived a real logout cycle
  expect(aSecond.payType).toBe('gross_percent'); // A's own rate restored, not B's or the clean default
  expect(aSecond.grossPercent).toBe(42);
});

test('Real logout is cancelled, not completed, when the outgoing pay settings cannot be safely archived', async ({ page }) => {
  const alerts = [];
  page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  const before = await page.evaluate(() => {
    // Corrupt legacy value that will need quarantining, then force quarantining itself to fail
    // (e.g. storage full) — the exact 'quarantine_failed' outcome importLegacyPaySettingsIntoScope()
    // can return, this time reached through logoutDevice() rather than called directly.
    localStorage.setItem('fiqD_paySettings', '{not valid json');
    window.__realSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      if (key.indexOf('fiqD_paySettings_quarantine_') === 0) throw new Error('quota exceeded (simulated)');
      return window.__realSetItem(key, value);
    };
    return { accountId: driver.accountId, driverStillSet: !!localStorage.getItem('fiqD_driver') };
  });
  expect(before.driverStillSet).toBe(true);

  await page.evaluate(() => { logoutDevice(); });
  // Give any (incorrect) reload a moment to happen; none should.
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    localStorage.setItem = window.__realSetItem;
    return {
      accountId: (typeof driver !== 'undefined' && driver) ? driver.accountId : null,
      driverStillSet: !!localStorage.getItem('fiqD_driver'),
      legacyPaySettingsUntouched: localStorage.getItem('fiqD_paySettings'),
    };
  });
  // Logout must NOT have completed: the session is still active, `driver` was never cleared,
  // and the corrupt value that couldn't be quarantined is still exactly where it was.
  expect(after.driverStillSet).toBe(true);
  expect(after.accountId).toBe(before.accountId);
  expect(after.legacyPaySettingsUntouched).toBe('{not valid json');
  expect(alerts.some(m => /Logout cancelled/i.test(m))).toBe(true);
});

test('fleet config restore uses the globally reachable stored Orchestrator URL and reaches the read endpoint', async ({ page }) => {
  const base = 'https://orchestrator.example.test';
  const expectedUrl = `${base}/v1/fleet/config/pwa?crewbiq_id=CREW-PROJECTION-TEST`;
  const observed = await page.evaluate(async orchestratorBase => {
    localStorage.setItem('fiqD_orchestratorUrl', `${orchestratorBase}/v1/sync`);
    localStorage.removeItem('fiqD_orchestratorSecret');
    localStorage.removeItem('fiqD_orchestratorSecretBackup');
    let requestedUrl = '';
    window.fetch = async url => {
      requestedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, trucks: [], driver_profiles: [] }),
      };
    };
    const result = await restoreFleetConfigFromOrchestrator('CREW-PROJECTION-TEST');
    return { result, requestedUrl };
  }, base);

  expect(observed.result.ok).toBe(true);
  expect(observed.requestedUrl).toBe(expectedUrl);
});
