// Phase 0 probe (Node, no browser): ephemeral token -> Live session -> text prompt
// -> tool call -> stub result -> spoken answer. Prints timings, never the key.
//   node spikes/live-voice/probe.mjs [model]
import { writeFileSync } from 'node:fs';
import { loadApiKey, mintToken, WS_URL, setupMessage, stubUpcoming, DEFAULT_MODEL } from './lib.mjs';

const model = process.argv[2] || DEFAULT_MODEL;
const PROMPT = process.env.PROMPT || "What's due this week?";
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
const log = (...a) => console.log(String(ms()).padStart(6), 'ms ', ...a);

const { token } = await mintToken(loadApiKey(), model);
log(`token minted for ${model}`);

const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
ws.binaryType = 'arraybuffer';
const audio = [];
let sentAt = 0;
let firstAudioAt = 0;
let transcript = '';

const timeout = setTimeout(() => {
  log('TIMEOUT after 45s');
  ws.close();
}, 45_000);

ws.addEventListener('open', () => {
  log('socket open');
  ws.send(JSON.stringify(setupMessage(model)));
});

ws.addEventListener('message', (ev) => {
  const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
  const msg = JSON.parse(raw);

  if (msg.setupComplete) {
    log('setupComplete');
    sentAt = performance.now();
    ws.send(JSON.stringify({ realtimeInput: { text: PROMPT } }));
    log(`sent text: "${PROMPT}"`);
  }

  if (msg.toolCall) {
    for (const call of msg.toolCall.functionCalls || []) {
      log(`toolCall ${call.name}(${JSON.stringify(call.args || {})})`);
      ws.send(
        JSON.stringify({
          toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result: stubUpcoming() } }] }
        })
      );
    }
  }

  const sc = msg.serverContent;
  if (sc) {
    for (const part of sc.modelTurn?.parts || []) {
      if (part.inlineData?.data) {
        if (!firstAudioAt) {
          firstAudioAt = performance.now();
          log(`first audio chunk (${part.inlineData.mimeType}) — ${Math.round(firstAudioAt - sentAt)} ms after prompt`);
        }
        audio.push(Buffer.from(part.inlineData.data, 'base64'));
      }
    }
    if (sc.outputTranscription?.text) transcript += sc.outputTranscription.text;
    if (sc.interrupted) log('interrupted');
    // A tool call ends its own (silent) turn; the spoken answer comes in the next one.
    if (sc.turnComplete && !audio.length) log('turnComplete (tool turn, waiting for answer)');
    else if (sc.turnComplete) {
      const bytes = audio.reduce((n, b) => n + b.length, 0);
      log(`turnComplete — ${(bytes / 2 / 24000).toFixed(1)} s of audio`);
      log(`spoken: "${transcript.trim()}"`);
      writeWav(Buffer.concat(audio));
      clearTimeout(timeout);
      ws.close();
    }
  }

  if (msg.goAway) log(`goAway, timeLeft ${msg.goAway.timeLeft}`);
  if (msg.error) log('error', JSON.stringify(msg.error));
});

ws.addEventListener('close', (ev) => {
  log(`closed code=${ev.code} reason="${ev.reason}"`);
  clearTimeout(timeout);
});
ws.addEventListener('error', () => log('socket error'));

/** Save the reply so a human can listen to it (24 kHz mono 16-bit PCM). */
function writeWav(pcm, rate = 24000) {
  if (!pcm.length) return;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  const out = new URL('./last-reply.wav', import.meta.url);
  writeFileSync(out, Buffer.concat([h, pcm]));
  log(`saved ${out.pathname.replace(/^\//, '')}`);
}
