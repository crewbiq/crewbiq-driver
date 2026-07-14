import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { REDACTED, redactString, redactValue } from './support/redact.mjs';
import { writeRunArtifacts } from './support/report.mjs';

const canaries = [
  'bearer-token-canary',
  'password-canary',
  'cookie-canary',
  'session-canary',
  'query-token-canary',
  'gho_1234567890SECRET',
];

test('redacts tokens, passwords, cookies and sessions recursively', () => {
  const source = {
    headers: {
      Authorization: 'Bearer bearer-token-canary',
      Cookie: 'session=cookie-canary; theme=dark',
      'Set-Cookie': 'session=cookie-canary; HttpOnly',
    },
    password: 'password-canary',
    nested: {
      sessionToken: 'session-canary',
      url: 'https://example.test/path?access_token=query-token-canary&safe=ok',
    },
    message: 'Authorization: Bearer bearer-token-canary password=password-canary',
    github: 'gho_1234567890SECRET',
  };

  const output = JSON.stringify(redactValue(source));
  for (const canary of canaries) assert.equal(output.includes(canary), false);
  assert.match(output, /\[REDACTED\]/);
  assert.equal(source.password, 'password-canary');
});

test('redacts sensitive evidence strings without removing safe context', () => {
  const output = redactString(
    '\u001b[31mPOST\u001b[0m https://example.test/sync?token=query-token-canary status=401 Cookie: session=cookie-canary',
  );
  assert.equal(output.includes('query-token-canary'), false);
  assert.equal(output.includes('cookie-canary'), false);
  assert.equal(output.includes('status=401'), true);
  assert.equal(output.includes(REDACTED), true);
  assert.equal(output.includes('\u001b['), false);
});

test('writes redacted JSON and Markdown reports', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewbiq-e2e-redaction-'));
  const artifact = {
    run_id: 'redaction-self-test',
    overall_status: 'failed',
    environment: 'local',
    application: {
      workflow_commit: 'unverified-local',
      deployment_commit: 'not-supplied',
    },
    tester: {
      tester_role: 'harness-self-test',
      application_role: 'none',
      tenant_aliases: [],
    },
    browser: { engine: 'chromium', viewport: { width: 1280, height: 720 } },
    preconditions: ['password=password-canary'],
    scenarios: [{
      id: 'REDACTION-01',
      title: 'Bearer bearer-token-canary',
      status: 'failed',
      result_class: 'pass',
      expected_result: 'Cookie: session=cookie-canary',
      actual_result: 'token=query-token-canary',
      evidence: {
        screenshots: [],
        traces: [],
        console: [],
        network: [],
        other: [],
        omitted: [],
      },
    }],
    cleanup_status: 'not_required',
    limitations: ['sessionToken=session-canary'],
    evidence_policy: {
      mode: 'safe',
      sensitive_run: true,
      text_evidence_redacted: true,
      binary_evidence_safe: false,
      binary_evidence_omitted: true,
    },
  };

  try {
    const { jsonPath, markdownPath } = writeRunArtifacts(artifact, outputDir);
    const output = `${fs.readFileSync(jsonPath, 'utf8')}\n${fs.readFileSync(markdownPath, 'utf8')}`;
    for (const canary of canaries) assert.equal(output.includes(canary), false);
    assert.equal(output.includes(REDACTED), true);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
