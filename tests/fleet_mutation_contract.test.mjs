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

test('full sync exposes a result for mutation callers', () => {
  assert.match(syncSource, /return \{\s*ok: !dbFailed,/);
  assert.match(syncSource, /return \{ ok: false, error: e\.message \};/);
  assert.match(syncSource, /async function forceFullSync\(\)\s*\{\s*return doSync\(\{\s*forceAll: true\s*\}\);/);
});

console.log('Fleet mutation contract: ok');
