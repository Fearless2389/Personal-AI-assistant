// A tiny static web server for the browser agent's test website (PLAN.md T1.2). The pages in
// test/fixtures/agent-site are a fake shop, forms, a booking page, a login page and research pages:
// deterministic, offline, and safe to "buy" from. Used by tests, the eval runner and the CLI.
//   npm run fixtures            → serves on http://127.0.0.1:3999 (AGENT_FIXTURE_PORT overrides)
//   import { start } from ...   → start(port) resolves to { server, url, close() }
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'fixtures', 'agent-site');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

async function handle(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://fixture').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  const type = TYPES[path.extname(file)];
  // Never serve outside the fixture folder, and only known file types.
  if (!file.startsWith(ROOT + path.sep) || !type) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

export function start(port = Number(process.env.AGENT_FIXTURE_PORT) || 3999) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch(() => res.writeHead(500).end());
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, url, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// Run directly: `node test/fixtureServer.js`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { url } = await start();
  console.log(`fixtures on ${url}`);
}
