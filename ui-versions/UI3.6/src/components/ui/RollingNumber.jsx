import React, { useEffect, useState } from 'react';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ digit, order, started }) {
  return (
    <span className="roll-digit select-none" aria-hidden="true">
      <span
        className="roll-col"
        style={{ transform: `translateY(${started ? -digit * 10 : 0}%)`, transitionDelay: `${order * 45}ms` }}
      >
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
}

/** Text whose digits roll into place like a counter, and roll again when the value changes. */
export function RollingText({ text, className = '' }) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const chars = [...String(text)];
  return (
    <span className={`roll num ${className}`}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) => {
        // Keyed from the right so units stay in the same column when the number grows
        const key = chars.length - i;
        return /\d/.test(ch) ? (
          <Digit key={key} digit={Number(ch)} order={i} started={started} />
        ) : (
          <span key={key} aria-hidden="true" className="whitespace-pre">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

const format = (value, decimals) =>
  Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Ringgit amount with rolling digits. Negative values show a leading minus. */
export function Money({ value, decimals = 2, className = '' }) {
  const n = Number(value || 0);
  return <RollingText text={`${n < 0 ? '-' : ''}RM ${format(Math.abs(n), decimals)}`} className={className} />;
}
