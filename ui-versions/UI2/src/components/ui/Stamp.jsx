import React from 'react';
import { m } from 'motion/react';

const TONES = {
  ok: 'var(--jade)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};

/**
 * A verdict that lands like a rubber stamp on a loan file. Reserved for the one result a
 * screen exists to give. Changing `label` stamps it again.
 */
export default function Stamp({ label, note, tone = 'ok', className = '' }) {
  const colour = TONES[tone];
  return (
    <span className={`inline-block ${className}`} role="status">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <filter id="stamp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
      </svg>
      <m.span
        key={label}
        className="relative inline-flex flex-col items-center rounded-lg px-5 py-2.5 text-center"
        style={{ color: colour, border: `3px solid ${colour}`, outline: `1px solid ${colour}`, outlineOffset: 3, filter: 'url(#stamp-ink)' }}
        initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -4 }}
        transition={{ type: 'spring', stiffness: 620, damping: 24, mass: 0.9 }}
      >
        <span className="font-display font-bold text-2xl tracking-tight leading-none">{label}</span>
        {note && <span className="text-xs font-semibold mt-1">{note}</span>}
      </m.span>
    </span>
  );
}
