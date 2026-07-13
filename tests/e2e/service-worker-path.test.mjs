import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const indexHtml = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const workerPathMatch = indexHtml.match(
  /const serviceWorkerUrl = new URL\('([^']+)', document\.baseURI\)\.href;/,
);

test('service worker registration derives its URL from the document base', () => {
  assert.ok(workerPathMatch, 'index.html must derive the Service Worker URL from document.baseURI');
  assert.doesNotMatch(indexHtml, /register\(['"]\/crewbiq-driver\/sw\.js/);
});

test('relative Service Worker path supports GitHub Pages and root staging', () => {
  const workerPath = workerPathMatch[1];

  assert.equal(
    new URL(workerPath, 'https://crewbiq.github.io/crewbiq-driver/').pathname,
    '/crewbiq-driver/sw.js',
  );
  assert.equal(
    new URL(workerPath, 'https://crewbiq-driver-staging.up.railway.app/').pathname,
    '/sw.js',
  );
});
