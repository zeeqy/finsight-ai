import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { X } from 'lucide-react';
import { SPRING } from '../../lib/motion';

/** Dialog: mount it to open it. Escape and the backdrop close it, focus stays inside. */
export function Modal({ title, description, onClose, width = 'max-w-md', children }) {
  const panelRef = useRef(null);
  const opener = useRef(document.activeElement);
  // Held in a ref so a parent's inline onClose cannot re-run the effect and pull focus out of a field
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = opener.current;
    const focusable = () => panelRef.current?.querySelectorAll('button, input, select, textarea, a[href]') || [];
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const items = [...focusable()].filter((el) => !el.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <m.div
        className="absolute inset-0 bg-ink/45 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full ${width} max-h-[90dvh] overflow-y-auto bg-surface rounded-t-panel sm:rounded-panel shadow-lift p-5 sm:p-7 outline-none`}
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
      >
        <button type="button" onClick={onClose} className="btn btn-icon absolute top-2.5 right-2.5" aria-label="Close">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
        <h2 className="t-section pr-10">{title}</h2>
        {description && <p className="t-note mt-1">{description}</p>}
        <div className="mt-5">{children}</div>
      </m.div>
    </div>,
    document.body
  );
}

const ConfirmContext = createContext(null);

/** `const confirm = useConfirm(); if (await confirm({ title, body, action })) ...` replaces window.confirm. */
export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setAsk({ ...options, resolve });
      }),
    []
  );

  const close = useCallback((answer) => {
    setAsk((current) => {
      current?.resolve(answer);
      return null;
    });
  }, []);
  const cancel = useCallback(() => close(false), [close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {ask && (
          <Modal title={ask.title} description={ask.body} onClose={cancel}>
            <div className="flex justify-end gap-2.5">
              <button type="button" className="btn btn-quiet" onClick={cancel}>
                Keep it
              </button>
              <button type="button" className="btn btn-danger" onClick={() => close(true)}>
                {ask.action || 'Delete'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
