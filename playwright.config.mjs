import { defineConfig, devices } from '@playwright/test';

import { resolveEvidencePolicy } from './tests/e2e/support/evidence.mjs';

const artifactDir = process.env.E2E_ARTIFACT_DIR || 'artifacts/e2e';
const evidencePolicy = resolveEvidencePolicy();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 15_000,
  outputDir: `${artifactDir}/test-results`,
  reporter: [
    ['line'],
    ['./tests/e2e/reporters/crewbiq-reporter.mjs', { outputDir: artifactDir }],
  ],
  use: {
    screenshot: evidencePolicy.binary_evidence_safe ? 'only-on-failure' : 'off',
    trace: evidencePolicy.binary_evidence_safe ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
