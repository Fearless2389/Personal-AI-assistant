// Raw audio plumbing for voice mode. The Live API wants 16 kHz 16-bit mono PCM in
// and sends 24 kHz 16-bit mono PCM out, both base64 in JSON messages.

const IN_RATE = 16000;
const OUT_RATE = 24000;
const CHUNK_SAMPLES = 1600; // ~100 ms per message: low latency without flooding the socket

// AudioWorklet that just forwards each 128-sample block to the main thread.
const TAP_WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
}
registerProcessor('nexus-tap', Tap);`;

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Microphone → base64 PCM chunks via onChunk(b64). Call start() inside a user gesture. */
export class MicCapture {
  constructor(onChunk) {
    this.onChunk = onChunk;
    this.pending = [];
    this.pendingLen = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.ctx = new AudioContext({ sampleRate: IN_RATE });
    const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(this.ctx, 'nexus-tap');
    this.ctx.createMediaStreamSource(this.stream).connect(node);
    node.port.onmessage = (e) => this.push(e.data);
  }

  push(block) {
    this.pending.push(block);
    this.pendingLen += block.length;
    if (this.pendingLen >= CHUNK_SAMPLES) this.flush();
  }

  /** Emit whatever is buffered (call on key release so the last words aren't lost). */
  flush() {
    if (!this.pendingLen) return;
    const pcm = new Int16Array(this.pendingLen);
    let o = 0;
    for (const block of this.pending) {
      for (let i = 0; i < block.length; i++) pcm[o++] = Math.max(-1, Math.min(1, block[i])) * 0x7fff;
    }
    this.pending = [];
    this.pendingLen = 0;
    this.onChunk(bytesToBase64(new Uint8Array(pcm.buffer)));
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = this.ctx = null;
    this.pending = [];
    this.pendingLen = 0;
  }
}

/** Plays base64 PCM chunks back to back; stop() silences instantly (barge-in). */
export class PcmPlayer {
  constructor({ onIdle } = {}) {
    this.ctx = new AudioContext({ sampleRate: OUT_RATE });
    this.nextAt = 0;
    this.sources = new Set();
    this.onIdle = onIdle;
  }

  resume() {
    return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  get playing() {
    return this.sources.size > 0;
  }

  play(b64) {
    const bin = atob(b64);
    const samples = bin.length >> 1;
    const buf = this.ctx.createBuffer(1, samples, OUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      const v = (bin.charCodeAt(2 * i + 1) << 8) | bin.charCodeAt(2 * i);
      ch[i] = (v > 0x7fff ? v - 0x10000 : v) / 0x8000;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    this.nextAt = Math.max(this.nextAt, this.ctx.currentTime + 0.03);
    src.start(this.nextAt);
    this.nextAt += buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.onIdle?.();
    };
  }

  stop() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextAt = 0;
  }

  close() {
    this.stop();
    this.ctx.close().catch(() => {});
  }
}
