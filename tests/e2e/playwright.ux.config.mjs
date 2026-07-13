import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactDir = process.env.E2E_ARTIFACT_DIR || 'artifacts/e2e-ux';
const port = Number(process.env.E2E_UX_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: path.join(repositoryRoot, 'tests/e2e'),
  testMatch: 'ux-local.spec.mjs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  outputDir: path.join(repositoryRoot, artifactDir, 'test-results'),
  reporter: [
    ['line'],
    [path.join(repositoryRoot, 'tests/e2e/reporters/crewbiq-reporter.mjs'), {
      outputDir: path.join(repositoryRoot, artifactDir),
    }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: `node tests/e2e/support/local-static-server.mjs ${port}`,
    cwd: repositoryRoot,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 10_000,
  },
  projects: [{ name: 'chromium-local-ux' }],
});
