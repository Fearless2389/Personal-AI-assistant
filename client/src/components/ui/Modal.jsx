import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className={cn(
              'relative bg-surface-2 border border-surface-border rounded-2xl shadow-2xl w-full',
              size === 'sm' && 'max-w-sm',
              size === 'md' && 'max-w-md',
              size === 'lg' && 'max-w-2xl'
            )}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {title && (
              <div className="px-5 py-4 border-b border-surface-border">
                <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
              </div>
            )}
            <div className="px-5 py-4">{children}</div>
            {footer && (
              <div className="px-5 py-3 border-t border-surface-border flex justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
