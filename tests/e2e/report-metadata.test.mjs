import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveApplicationCommits } from './reporters/crewbiq-reporter.mjs';

test('report metadata keeps explicit app deployment commit separate from workflow commit', () => {
  assert.deepEqual(resolveApplicationCommits({
    GITHUB_SHA: 'workflow-sha',
    E2E_APP_DEPLOYMENT_COMMIT: 'deployment-sha',
  }), {
    workflow_commit: 'workflow-sha',
    deployment_commit: 'deployment-sha',
  });
});

test('report metadata never infers app deployment commit from workflow commit', () => {
  assert.deepEqual(resolveApplicationCommits({
    GITHUB_SHA: 'workflow-sha',
  }), {
    workflow_commit: 'workflow-sha',
    deployment_commit: 'not-supplied',
  });
});
