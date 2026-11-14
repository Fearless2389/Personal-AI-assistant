// Phase 0 spike server (node:http, no deps). Local only — binds 127.0.0.1.
//   node spikes/live-voice/server.mjs      -> http://127.0.0.1:5180
// Routes:
//   GET  /            test page
//   POST /token       { token, model } — single-use ephemeral token, setup locked
//   GET  /events      SSE stream the page listens on for hotkey presses
//   POST /hotkey/down /hotkey/up — called by the tray helper (tray.ps1)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { loadApiKey, mintToken, DEFAULT_MODEL } from './lib.mjs';

const PORT = Number(process.env.SPIKE_PORT || 5180);
const apiKey = loadApiKey();
const page = new URL('./index.html', import.meta.url);
const clients = new Set();

function broadcast(event) {
  for (const res of clients) res.write(`data: ${JSON.stringify({ event, at: Date.now() })}\n\n`);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(page));
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      const ptt = url.searchParams.get('ptt') !== '0';
      const out = await mintToken(apiKey, url.searchParams.get('model') || DEFAULT_MODEL, { pushToTalk: ptt });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      return req.on('close', () => clients.delete(res));
    }
    if (req.method === 'POST' && (url.pathname === '/hotkey/down' || url.pathname === '/hotkey/up')) {
      broadcast(url.pathname.endsWith('down') ? 'ptt_down' : 'ptt_up');
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`spike on http://127.0.0.1:${PORT} (model ${DEFAULT_MODEL})`));
