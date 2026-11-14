// One Gemini Live API WebSocket. The token from /api/voice/session already locks
// the model, prompt, tools and push-to-talk mode, so setup sends nothing else.
// Protocol notes from the Phase 0 spike: spikes/live-voice/FINDINGS.md.

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const SETUP_TIMEOUT_MS = 15_000;

/**
 * handlers: onAudio(b64), onHeard(text), onSaid(text), onToolCall(calls),
 * onInterrupted(), onTurnComplete(), onGoAway(), onClose({ code, reason })
 */
export class LiveSession {
  constructor(token, handlers) {
    this.token = token;
    this.h = handlers;
    this.ready = false;
  }

  /** Resolves once the server has accepted the setup (≈2–3 s). */
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(this.token)}`);
      this.ws = ws;
      const timer = setTimeout(() => {
        reject(new Error('Voice setup timed out'));
        ws.close();
      }, SETUP_TIMEOUT_MS);

      ws.onopen = () => ws.send(JSON.stringify({ setup: {} }));
      ws.onmessage = async (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text());
        } catch {
          return;
        }
        if (msg.setupComplete) {
          clearTimeout(timer);
          this.ready = true;
          resolve();
        }
        this.dispatch(msg);
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        const wasReady = this.ready;
        this.ready = false;
        if (!wasReady) reject(new Error(ev.reason || `Voice connection closed (${ev.code})`));
        this.h.onClose?.({ code: ev.code, reason: ev.reason });
      };
    });
  }

  dispatch(msg) {
    if (msg.toolCall?.functionCalls?.length) this.h.onToolCall?.(msg.toolCall.functionCalls);
    if (msg.goAway) this.h.onGoAway?.();
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) this.h.onInterrupted?.();
    if (sc.inputTranscription?.text) this.h.onHeard?.(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.h.onSaid?.(sc.outputTranscription.text);
    for (const part of sc.modelTurn?.parts ?? []) if (part.inlineData?.data) this.h.onAudio?.(part.inlineData.data);
    if (sc.turnComplete) this.h.onTurnComplete?.();
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendAudio(b64) {
    this.send({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } });
  }

  activityStart() {
    this.send({ realtimeInput: { activityStart: {} } });
  }

  activityEnd() {
    this.send({ realtimeInput: { activityEnd: {} } });
  }

  toolResponse(functionResponses) {
    this.send({ toolResponse: { functionResponses } });
  }

  close() {
    this.ready = false;
    this.ws?.close(1000, 'client closed');
  }
}
