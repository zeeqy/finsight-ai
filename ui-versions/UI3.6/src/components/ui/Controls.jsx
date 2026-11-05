import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { EASE, SPRING } from '../../lib/motion';

/** Label + control. Render a single input/select as the child; `prefix` shows inside it (e.g. RM). */
export function Field({ label, hint, prefix, className = '', children }) {
  const id = useId();
  const control = React.cloneElement(children, {
    id,
    className: `field ${prefix ? 'pl-11' : ''} ${children.props.className || ''}`,
  });
  return (
    <div className={className}>
      <label htmlFor={id} className="t-label block mb-1.5">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-sm font-semibold pointer-events-none">{prefix}</span>
        )}
        {control}
      </div>
      {hint && <p className="t-note mt-1">{hint}</p>}
    </div>
  );
}

const MONEY_TYPING = /^\d*(\.\d{0,2})?$/;
const fmtMoney = (n) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ringgit amount. Takes digits and one dot with up to 2 decimals (sen), opens the decimal keypad on
 * phones, and shows 1,234.50 when not being edited. onChange gets { target: { name, value } } with
 * the plain number text ("1234.5"), so it drops in where a number input was.
 */
export function MoneyInput({ value, onChange, name, className = '', onFocus, onBlur, min: _min, max: _max, step: _step, ...rest }) {
  const [editing, setEditing] = useState(false);
  let raw = value === null || value === undefined ? '' : String(value);
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n) && !MONEY_TYPING.test(raw)) raw = String(Math.round(n * 100) / 100);
  const shown = editing || raw === '' || !Number.isFinite(n) ? raw : fmtMoney(n);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      name={name}
      className={`num ${className}`}
      value={shown}
      onFocus={(e) => {
        setEditing(true);
        // The text changes from 1,234.50 to 1234.5 on focus, so select the new text: typing replaces the amount
        const el = e.target;
        requestAnimationFrame(() => el.select());
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setEditing(false);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value.replace(/[,\sRM]/g, '');
        if (!MONEY_TYPING.test(next)) return;
        onChange?.({ target: { name, value: next } });
      }}
    />
  );
}

/** One choice out of a few, with a pill in the module's colour that slides between options. */
export function Segmented({ options, value, onChange, label, name, className = '' }) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex flex-wrap gap-1 p-1 rounded-xl bg-paper-2 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            name={name}
            onClick={() => onChange(o.value)}
            className={`relative min-h-10 px-3.5 rounded-control text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${
              active ? 'text-on-accent' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {active && <m.span layoutId={`segment-${group}`} className="absolute inset-0 rounded-control bg-accent" transition={SPRING} />}
            {Icon && <Icon className="relative w-4 h-4" aria-hidden="true" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const METER_TONES = { ok: 'bg-ok', warn: 'bg-gold-chart', danger: 'bg-danger', ink: 'bg-ink' };

/** Horizontal bar that fills when it appears. `value` and `marker` are percentages of the track. */
export function Meter({ value, marker, tone = 'ok', colour, height = 'h-2', track = 'bg-paper-2', label }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative ${height} rounded-full ${track}`}
    >
      <m.div
        className={`absolute inset-y-0 left-0 rounded-full origin-left ${colour ? '' : METER_TONES[tone]}`}
        style={{ width: `${width}%`, background: colour }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
      />
      {marker !== undefined && (
        <span className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `${marker}%` }} aria-hidden="true" />
      )}
    </div>
  );
}

const NOTICE = {
  info: { cls: 'bg-paper-2 text-ink-2', icon: Info },
  ok: { cls: 'bg-ok-wash text-ok-deep', icon: CheckCircle2 },
  warn: { cls: 'bg-warn-wash text-warn', icon: AlertTriangle },
  danger: { cls: 'bg-danger-wash text-danger', icon: AlertTriangle },
  working: { cls: 'bg-paper-2 text-ink-2', icon: Loader2 },
};

/** A status message that slides open. Pass `show={false}` (or no children) to slide it closed. */
export function Notice({ tone = 'info', show = true, children, className = '' }) {
  const { cls, icon: Icon } = NOTICE[tone];
  return (
    <AnimatePresence initial={false}>
      {show && children ? (
        <m.div
          role={tone === 'danger' ? 'alert' : 'status'}
          className={`overflow-hidden ${className}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <div className={`flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${cls}`}>
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone === 'working' ? 'animate-spin' : ''}`} aria-hidden="true" />
            <div className="min-w-0">{children}</div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * A small "i" button that explains a figure or feature. Opens on tap, click, Enter or hover
 * (never hover only), closes on Escape, blur or a second tap. `label` names what it explains.
 */
export function InfoTip({ label, children, className = '' }) {
  const id = useId();
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState(null);
  const show = open || pinned;
  const close = () => {
    setOpen(false);
    setPinned(false);
  };
  // The box is drawn on top of the whole page (a portal with fixed position), so no card, glass layer or
  // clipped panel can cover it. It stays 16px inside the screen and opens above the icon when there is no room below.
  const place = () => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(256, window.innerWidth - 32);
    const left = Math.min(Math.max(box.left, 16), window.innerWidth - 16 - width);
    const below = window.innerHeight - box.bottom > 220 || box.top < 220;
    setPos({ left, width, top: below ? box.bottom + 6 : undefined, bottom: below ? undefined : window.innerHeight - box.top + 6, below });
  };
  // Follow the icon while the page scrolls or resizes
  useEffect(() => {
    if (!show) return undefined;
    const update = () => place();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show]);
  return (
    <span
      ref={anchor}
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={() => {
        place();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex items-center justify-center w-7 h-7 -my-1.5 rounded-full text-ink-3 hover:text-ink hover:bg-paper-2 focus-visible:text-ink"
        aria-label={`About ${label}`}
        aria-expanded={show}
        aria-describedby={show ? id : undefined}
        onClick={() => {
          if (pinned) return close();
          place();
          return setPinned(true);
        }}
        onBlur={close}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {createPortal(
        <AnimatePresence>
          {show && pos && (
            <m.span
              id={id}
              role="tooltip"
              className="fixed z-[70] pointer-events-none rounded-xl border border-line bg-surface p-3 text-sm font-normal text-ink-2 shadow-lg text-left whitespace-normal tracking-normal normal-case"
              style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
              initial={{ opacity: 0, y: pos.below ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: pos.below ? -4 : 4 }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {children}
            </m.span>
          )}
        </AnimatePresence>,
        document.body
      )}
    </span>
  );
}

/** Says what is loading. */
export function Loading({ children = 'Loading...' }) {
  return (
    <div className="page py-16 flex items-center justify-center gap-2 text-ink-2 text-sm" role="status">
      <Loader2 className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Says why a view is empty and gives the one action that fills it. */
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="py-10 px-4 flex flex-col items-center text-center">
      {Icon && <Icon className="w-8 h-8 text-accent mb-3" aria-hidden="true" />}
      <p className="font-display font-semibold text-lg">{title}</p>
      {children && <p className="t-note mt-1 max-w-[44ch]">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
