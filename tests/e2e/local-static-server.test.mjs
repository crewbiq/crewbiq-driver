import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { startStaticServer } from './support/local-static-server.mjs';

test('local UX server binds to loopback and serves only allowlisted application files', async () => {
  const instance = await startStaticServer({ root: path.resolve('.') });
  try {
    assert.equal(instance.server.address().address, '127.0.0.1');
    const index = await fetch(`${instance.url}/index.html`);
    const script = await fetch(`${instance.url}/core.js?v=test`);
    const packageFile = await fetch(`${instance.url}/package.json`);
    const traversal = await fetch(`${instance.url}/%2e%2e%2fpackage.json`);

    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /^text\/html/);
    assert.match(await index.text(), /<title>CrewBIQ Driver<\/title>/);
    assert.equal(script.status, 200);
    assert.equal(packageFile.status, 404);
    assert.equal(traversal.status, 404);
  } finally {
    await instance.close();
  }
});

test('local UX server rejects writes and supports metadata-only HEAD requests', async () => {
  const instance = await startStaticServer({ root: path.resolve('.') });
  try {
    const write = await fetch(`${instance.url}/index.html`, { method: 'POST', body: 'synthetic' });
    const head = await fetch(`${instance.url}/index.html`, { method: 'HEAD' });

    assert.equal(write.status, 405);
    assert.equal(write.headers.get('allow'), 'GET, HEAD');
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await instance.close();
  }
});
