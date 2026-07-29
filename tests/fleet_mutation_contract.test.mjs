import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');

test('driver edit carries explicit CPM and gross fields and requires sync result', () => {
  assert.match(indexSource, /async function saveDriverForm\(\)/);
  assert.match(indexSource, /payType:\s+payType/);
  assert.match(indexSource, /rate:\s+rate/);
  assert.match(indexSource, /cpmRate:\s+payType === 'cpm' \? rate : 0/);
  assert.match(indexSource, /grossPercent:\s+payType === 'gross_percent' \? rate : 0/);
  assert.match(indexSource, /var synced = await syncFleetConfigMutation\(\)/);
  assert.match(indexSource, /if\(!synced\) return;/);
});

test('driver delete writes an explicit inactive tombstone and syncs it', () => {
  assert.match(indexSource, /async function deleteDriverConfirm\(id\)/);
  assert.match(indexSource, /active:\s+false/);
  assert.match(indexSource, /terminatedAt:\s+list\[idx\]\.terminatedAt \|\| today\(\)/);
  assert.match(indexSource, /var synced = await syncFleetConfigMutation\(\)/);
  assert.doesNotMatch(indexSource, /deleteDriverConfirm[\s\S]{0,900}loadDriverProfiles\(\)\.filter\(function\(x\)\{ return x\.id!==id; \}\)/);
});

test('truck delete writes an explicit inactive tombstone and syncs it', () => {
  // Regression test: deleteTruckConfirm() used to only remove the truck from
  // the local array. Trucks are upsert-only server-side (no delete-on-omission
  // snapshot semantics), so the server row was never told to deactivate --
  // confirmed in production, a stale local push resurrected an already-deleted
  // truck hours after cleanup. Must mirror deleteDriverConfirm()'s fix.
  assert.match(indexSource, /async function deleteTruckConfirm\(id\)/);
  assert.match(indexSource, /deleteTruckConfirm[\s\S]{0,1500}active:\s+false/);
  assert.match(indexSource, /deleteTruckConfirm[\s\S]{0,1500}var synced = await syncFleetConfigMutation\(\)/);
  assert.doesNotMatch(indexSource, /deleteTruckConfirm[\s\S]{0,1500}loadTrucks\(\)\.filter\(function\(x\)\{ return x\.id!==id; \}\)/);
});

test('full sync exposes a result for mutation callers', () => {
  assert.match(syncSource, /return \{\s*ok: !dbFailed,/);
  assert.match(syncSource, /return \{ ok: false, error: e\.message \};/);
  assert.match(syncSource, /async function forceFullSync\(\)\s*\{\s*return doSync\(\{\s*forceAll: true\s*\}\);/);
});

test('fleet mutation sync uses authenticated PWA write contract', () => {
  assert.match(syncSource, /function buildAuthenticatedPwaHeaders\(\)/);
  assert.match(syncSource, /headers\.Authorization = 'Bearer ' \+ sessionToken/);
  assert.match(syncSource, /async function forceFleetConfigSync\(\)/);
  assert.match(syncSource, /getPwaOrchestratorSyncUrl\(getOrchestratorSyncUrl\(\)\)/);
  assert.match(indexSource, /typeof forceFleetConfigSync !== 'function'/);
  assert.match(indexSource, /var synced = await syncFleetConfigMutation\(\)/);
});

test('saveTruckForm extracts complete function body from first opening brace', () => {
  // Find the function marker and its first opening brace, then extract the
  // complete body by matching braces with nesting-depth tracking.
  const funcStart = indexSource.indexOf('function saveTruckForm()');
  assert.ok(funcStart >= 0);
  const bodyStart = indexSource.indexOf('{', funcStart);
  assert.ok(bodyStart >= 0);
  let depth = 0;
  let pos = bodyStart;
  for (; pos < indexSource.length; pos++) {
    if (indexSource[pos] === '{') depth++;
    if (indexSource[pos] === '}') depth--;
    if (depth === 0) break;
  }
  assert.ok(depth === 0);
  const body = indexSource.slice(bodyStart + 1, pos);
  assert.ok(body.length > 100);
  assert.ok(body.includes('mode === \'edit\''));
  assert.ok(body.includes('sensitiveChanged'));
  assert.ok(body.includes('confirm('));
  assert.ok(body.includes('carrierAssignmentHistory.push'));
  assert.ok(body.includes('saveTrucks(list)'));
  assert.ok(body.includes('closeTruckModal()'));
  assert.ok(body.includes('renderTrucksList()'));
  assert.ok(body.includes('renderFleetPage()'));
  assert.ok(body.includes('renderFleetStats()'));
  assert.ok(body.includes('queueFleetConfigSync()'));
  assert.ok(body.includes('toast('));
});

test('saveTruckForm sensitiveChanged contains all five approved comparisons', () => {
  const funcStart = indexSource.indexOf('function saveTruckForm()');
  assert.ok(funcStart >= 0);
  const bodyStart = indexSource.indexOf('{', funcStart);
  assert.ok(bodyStart >= 0);
  let depth = 0;
  let pos = bodyStart;
  for (; pos < indexSource.length; pos++) {
    if (indexSource[pos] === '{') depth++;
    if (indexSource[pos] === '}') depth--;
    if (depth === 0) break;
  }
  const body = indexSource.slice(bodyStart + 1, pos);
  const sensitivePattern = /var\s+sensitiveChanged\s*=\s*([^;]+);/;
  const match = body.match(sensitivePattern);
  assert.ok(match, 'sensitiveChanged expression not found in body');
  const expr = match[1];
  assert.ok(expr.includes('normalizedActiveNew'), 'missing normalizedActiveNew');
  assert.ok(expr.includes('normalizedActiveOld'), 'missing normalizedActiveOld');
  assert.ok(expr.includes('carrierAssignmentTermsChanged(existingAssignment, carrierAssignment)'), 'missing carrierAssignmentTermsChanged');
  assert.ok(expr.includes('effectiveFromNew'), 'missing effectiveFromNew');
  assert.ok(expr.includes('effectiveFromOld'), 'missing effectiveFromOld');
  assert.ok(expr.includes('maintRateNew'), 'missing maintRateNew');
  assert.ok(expr.includes('maintRateOld'), 'missing maintRateOld');
  assert.ok(expr.includes('purchaseCostNew'), 'missing purchaseCostNew');
  assert.ok(expr.includes('purchaseCostOld'), 'missing purchaseCostOld');
  // Also verify the comparisons use !==
  assert.ok(expr.includes('!=='), 'sensitiveChanged must use strict inequality');
  // Verify the five comparisons (normalized active is one comparison, carrierAssignmentTermsChanged another, etc.)
  assert.ok(expr.includes('normalizedActiveNew !== normalizedActiveOld'));
  assert.ok(expr.includes('effectiveFromNew !== effectiveFromOld'));
  assert.ok(expr.includes('maintRateNew !== maintRateOld'));
  assert.ok(expr.includes('purchaseCostNew !== purchaseCostOld'));
});

test('saveTruckForm edit-only confirm gate: exactly one confirm and immediate return on cancel', () => {
  const funcStart = indexSource.indexOf('function saveTruckForm()');
  assert.ok(funcStart >= 0);
  const bodyStart = indexSource.indexOf('{', funcStart);
  assert.ok(bodyStart >= 0);
  let depth = 0;
  let pos = bodyStart;
  for (; pos < indexSource.length; pos++) {
    if (indexSource[pos] === '{') depth++;
    if (indexSource[pos] === '}') depth--;
    if (depth === 0) break;
  }
  const body = indexSource.slice(bodyStart + 1, pos);
  // Count confirm calls in the edit-only gate region (between sensitiveChanged check and the comment end)
  const confirmMatches = body.match(/confirm\(/g);
  assert.ok(confirmMatches, 'no confirm call found');
  assert.equal(confirmMatches.length, 1, 'exactly one confirm call expected');
  // Check that after confirm, there is an immediate return if cancelled
  const confirmReturnPattern = /if\s*\(\s*!confirm\([^)]*\)\s*\)\s*\{\s*return;?\s*\}/;
  assert.match(body, confirmReturnPattern, 'must have immediate return on cancel');
});

test('saveTruckForm confirm guard occurs before all listed effects', () => {
  const funcStart = indexSource.indexOf('function saveTruckForm()');
  assert.ok(funcStart >= 0);
  const bodyStart = indexSource.indexOf('{', funcStart);
  assert.ok(bodyStart >= 0);
  let depth = 0;
  let pos = bodyStart;
  for (; pos < indexSource.length; pos++) {
    if (indexSource[pos] === '{') depth++;
    if (indexSource[pos] === '}') depth--;
    if (depth === 0) break;
  }
  const body = indexSource.slice(bodyStart + 1, pos);
  // Find the confirm gate closing brace (the end of the edit-only block)
  const gateStart = body.indexOf('if (sensitiveChanged) {');
  assert.ok(gateStart >= 0, 'sensitiveChanged gate not found');
  // Find the matching close for that if block
  let gateDepth = 0;
  let gateEnd = -1;
  for (let i = gateStart; i < body.length; i++) {
    if (body[i] === '{') gateDepth++;
    if (body[i] === '}') {
      gateDepth--;
      if (gateDepth === 0) { gateEnd = i; break; }
    }
  }
  assert.ok(gateEnd > 0, 'could not find end of sensitiveChanged gate');
  const afterGate = body.slice(gateEnd + 1);
  // Now verify that carrierAssignmentHistory.push, list assignment, saveTrucks, etc. appear after gate
  const effectStmts = [
    'carrierAssignmentHistory.push',
    'list[idx]=entry',
    'list.push(entry)',
    'saveTrucks(list)',
    'closeTruckModal()',
    'renderTrucksList()',
    'renderFleetPage()',
    'renderFleetStats()',
    'queueFleetConfigSync()',
    'toast('
  ];
  for (const stmt of effectStmts) {
    const effectPos = afterGate.indexOf(stmt);
    assert.ok(effectPos >= 0, `effect "${stmt}" not found after confirm gate`);
  }
});

test('saveTruckForm significant expression excludes physical-identity fields', () => {
  const funcStart = indexSource.indexOf('function saveTruckForm()');
  assert.ok(funcStart >= 0);
  const bodyStart = indexSource.indexOf('{', funcStart);
  assert.ok(bodyStart >= 0);
  let depth = 0;
  let pos = bodyStart;
  for (; pos < indexSource.length; pos++) {
    if (indexSource[pos] === '{') depth++;
    if (indexSource[pos] === '}') depth--;
    if (depth === 0) break;
  }
  const body = indexSource.slice(bodyStart + 1, pos);
  const sensitivePattern = /var\s+sensitiveChanged\s*=\s*([^;]+);/;
  const match = body.match(sensitivePattern);
  assert.ok(match, 'sensitiveChanged expression not found');
  const expr = match[1];
  // Verify physical-identity fields are NOT referenced
  assert.ok(!expr.includes('unitNumber'), 'sensitiveChanged must not contain unitNumber');
  assert.ok(!expr.includes('year'), 'sensitiveChanged must not contain year');
  assert.ok(!expr.includes('make'), 'sensitiveChanged must not contain make');
  assert.ok(!expr.includes('model'), 'sensitiveChanged must not contain model');
  assert.ok(!expr.includes('plate'), 'sensitiveChanged must not contain plate');
  assert.ok(!expr.includes('VIN'), 'sensitiveChanged must not contain VIN');
  assert.ok(!expr.includes('vin'), 'sensitiveChanged must not contain vin');
});

function extractDriverFormBody() {
  const funcStart = indexSource.indexOf('function saveDriverForm()');
  assert.ok(funcStart >= 0);
  const bodyStart = indexSource.indexOf('{', funcStart);
  assert.ok(bodyStart >= 0);
  let depth = 0, pos = bodyStart;
  for (; pos < indexSource.length; pos++) {
    if (indexSource[pos] === '{') depth++;
    if (indexSource[pos] === '}') depth--;
    if (depth === 0) break;
  }
  assert.ok(depth === 0);
  return indexSource.slice(bodyStart + 1, pos);
}

test('saveDriverForm ordering: entry before gate before save before all later effects', () => {
  const body = extractDriverFormBody();
  const stmts = [
    'var entry = {',
    'var previousNormalized',
    'var candidateTeamMateChanged',
    'var consequentialDriverChanged',
    'confirm(',
    "if(mode === 'edit') list[idx]=normalizeDriverProfileRecord",
    'list[previousMateIndex] =',
    'list[mateIndexAfterSave] =',
    'saveDriverProfiles(list)',
    'closeDriverModal()',
    'renderDriversPage()',
    'renderFleetPage()',
    'renderFleetStats()',
    'syncFleetConfigMutation',
    "toast('Driver saved"
  ];
  let prevPos = -1;
  for (const stmt of stmts) {
    const pos = body.indexOf(stmt);
    assert.ok(pos >= 0, `statement not found: ${stmt}`);
    assert.ok(pos > prevPos, `out of order: ${stmt} at ${pos} <= ${prevPos}`);
    prevPos = pos;
  }
});

test('saveDriverForm edit-only one-confirm exact-message immediate-cancel contract', () => {
  const body = extractDriverFormBody();
  assert.ok(body.includes("if(mode === 'edit' && previousEntry)"), 'outer condition missing');
  const confirmMatches = body.match(/confirm\(/g);
  assert.equal(confirmMatches.length, 1, 'exactly one confirm call expected');
  const confirmPos = body.indexOf('confirm(');
  const confirmEnd = body.indexOf(')', confirmPos);
  const confirmMsg = body.slice(confirmPos, confirmEnd + 1);
  assert.equal(
    confirmMsg,
    "confirm('Compensation, employment status, truck assignment, or team assignment will change. No changes have been saved yet. Continue?')",
    'exact confirm message required'
  );
  // Allow the real conjunct pattern: if(consequentialDriverChanged && !confirm(...)){ return; }
  assert.match(
    body,
    /if\(consequentialDriverChanged && !confirm\('[^']*'\)\)\s*\{\s*return;\s*\}/,
    'must have immediate return on cancel via consequentialDriverChanged check'
  );
});

test('saveDriverForm confirm gate occurs before save and all later effects', () => {
  const body = extractDriverFormBody();
  const gateStart = body.indexOf("if(mode === 'edit' && previousEntry)");
  assert.ok(gateStart >= 0);
  let gateDepth = 0, gateEnd = -1;
  for (let i = gateStart; i < body.length; i++) {
    if (body[i] === '{') gateDepth++;
    if (body[i] === '}') {
      gateDepth--;
      if (gateDepth === 0) { gateEnd = i; break; }
    }
  }
  assert.ok(gateEnd > 0);
  const afterGate = body.slice(gateEnd + 1);
  const effectStmts = [
    "if(mode === 'edit') list[idx]=normalizeDriverProfileRecord",
    'list[previousMateIndex] =',
    'list[mateIndexAfterSave] =',
    'saveDriverProfiles(',
    'closeDriverModal(',
    'renderDriversPage(',
    'renderFleetPage(',
    'renderFleetStats(',
    'syncFleetConfigMutation(',
    "toast('Driver saved"
  ];
  for (const stmt of effectStmts) {
    assert.ok(afterGate.includes(stmt), `effect "${stmt}" not found after confirm gate`);
  }
});

console.log('Fleet mutation contract: ok');
