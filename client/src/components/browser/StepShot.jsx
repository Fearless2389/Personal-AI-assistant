// A screenshot from the agent window as a small thumbnail; tap for the full image. Fetched with
// Ruthvik's sign-in (an <img src> can't send it), so it's loaded as a Blob. No screenshot (404) or
// a failed load renders nothing: the card reads fine without it.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { browserApi } from '../../lib/api.js';
import { Modal } from '../ui/Modal.jsx';

export function StepShot({ taskId, name, label }) {
  const [url, setUrl] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!taskId || name == null) return undefined;
    let objectUrl = null;
    let alive = true;
    browserApi
      .shot(taskId, name)
      .then((blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => console.warn('[browser] screenshot not loaded:', err.message));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [taskId, name]);

  if (!url) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary"
        aria-label={`${label}: open the screenshot`}
      >
        <img
          src={url}
          alt=""
          width={120}
          height={75}
          className="w-[120px] h-[75px] object-cover object-top rounded border border-surface-border group-hover:border-nexus-primary/50"
        />
        <span>{label}</span>
      </button>
      {createPortal(
        <Modal open={open} onClose={() => setOpen(false)} title={label} size="lg">
          <img src={url} alt={label} className="w-full rounded border border-surface-border" />
        </Modal>,
        document.body
      )}
    </>
  );
}

export default StepShot;
