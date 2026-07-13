import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(
  new URL('../../.github/workflows/e2e-pr-smoke.yml', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const config = fs.readFileSync(new URL('./playwright.ux.config.mjs', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('./support/local-static-server.mjs', import.meta.url), 'utf8');

test('UX PR job is credential-free, localhost-only, and uses safe evidence', () => {
  const uxJob = workflow.slice(workflow.indexOf('  ux-smoke:'));
  assert.match(uxJob, /npm run test:e2e:ux/);
  assert.match(uxJob, /E2E_EVIDENCE_MODE: safe/);
  assert.match(uxJob, /E2E_ALLOW_BINARY_EVIDENCE: '0'/);
  assert.doesNotMatch(uxJob, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(uxJob, /\benvironment\s*:/);
  assert.doesNotMatch(uxJob, /crewbiq-orchestrator-production|script\.google\.com|\/v1\//i);
  assert.match(config, /127\.0\.0\.1/);
  assert.match(config, /screenshot: 'off'/);
  assert.match(config, /trace: 'off'/);
  assert.match(config, /reuseExistingServer: false/);
  assert.match(server, /const HOST = '127\.0\.0\.1'/);
});

test('UX artifact upload is independently allowlisted and retained for seven days', () => {
  const uxJob = workflow.slice(workflow.indexOf('  ux-smoke:'));
  assert.match(uxJob, /path: artifacts\/e2e-ux\/upload\//);
  assert.match(uxJob, /retention-days: 7/);
  assert.match(uxJob, /if-no-files-found: error/);
  assert.doesNotMatch(uxJob, /artifacts\/e2e-ux\/(test-results|raw)/);
  assert.match(packageJson.scripts['test:e2e:ux'], /validate-ux-artifact\.mjs/);
  assert.match(packageJson.scripts['test:e2e:ux'], /E2E_LOCAL_UX_RUN=1/);
});
