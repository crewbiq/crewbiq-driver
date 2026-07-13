import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/core.js', 'core.js'],
  ['/sync.js', 'sync.js'],
  ['/pti.js', 'pti.js'],
  ['/loads.js', 'loads.js'],
  ['/offline-queue.js', 'offline-queue.js'],
  ['/manifest.json', 'manifest.json'],
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

export function createStaticServer({ root = process.cwd() } = {}) {
  const repositoryRoot = path.resolve(root);
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.setHeader('allow', 'GET, HEAD');
      send(response, 405, 'method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', `http://${HOST}`).pathname);
    } catch {
      send(response, 400, 'invalid path');
      return;
    }

    const relativeFile = FILES.get(pathname);
    if (!relativeFile) {
      send(response, 404, 'not found');
      return;
    }
    const filePath = path.resolve(repositoryRoot, relativeFile);
    if (!filePath.startsWith(`${repositoryRoot}${path.sep}`)) {
      send(response, 403, 'forbidden');
      return;
    }

    let body;
    try {
      body = fs.readFileSync(filePath);
    } catch {
      send(response, 404, 'not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}

export async function startStaticServer({ root = process.cwd(), port = 0 } = {}) {
  const server = createStaticServer({ root });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://${HOST}:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.E2E_UX_PORT || process.argv[2] || 4173);
  const instance = await startStaticServer({ port });
  console.log(`CrewBIQ local UX server listening at ${instance.url}`);
  const stop = async () => {
    await instance.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
