import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceInput } from '../../hooks/useVoiceInput.js';

export function VoiceButton({ onTranscript, lang = 'en-US' }) {
  const { supported, isRecording, transcript, start, stop } = useVoiceInput({ lang });

  useEffect(() => {
    if (!isRecording && transcript) onTranscript?.(transcript);
  }, [isRecording, transcript, onTranscript]);

  if (!supported) {
    return (
      <button
        type="button"
        className="w-10 h-10 rounded-full bg-surface-3 text-text-muted grid place-items-center cursor-not-allowed"
        title="Voice input not supported in this browser"
        disabled
      >
        <MicOff size={18} />
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={() => (isRecording ? stop() : start())}
      className={`w-10 h-10 rounded-full grid place-items-center transition-colors duration-150 ${
        isRecording
          ? 'bg-danger text-white'
          : 'bg-surface-3 text-text-secondary hover:bg-nexus-primary hover:text-on-accent'
      }`}
      animate={
        isRecording
          ? { boxShadow: ['0 0 0 0 rgba(239,68,68,0.7)', '0 0 0 8px rgba(239,68,68,0)'] }
          : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
      }
      transition={isRecording ? { duration: 1.2, repeat: Infinity } : { duration: 0.1 }}
      aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
      title={isRecording ? 'Stop recording' : 'Start voice input'}
    >
      <Mic size={18} />
    </motion.button>
  );
}

export default VoiceButton;
