import React from 'react';

/** Rosette mark, the same engraved curves as the sign-in screen. */
export function Mark({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--mark-bg)" />
      <g stroke="var(--mark-line)" strokeWidth="1.2">
        <ellipse cx="16" cy="16" rx="11" ry="4.6" />
        <ellipse cx="16" cy="16" rx="11" ry="4.6" transform="rotate(60 16 16)" />
        <ellipse cx="16" cy="16" rx="11" ry="4.6" transform="rotate(120 16 16)" />
      </g>
    </svg>
  );
}

export default function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-ink ${className}`}>
      <Mark />
      <span className="font-display font-bold text-lg tracking-tight">FinSight AI</span>
    </span>
  );
}
