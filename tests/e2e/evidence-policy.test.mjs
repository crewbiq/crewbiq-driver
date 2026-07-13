import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  publishScenarioAttachments,
  resolveEvidencePolicy,
  writeUploadManifest,
} from './support/evidence.mjs';
import { reportedOverallStatus } from './reporters/crewbiq-reporter.mjs';
import { writeRunArtifacts } from './support/report.mjs';

const tokenCanary = 'synthetic-token-canary';
const passwordCanary = 'synthetic-password-canary';

function createRawAttachments(root) {
  const consolePath = path.join(root, 'console.json');
  const networkPath = path.join(root, 'network.json');
  const screenshotPath = path.join(root, 'screenshot.png');
  const tracePath = path.join(root, 'trace.zip');
  fs.writeFileSync(consolePath, JSON.stringify({
    authorization: `Bearer ${tokenCanary}`,
    password: passwordCanary,
  }));
  fs.writeFileSync(networkPath, JSON.stringify({
    url: `https://example.test/?token=${tokenCanary}`,
  }));
  fs.writeFileSync(screenshotPath, `raw screenshot ${passwordCanary}`);
  fs.writeFileSync(tracePath, `raw trace ${tokenCanary}`);
  return [
    { name: 'console-log', contentType: 'application/json', path: consolePath },
    { name: 'network-log', contentType: 'application/json', path: networkPath },
    { name: 'screenshot', contentType: 'image/png', path: screenshotPath },
    { name: 'trace', contentType: 'application/zip', path: tracePath },
  ];
}

function allFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name));
}

function runArtifact(evidence, policy, uploadDir) {
  return {
    run_id: 'synthetic-sensitive-scenario',
    overall_status: 'failed',
    environment: 'local',
    application: { commit: 'unverified-local' },
    tester: {
      tester_role: 'harness-self-test',
      application_role: 'none',
      tenant_aliases: [],
    },
    browser: { engine: 'chromium', viewport: { width: 1280, height: 720 } },
    preconditions: [`password=${passwordCanary}`],
    scenarios: [{
      id: 'EVIDENCE-SAFE-01',
      title: `Bearer ${tokenCanary}`,
      status: 'failed',
      result_class: 'pass',
      expected_result: 'Sensitive synthetic evidence is not uploaded by default.',
      actual_result: `token=${tokenCanary}`,
      evidence,
    }],
    cleanup_status: 'not_required',
    limitations: [],
    evidence_policy: {
      ...policy,
      allowlist_manifest: path.join(uploadDir, 'upload-manifest.json'),
    },
  };
}

test('default upload allowlist redacts text and omits screenshot and trace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crewbiq-evidence-safe-'));
  const rawDir = path.join(root, 'raw');
  const uploadDir = path.join(root, 'upload');
  fs.mkdirSync(rawDir);
  fs.mkdirSync(uploadDir);
  const policy = resolveEvidencePolicy({});

  try {
    const published = publishScenarioAttachments({
      attachments: createRawAttachments(rawDir),
      uploadDir,
      scenarioId: 'EVIDENCE-SAFE-01',
      policy,
    });
    writeRunArtifacts(runArtifact(published.evidence, policy, uploadDir), uploadDir);
    writeUploadManifest(uploadDir, policy, published.artifacts);

    const files = allFiles(uploadDir);
    const uploadedText = files.map(file => fs.readFileSync(file).toString()).join('\n');
    assert.equal(uploadedText.includes(tokenCanary), false);
    assert.equal(uploadedText.includes(passwordCanary), false);
    assert.equal(files.some(file => /\.(png|zip)$/i.test(file)), false);
    assert.deepEqual(published.evidence.screenshots, []);
    assert.deepEqual(published.evidence.traces, []);
    assert.equal(published.evidence.omitted.length, 2);
    assert.equal(policy.text_evidence_redacted, true);
    assert.equal(policy.binary_evidence_safe, false);
    assert.equal(policy.binary_evidence_omitted, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('binary evidence requires explicit synthetic or disposable mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crewbiq-evidence-synthetic-'));
  const rawDir = path.join(root, 'raw');
  const uploadDir = path.join(root, 'upload');
  fs.mkdirSync(rawDir);
  fs.mkdirSync(uploadDir);
  const policy = resolveEvidencePolicy({
    E2E_EVIDENCE_MODE: 'synthetic',
    E2E_ALLOW_BINARY_EVIDENCE: '1',
  });

  try {
    const published = publishScenarioAttachments({
      attachments: createRawAttachments(rawDir),
      uploadDir,
      scenarioId: 'EVIDENCE-SYNTHETIC-01',
      policy,
    });
    assert.equal(policy.binary_evidence_safe, true);
    assert.equal(policy.binary_evidence_omitted, false);
    assert.equal(published.evidence.screenshots.length, 1);
    assert.equal(published.evidence.traces.length, 1);
    assert.equal(published.evidence.omitted.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('authenticated or sensitive marker overrides synthetic binary opt-in', () => {
  for (const marker of ['E2E_AUTHENTICATED_RUN', 'E2E_SENSITIVE_RUN']) {
    const policy = resolveEvidencePolicy({
      E2E_EVIDENCE_MODE: 'synthetic',
      E2E_ALLOW_BINARY_EVIDENCE: '1',
      [marker]: '1',
    });
    assert.equal(policy.sensitive_run, true);
    assert.equal(policy.binary_evidence_safe, false);
    assert.equal(policy.binary_evidence_omitted, true);
  }
});

test('all-skipped scenario set reports overall not_run instead of pass', () => {
  assert.equal(reportedOverallStatus('passed', [
    { result_class: 'not_run' },
    { result_class: 'not_run' },
  ]), 'not_run');
  assert.equal(reportedOverallStatus('failed', [
    { result_class: 'not_run' },
    { result_class: 'reproducible_defect' },
  ]), 'failed');
});
