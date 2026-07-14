import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(
  new URL('../../.github/workflows/e2e-pr-smoke.yml', import.meta.url),
  'utf8',
);
const manual = fs.readFileSync(
  new URL('../../.github/workflows/e2e-harness-manual.yml', import.meta.url),
  'utf8',
);

test('PR smoke is read-only, non-secret, bounded, and cancellable', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /timeout-minutes: 20/);
  assert.doesNotMatch(workflow, /\benvironment\s*:/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /CREWBIQ_E2E_(FLEET|FIXTURE)/);
});

test('PR smoke runs all safe contracts and requires overall not_run', () => {
  assert.match(workflow, /npm run test:e2e:tooling/);
  assert.match(workflow, /npm run test:e2e:self/);
  assert.match(workflow, /npm run test:e2e:staging/);
  assert.match(workflow, /overall_status !== 'not_run'/);
  assert.match(workflow, /binary_evidence_omitted !== true/);
  assert.match(workflow, /git diff --check/);
});

test('PR evidence upload is allowlisted and retained for seven days', () => {
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /path: artifacts\/e2e\/upload\//);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /artifacts\/e2e\/(raw|test-results)/);
});

test('protected credentials remain confined to the manual staging job', () => {
  assert.match(manual, /workflow_dispatch:/);
  assert.match(manual, /environment: staging/);
  assert.match(manual, /secrets\.CREWBIQ_E2E_FLEET_A_EMAIL/);
  assert.match(manual, /secrets\.CREWBIQ_E2E_FLEET_B_EMAIL/);
  assert.match(manual, /secrets\.CREWBIQ_E2E_FIXTURE_MANIFEST_JSON/);
  assert.doesNotMatch(workflow, /secrets\.CREWBIQ_E2E_/);
});

test('manual staging manifest path uses runner context only at step scope', () => {
  const stagingJob = manual.slice(manual.indexOf('  staging-journeys:'));
  const jobEnv = stagingJob.slice(stagingJob.indexOf('    env:'), stagingJob.indexOf('    steps:'));
  const runnerManifestPath = /E2E_FIXTURE_MANIFEST_PATH: \$\{\{ runner\.temp \}\}\/crewbiq-e2e-manifest\.json/g;

  assert.doesNotMatch(jobEnv, /\$\{\{\s*runner\./);
  assert.equal(manual.match(runnerManifestPath)?.length, 2);
  assert.match(
    manual,
    /- name: Prepare exact fixture manifest\s+env:\s+E2E_FIXTURE_MANIFEST_PATH: \$\{\{ runner\.temp \}\}\/crewbiq-e2e-manifest\.json/,
  );
  assert.match(
    manual,
    /- name: Run authenticated staging journeys\s+env:\s+E2E_FIXTURE_MANIFEST_PATH: \$\{\{ runner\.temp \}\}\/crewbiq-e2e-manifest\.json/,
  );
});

test('CI source contains no production or legacy application endpoint', () => {
  const combined = `${workflow}\n${manual}`;
  assert.doesNotMatch(combined, /crewbiq-orchestrator-production/i);
  assert.doesNotMatch(combined, /script\.google\.com/i);
  assert.doesNotMatch(workflow, /curl\s|wget\s|\/v1\/sync\/pwa/);
});
