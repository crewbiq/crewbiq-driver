import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(
  new URL('../../.github/workflows/deploy-accepted-pages-v95.yml', import.meta.url),
  'utf8',
);

const acceptedSha = '66a7985765b76e0702d015ca1e300390156f8ad6';
const priorMainSha = '86b8b4dd7e9496833a021319167589b49f0ac418';

test('Pages workflow can only trigger from the future exact control branch', () => {
  assert.match(
    workflow,
    /on:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- pages-actions-v95-66a7985/,
  );
  assert.doesNotMatch(workflow, /workflow_dispatch:|pull_request:|schedule:/);
  assert.doesNotMatch(workflow, /branches:\s*\n(?:\s+- .*\n)*\s+- (?:main|agent\/pre-base44-audit)/);
  assert.equal((workflow.match(/- pages-actions-v95-66a7985/g) || []).length, 1);
});

test('Pages workflow has exactly the minimal deployment permissions', () => {
  const block = workflow.slice(workflow.indexOf('permissions:'), workflow.indexOf('concurrency:'));
  assert.match(block, /^permissions:\s*\n  contents: read\s*\n  pages: write\s*\n  id-token: write\s*$/m);
  assert.equal((block.match(/^  [\w-]+:/gm) || []).length, 3);
  assert.doesNotMatch(block, /write-all|actions:|deployments:|packages:|secrets:/);
});

test('Pages workflow checks out only the full accepted artifact SHA', () => {
  assert.match(workflow, new RegExp(`ref: ${acceptedSha}`));
  assert.match(workflow, new RegExp(`git rev-parse HEAD\\)" = "${acceptedSha}`));
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /ref:\s*(?:HEAD|main|production-v95|\$\{\{)/);
  assert.doesNotMatch(workflow, /github\.sha|github\.ref/);
  assert.equal((workflow.match(new RegExp(acceptedSha, 'g')) || []).length, 2);
});

test('Pages deployment actions are immutable and exact', () => {
  const expected = [
    'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b',
    'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
    'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e',
  ];
  const uses = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  assert.deepEqual(uses, expected);
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/);
});

test('Pages job is serialized, non-cancelling, and bound to github-pages', () => {
  assert.match(workflow, /concurrency:\s*\n  group: pages\s*\n  cancel-in-progress: false/);
  assert.match(workflow, /environment:\s*\n      name: github-pages/);
  assert.match(workflow, /url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(workflow, /timeout-minutes: 15/);
});

test('Pages artifact guard covers the complete accepted shell without a build', () => {
  for (const file of [
    'index.html',
    'sw.js',
    'core.js',
    'core-runtime.js',
    'startup-session.js',
    'workspace-attribution.js',
    'workspace-driver-roster.js',
    'driver-truck-assignment.js',
    'account-driver-link.js',
    'driver-self.js',
    'loads.js',
    'pti.js',
    'manifest.json',
  ]) {
    assert.match(workflow, new RegExp(`test -f ${file.replace('.', '\\.')}\\b`));
  }
  assert.match(workflow, /crewbiq-driver-v95/);
  assert.doesNotMatch(workflow, /npm (?:ci|install|run)|npx |yarn |pnpm |python |migration|curl |wget /i);
});

test('Pages workflow documents exact immediate legacy rollback', () => {
  assert.match(workflow, /build_type=legacy/);
  assert.match(workflow, /source main at \//);
  assert.match(workflow, new RegExp(priorMainSha));
  assert.match(workflow, /live cache v79/);
});

