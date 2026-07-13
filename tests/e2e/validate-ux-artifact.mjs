import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Ajv2020 from 'ajv/dist/2020.js';

const uploadDir = path.resolve(process.argv[2] || 'artifacts/e2e-ux/upload');
const run = JSON.parse(fs.readFileSync(path.join(uploadDir, 'run.json'), 'utf8'));
const uploadManifest = JSON.parse(fs.readFileSync(path.join(uploadDir, 'upload-manifest.json'), 'utf8'));
const runSchema = JSON.parse(fs.readFileSync(new URL('./schema/run-artifact.schema.json', import.meta.url), 'utf8'));
const observationSchema = JSON.parse(fs.readFileSync(new URL('./schema/ux-observation.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
const validateRun = ajv.compile(runSchema);
const validateObservation = ajv.compile(observationSchema);

assert.equal(validateRun(run), true, JSON.stringify(validateRun.errors));
assert.equal(run.overall_status, 'passed');
assert.equal(run.environment, 'local');
assert.equal(run.evidence_policy.mode, 'safe');
assert.equal(run.evidence_policy.binary_evidence_safe, false);
assert.equal(run.evidence_policy.binary_evidence_omitted, true);
assert.deepEqual(
  run.scenarios.map(scenario => scenario.id).sort(),
  ['A11Y-01', 'RESPONSIVE-01', 'UX-01'],
);
assert.equal(run.scenarios.every(scenario => scenario.status === 'passed'), true);
assert.equal(run.scenarios.every(scenario => (
  scenario.evidence.screenshots.length === 0 && scenario.evidence.traces.length === 0
)), true);

const allowedKinds = new Set([
  'redacted_run_json',
  'redacted_markdown',
  'redacted_console',
  'redacted_network',
  'redacted_observations',
  'allowlist_manifest',
]);
assert.equal(uploadManifest.artifacts.every(artifact => allowedKinds.has(artifact.kind)), true);
assert.equal(uploadManifest.artifacts.some(artifact => artifact.kind === 'redacted_observations'), true);

for (const artifact of uploadManifest.artifacts) {
  const artifactPath = path.resolve(uploadDir, artifact.path);
  assert.equal(artifactPath.startsWith(`${uploadDir}${path.sep}`) || artifactPath === uploadDir, true);
  assert.equal(fs.existsSync(artifactPath), true, `missing allowlisted artifact: ${artifact.path}`);
  if (artifact.kind === 'redacted_observations') {
    const observation = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    assert.equal(validateObservation(observation), true, JSON.stringify(validateObservation.errors));
    assert.equal(Object.values(observation.hard_assertions).every(Boolean), true);
  }
  if (artifact.kind === 'redacted_network') {
    const entries = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    for (const entry of entries) {
      const url = new URL(entry.url);
      assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.pathname.startsWith('/v1/'), false);
    }
  }
}

const combinedEvidence = uploadManifest.artifacts
  .map(artifact => fs.readFileSync(path.resolve(uploadDir, artifact.path)))
  .join('\n');
for (const canary of ['E2E-UX-IDENTIFIER-CANARY', 'E2E-UX-PASSWORD-CANARY']) {
  assert.equal(combinedEvidence.includes(canary), false, `${canary} leaked into uploaded evidence`);
}

console.log(`validated CrewBIQ local UX artifact: ${uploadDir}`);
