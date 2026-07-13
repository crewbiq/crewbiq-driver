import { defineConfig, devices } from '@playwright/test';

const artifactDir = process.env.E2E_ARTIFACT_DIR || 'artifacts/e2e';

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
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
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
