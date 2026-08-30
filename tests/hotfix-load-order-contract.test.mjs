import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const coreScriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../core.js');
const coreSource = fs.readFileSync(coreScriptPath, 'utf8');

const observed = [...coreSource.matchAll(/load\(\s*['\"]([^'\"]+)['\"][^)]*\)/g)]
  .map(([ _match, script ]) => String(script));

const expected = [
  'core-runtime.js?v=20260712-full-restore',
  'offline-sync-queue.js?v=20260716-offline-sync-v2',
  'restore-hotfix.js?v=20260715-disputes-sync-v1',
  'settings-hotfix.js?v=20260712-settings-reconcile-v2',
  'owner-snapshot-hotfix.js?v=20260713-owner-snapshot-v2',
  'load-order-hotfix.js?v=20260717-load-order-v1',
  'deduction-policy-hotfix.js?v=20260713-deduction-policy-v1',
  'deduction-period-hotfix.js?v=20260717-deduction-period-v1',
  'settlement-week-hotfix.js?v=20260717-settlement-week-v1',
  'deduction-trip-resolution.js?v=20260717-deduction-trip-v2',
  'accounting-action-guard.js?v=20260717-accounting-guard-v1',
  'deduction-policy-ui-fix.js?v=20260713-deduction-policy-ui-v1',
  'ocr-hotfix.js?v=20260712-ocr-auth-v1',
  'ocr-invoice-review.js?v=20260712-ocr-invoice-v2',
  'ocr-item-alias-hotfix.js?v=20260712-defd-alias-v1',
  'ocr-service-invoice-review.js?v=20260713-service-invoice-v1',
  'service-invoice-legacy-upgrade.js?v=20260713-service-legacy-v1',
  'dispute-tombstone-hotfix.js?v=20260716-dispute-delete-v1',
];

assert.equal(
  observed.length,
  expected.length,
  `Expected ${expected.length} core.js load() calls; found ${observed.length}`,
);

observed.forEach((script, index) => {
  assert.equal(
    script,
    expected[index],
    `Load chain mismatch at position ${index + 1}: expected ${expected[index]}, got ${script}`,
  );
});

const unique = new Set();
for (const script of observed) {
  const normalized = script.split('?')[0];
  assert.ok(normalized, `Invalid script entry: ${script}`);
  assert.ok(!unique.has(script), `Duplicate loader entry found: ${script}`);
  unique.add(script);

  const filename = path.resolve(path.dirname(coreScriptPath), normalized);
  assert.ok(
    fs.existsSync(filename),
    `Loader entry does not resolve on disk: ${normalized}`,
  );
}

const expectedByName = new Set(expected);
for (const script of expectedByName) {
  assert.ok(
    observed.includes(script),
    `Expected loader entry missing: ${script}`,
  );
}

console.log('Core.js hotfix load-order contract verified:', {
  scripts: observed.length,
  duplicates: observed.length - unique.size,
});
