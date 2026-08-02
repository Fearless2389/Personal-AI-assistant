import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API wrapper. Returns { supported, isRecording, transcript, start, stop, reset }.
export function useVoiceInput({ lang = 'en-US' } = {}) {
  const [supported, setSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    if (!SR) return;

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
      }
      setTranscript(t);
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);

    recognitionRef.current = rec;
    return () => {
      try { rec.abort(); } catch { /* noop */ }
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setTranscript('');
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch { /* already started */ }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch { /* noop */ }
    setIsRecording(false);
  }, []);

  const reset = useCallback(() => setTranscript(''), []);

  return { supported, isRecording, transcript, start, stop, reset };
}
