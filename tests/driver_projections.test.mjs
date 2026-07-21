import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Account Identity projection reads identity fields only, never name/company/pay', () => {
  assert.match(html, /function currentAccountIdentity\(\)/);
  for (const field of ['accountId', 'crewId', 'driverId', 'email', 'ownerKey', 'identityKey']) {
    assert.match(html, new RegExp(`function currentAccountIdentity\\(\\)\\{[\\s\\S]{0,400}${field}:`), `must expose ${field}`);
  }
  const identityBody = html.match(/function currentAccountIdentity\(\)\{[\s\S]{0,400}?\n\}/)[0];
  assert.doesNotMatch(identityBody, /\b(name|company|payType|truckName)\b/);
  // Must not touch dataKey/scopedLoad/scopedSave or auth restore — read-only over existing driver.
  assert.doesNotMatch(identityBody, /(scopedLoad|scopedSave|dataKey\()/);
});

test('Person Profile projection excludes company/truck/pay/PTI/sync fields', () => {
  assert.match(html, /function currentPersonProfile\(\)/);
  assert.match(html, /function normalizeDriverProfile\(profile\)/);
  for (const fn of ['currentPersonProfile', 'normalizeDriverProfile']) {
    const body = html.match(new RegExp(`function ${fn}\\([^)]*\\)\\{[\\s\\S]{0,500}?\\n\\}`));
    assert.ok(body, `${fn} body must be found`);
    assert.doesNotMatch(body[0], /\b(company|truckName|unitNumber|plate|payType|cpmRate|grossPercent|cpmBase|ptiSchedule|syncUrl)\b/,
      `${fn} must not reference vehicle/company/pay/PTI/sync fields`);
  }
  // Roster entries are never auto-linked to the signed-in account's email.
  assert.doesNotMatch(html, /function normalizeDriverProfile\(profile\)\{[\s\S]{0,400}driver\.email/);
});

test('Compensation Terms projections keep legacy split fields and unify roster rate by payType', () => {
  assert.match(html, /function currentCompensationTerms\(\)/);
  assert.match(html, /function compensationTermsFromProfile\(profile\)/);
  // Global driver: read split fields directly, no unification.
  assert.match(html, /function currentCompensationTerms\(\)\{[\s\S]{0,400}cpmRate: Number\(\(driver && driver\.cpmRate\) \|\| 0\)/);
  assert.match(html, /function currentCompensationTerms\(\)\{[\s\S]{0,400}grossPercent: Number\(\(driver && driver\.grossPercent\) \|\| 0\)/);
  // Roster profile: cpmRate/grossPercent fall back to unified `rate`, selected by payType.
  assert.match(html, /cpmRate: payType === 'cpm' \? Number\(profile\.cpmRate \|\| profile\.rate \|\| 0\) : 0/);
  assert.match(html, /grossPercent: payType === 'gross_percent' \? Number\(profile\.grossPercent \|\| profile\.rate \|\| 0\) : 0/);
  // No effective-date storage exists yet — must not invent one.
  assert.match(html, /function currentCompensationTerms\(\)\{[\s\S]{0,400}effectiveFrom: null,\s*effectiveTo: null,/);
  assert.match(html, /function compensationTermsFromProfile\(profile\)\{[\s\S]{0,500}effectiveFrom: null,\s*effectiveTo: null,/);
});

test('Driver Assignment projections resolve truck/company through the existing mechanisms without persisting anything', () => {
  assert.match(html, /function currentDriverAssignment\(\)/);
  assert.match(html, /function driverAssignmentFromProfile\(profile\)/);
  // Current-user assignment must go through getDefaultTruck() + truckCarrierAssignment().
  assert.match(html, /function currentDriverAssignment\(\)\{[\s\S]{0,300}getDefaultTruck\(\)/);
  assert.match(html, /function currentDriverAssignment\(\)\{[\s\S]{0,500}truckCarrierAssignment\(truck\)/);
  // Roster assignment must use the explicit profile.truckId link, not unit-number inference.
  assert.match(html, /function driverAssignmentFromProfile\(profile\)\{[\s\S]{0,300}profile\.truckId \? loadTrucks\(\)\.find/);
  // teamId is always empty in both projections — teamDriver is never reinterpreted as a team id.
  assert.match(html, /function currentDriverAssignment\(\)\{[\s\S]{0,900}teamId: '',/);
  assert.match(html, /function driverAssignmentFromProfile\(profile\)\{[\s\S]{0,900}teamId: '',/);
  // The incompatible legacy field is carried as metadata only, named distinctly from teamId.
  assert.match(html, /legacyTeamDriver: !!profile\.teamDriver/);
  // Nothing in either projection writes to storage.
  for (const fn of ['currentDriverAssignment', 'driverAssignmentFromProfile']) {
    const body = html.match(new RegExp(`function ${fn}\\([^)]*\\)\\{[\\s\\S]{0,900}?\\n\\}`));
    assert.doesNotMatch(body[0], /(saveTrucks|saveDriverProfiles|saveCompanies|scopedSave)\(/, `${fn} must not persist anything`);
  }
});

test('ensureAccountId backfills a stable local id, idempotently, without wiring it into storage scoping', () => {
  assert.match(html, /function generateAccountId\(\)/);
  assert.match(html, /function ensureAccountId\(\)/);
  // crypto.randomUUID() preferred, prefixed to mark it as a client-local id.
  assert.match(html, /'acct_local_' \+ crypto\.randomUUID\(\)/);
  // stableHash fallback only, for environments without crypto.randomUUID.
  assert.match(html, /return 'acct_local_' \+ stableHash\(/);
  // Idempotent: an existing non-empty id is returned as-is, never regenerated.
  assert.match(html, /function ensureAccountId\(\)\{\s*if\(!driver\) return '';\s*if\(driver\.accountId\) return driver\.accountId;/);
  // The backfill is a real, addressable write — persisted via the same save() the rest of
  // the driver object uses, not silently held only in memory.
  assert.match(html, /function ensureAccountId\(\)\{[\s\S]{0,300}save\('driver', driver\);/);
  // Must run before identity projections are used: called from both driver-load entry points.
  assert.match(html, /driver = load\('driver', null\);\s*ensureAccountId\(\);/);
  assert.match(html, /ensureAccountId\(\);[\s\S]{0,350}if\(typeof data\.pointsBalance/);
  // Not yet wired into storage-key derivation — dataKey/scopedLoad/scopedSave/getDriverIdentityKey
  // must not reference accountId at this step.
  for (const fn of ['dataKey', 'scopedLoad', 'scopedSave', 'getDriverIdentityKey']) {
    const body = html.match(new RegExp(`function ${fn}\\([^)]*\\)\\{[\\s\\S]{0,300}?\\n?\\}`));
    assert.ok(body, `${fn} body must be found`);
    assert.doesNotMatch(body[0], /accountId/, `${fn} must not reference accountId yet`);
  }
  // Never exposed as an editable Settings field.
  assert.doesNotMatch(html, /id="setAccountId"/);
});

test('identityTransitionKind compares raw crewId/email fields, not a collapsed identity-key string', () => {
  assert.match(html, /function identityTransitionKind\(previous, next\)\{/);
  assert.match(html, /if\(!prevCrew && !prevEmail\) return 'initial';/);
  // crewId is authoritative when comparable on both sides — checked (and returns) before email.
  assert.match(html, /if\(prevCrew && nextCrew\) return prevCrew === nextCrew \? 'unchanged' : 'switch';/);
  assert.match(html, /if\(prevEmail && nextEmail\) return prevEmail === nextEmail \? 'unchanged' : 'switch';/);
  // Fail-safe default when neither field is comparable on both sides.
  assert.match(html, /function identityTransitionKind\(previous, next\)\{[\s\S]{0,1200}return 'switch';\s*\n\}/);
});

test('applyAuthRestoreData captures the pre-restore identity as raw fields and never lets an account switch inherit the old local accountId', () => {
  // previousIdentity must be read from the OLD driver's raw crewId/email before reassignment —
  // not a collapsed getDriverIdentityKey() string (that was the false-switch bug, see below).
  assert.match(html, /function applyAuthRestoreData\(data, syncUrl\)\{\s*(?:\/\/[^\n]*\n\s*)*var previousIdentity = \{crewId:\(driver&&driver\.crewId\)\|\|'', email:\(driver&&driver\.email\)\|\|''\};/);
  // Backfill: the outgoing driver's accountId is registered against its own identity before
  // unwrapAuthResponse() runs — closes the gap where an account's id, once minted, was never
  // recorded anywhere findable again on a later switch back to it (see Step 4c registry test).
  assert.match(html, /if\(driver && driver\.accountId\) registerAccountId\(previousIdentity, driver\.accountId\);\s*data=unwrapAuthResponse\(data\);/);
  assert.match(html, /const transition = identityTransitionKind\(previousIdentity, \{crewId, email\}\);/);
  // On a genuine switch, accountId resolves through the registry (reuse if this identity has
  // been seen before, mint+register otherwise) rather than inheriting whatever the object-spread
  // merge happened to carry over, and rather than always minting a fresh one (see registry test).
  // 'initial' (with a known crewId/email) resolves through the registry too — real logout via
  // logoutDevice() clears `driver` and reloads before the next login, so previousIdentity is
  // always empty and every real logout->login cycle classifies as 'initial', not 'switch'.
  // Without this, a returning account could never find the accountId logoutDevice() registered
  // for it, and would mint a fresh one on every login.
  assert.match(html, /if\(transition === 'switch' \|\| \(transition === 'initial' && \(crewId \|\| email\)\)\)\{\s*driver\.accountId = resolveAccountId\(\{crewId, email\}, ''\);\s*\}\s*ensureAccountId\(\);/);
  assert.match(html, /registerAccountId\(\{crewId: driver\.crewId, email: driver\.email\}, driver\.accountId\);/);
});

test('Step 4c: account registry gives the same identity the same local accountId across repeated switches', () => {
  assert.match(html, /function accountRegistryKey\(identity\)/);
  assert.match(html, /function loadAccountRegistry\(\)\{ return load\('accountRegistry', \{\}\); \}/);
  assert.match(html, /function saveAccountRegistry\(reg\)\{ save\('accountRegistry', reg \|\| \{\}\); \}/);
  assert.match(html, /function registerAccountId\(identity, accountId\)/);
  assert.match(html, /function resolveAccountId\(identity, fallbackAccountId\)/);
  // crewId wins over email when both are present — same precedence as identityTransitionKind().
  assert.match(html, /function accountRegistryKey\(identity\)\{[\s\S]{0,300}if\(crew\) return 'crew:'\+crew;\s*if\(email\) return 'email:'\+email;/);
  // registerAccountId never overwrites an existing mapping for the same key.
  assert.match(html, /function registerAccountId\(identity, accountId\)\{[\s\S]{0,300}if\(registry\[key\]\) return;/);
  // resolveAccountId reuses a registered id before ever minting a new one.
  assert.match(html, /function resolveAccountId\(identity, fallbackAccountId\)\{[\s\S]{0,300}if\(key && registry\[key\]\) return registry\[key\];/);
});

test('applyAuthRestoreData never lets a switch leave stale loads/ptiLog under the new account\'s scoped key', () => {
  assert.match(html, /if\(Array\.isArray\(data\.loads\)\)\{\s*loads = sortLoadsNewest\(data\.loads\);\s*\} else if\(transition === 'switch'\)\{\s*loads = sortLoadsNewest\(scopedLoad\('loads', \[\]\) \|\| \[\]\);\s*\}/);
  assert.match(html, /if\(Array\.isArray\(data\.ptiLog\)\)\{\s*ptiLog = data\.ptiLog;\s*\} else if\(transition === 'switch'\)\{\s*ptiLog = scopedLoad\('ptiLog', \[\]\) \|\| \[\];\s*\}/);
});

test('Step 4b: a single scoped pay-settings layer exists with reconciliation by savedAt', () => {
  assert.match(html, /function normalizePaySettings\(raw\)/);
  assert.match(html, /function reconcilePaySettings\(local, incoming\)/);
  assert.match(html, /function loadAccountPaySettings\(\)/);
  assert.match(html, /function saveAccountPaySettings\(value\)/);
  assert.match(html, /function importLegacyPaySettingsIntoScope\(\)/);
  // Missing savedAt on either side keeps the existing local record — never a silent overwrite.
  assert.match(html, /function reconcilePaySettings\(local, incoming\)\{[\s\S]{0,300}if\(!incomingNorm\.savedAt \|\| !localNorm\.savedAt\) return localNorm;/);
  assert.match(html, /return incomingNorm\.savedAt > localNorm\.savedAt \? incomingNorm : localNorm;/);
  // Explicit save always stamps and persists through the scoped layer, with a legacy mirror.
  assert.match(html, /function saveAccountPaySettings\(value\)\{[\s\S]{0,400}scopedSave\('paySettings', normalized\);[\s\S]{0,200}localStorage\.setItem\(K\+'paySettings', JSON\.stringify\(normalized\)\);/);
});

test('Step 4d: invalid legacy JSON is quarantined with its raw content, never silently lost or silently kept blocking', () => {
  assert.match(html, /function quarantineLegacyPaySettings\(rawValue\)/);
  assert.match(html, /var key = 'paySettings_quarantine_' \+ accountId \+ '_' \+ Date\.now\(\);/);
  // Parse failure attempts quarantine first; only a successful write allows legacyCleared:true.
  assert.match(html, /catch\(e\)\{\s*var quarantineKey = quarantineLegacyPaySettings\(legacyRaw\);/);
  assert.match(html, /if\(!quarantineKey\)\{[\s\S]{0,250}return \{reconciled: loadAccountPaySettings\(\), legacyCleared: false, outcome: 'quarantine_failed'\};/);
  assert.match(html, /return \{reconciled: loadAccountPaySettings\(\), legacyCleared: true, outcome: 'quarantined', quarantineKey: quarantineKey\};/);
  // {} (valid JSON, no usable payType) is explicitly its own outcome — a deliberate cleanup of
  // nothing, distinct from both a real import and a quarantined corrupt value.
  assert.match(html, /if\(!normalizePaySettings\(legacyParsed\)\)\{[\s\S]{0,250}return \{reconciled: existing, legacyCleared: true, outcome: 'no_usable_data'\};/);
});

test('Step 4b: applyAuthRestoreData and saveSettings all route through the shared pay-settings layer', () => {
  // Archive (outgoing account, before driver reassignment) uses the layer's import function,
  // and only clears the legacy key when it actually consumed something.
  assert.match(html, /const previousDriverForFallback = carryLocalFields \? driver : null;[\s\S]{0,900}if\(transition === 'switch'\)\{\s*var outgoingImport = importLegacyPaySettingsIntoScope\(\);\s*if\(outgoingImport\.legacyCleared\) localStorage\.removeItem\(K\+'paySettings'\);/);
  // Restore (incoming account, after driver reassignment) reads via the layer and re-mirrors.
  assert.match(html, /if\(transition === 'switch'\)\{[\s\S]{0,650}var incomingPay = loadAccountPaySettings\(\);\s*if\(incomingPay\)\{/);
  assert.match(html, /saveAccountPaySettings\(incomingPay\);/);
  // Same-account branch also goes through import+reconcile, not a raw legacy-key read.
  assert.match(html, /var sameAccountImport = importLegacyPaySettingsIntoScope\(\);/);
  assert.match(html, /saveAccountPaySettings\(sameAccountImport\.reconciled\);/);
  // saveSettings() no longer writes the legacy key directly.
  assert.doesNotMatch(html, /localStorage\.setItem\(K\+'paySettings', JSON\.stringify\(\{\s*payType: driver\.payType, cpmRate: driver\.cpmRate,/);
  assert.match(html, /saveAccountPaySettings\(\{\s*payType: driver\.payType, cpmRate: driver\.cpmRate,\s*grossPercent: driver\.grossPercent, cpmBase: driver\.cpmBase\s*\}\);/);
});

test('Step 4b: restoreFleetConfigFromOrchestrator reconciles server pay_config instead of a raw "if not set" check', () => {
  assert.match(html, /var existingScopedPay = loadAccountPaySettings\(\);\s*var reconciledFromServer = reconcilePaySettings\(existingScopedPay, data\.pay_config\);/);
  assert.doesNotMatch(html, /Restore pay settings if not already set locally/);
});

test('restoreFleetConfigFromOrchestrator resolves the orchestrator URL via getStoredOrchestratorUrl, not sync.js-private getOrchestratorSyncUrl', () => {
  // getOrchestratorSyncUrl() is declared inside sync.js's IIFE and never exposed on window, so
  // `typeof getOrchestratorSyncUrl === 'function'` is always false in the browser — the old code
  // silently no-op'd every fleet-config restore. getStoredOrchestratorUrl() (index.html) is the
  // globally reachable function that actually resolves a real default URL.
  assert.match(html, /async function restoreFleetConfigFromOrchestrator\(crewbiqId\)\{\s*var orchUrl = \(typeof getStoredOrchestratorUrl === 'function'\) \? getStoredOrchestratorUrl\(\) : '';/);
});

test('Step 3: an account switch never inherits the previous person\'s local driver fields', () => {
  // The generic spread of the previous `driver` object is gated by carryLocalFields, which is
  // false exactly when transition === 'switch' — so a switch starts from `base` + server data
  // only, never the old person's locally-edited fields (pay rate, team driver, company, etc).
  assert.match(html, /const carryLocalFields = transition !== 'switch';/);
  assert.match(html, /const previousDriverForFallback = carryLocalFields \? driver : null;/);
  assert.match(html, /\.\.\.\(carryLocalFields \? \(driver\|\|\{\}\) : \{\}\),/);
  // The name fallback chain referenced the old `driver` directly — a raw `driver&&driver.name`
  // here would silently leak the previous person's display name into a switched-to account.
  assert.doesNotMatch(html, /name:profileDriver\.name[\s\S]{0,80}\(driver&&driver\.name\)/);
  assert.match(html, /\(previousDriverForFallback&&previousDriverForFallback\.name\)/);
  // syncUrl is deliberately NOT gated — it's device/environment config (which Orchestrator
  // this device talks to), not personal user data; getAuthSyncUrl() itself intentionally falls
  // back to whatever driver.syncUrl currently holds, and other call sites rely on that.
  assert.match(html, /syncUrl:syncUrl \|\| getAuthSyncUrl\(\) \|\| DEFAULT_SYNC_URL,/);
});

test('saveSettings never treats its own identity-key change as an account switch', () => {
  const block = html.match(/const newIdentityKey = getDriverIdentityKey\(driver\);[\s\S]{0,900}?\n  \}/)[0];
  assert.match(block, /PROFILE CHANGE/);
  assert.doesNotMatch(block, /identityTransitionKind|driver\.accountId = ''/,
    'saveSettings must not reuse the account-switch classification or clear accountId — it is always the same account editing itself');
});

test('identity-scope bug is documented as a known gap, not fixed in this patch', () => {
  // saveSettings() only re-scopes loads/ptiLog on an identity-key change — trucks,
  // driverProfiles and companies stay silently pointed at the old scoped key. This test
  // locks in that this remains true today; fixing it is an explicit separate step.
  assert.match(html, /if\(oldIdentityKey && newIdentityKey && oldIdentityKey !== newIdentityKey\)\{\s*saveDriverScopedData\(\);\s*loadDriverScopedData\(false\);/);
  const identityChangeBlock = html.match(/if\(oldIdentityKey && newIdentityKey && oldIdentityKey !== newIdentityKey\)\{[\s\S]{0,300}?\n  \}/);
  assert.ok(identityChangeBlock, 'identity-change block must be found');
  assert.doesNotMatch(identityChangeBlock[0], /(loadTrucks|saveTrucks|loadDriverProfiles|saveDriverProfiles|loadCompanies|saveCompanies)\(/,
    'known gap: trucks/driverProfiles/companies are not re-scoped on identity change (see Driver audit risk 4) — do not silently fix this here');
});

console.log('Driver projections contract: ok');
