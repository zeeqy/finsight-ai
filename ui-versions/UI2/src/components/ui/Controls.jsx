import React, { useId } from 'react';
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

/** One choice out of a few, with an ink pill that slides between options. */
export function Segmented({ options, value, onChange, label, name, className = '' }) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex flex-wrap gap-1 p-1 rounded-[0.625rem] bg-paper-2 ${className}`}>
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
              active ? 'text-on-jade' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {active && <m.span layoutId={`segment-${group}`} className="absolute inset-0 rounded-control bg-jade" transition={SPRING} />}
            {Icon && <Icon className="relative w-4 h-4" aria-hidden="true" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const METER_TONES = { ok: 'bg-jade', warn: 'bg-gold-chart', danger: 'bg-danger', ink: 'bg-ink' };

/** Horizontal bar that fills when it scrolls into view. `value` and `marker` are percentages of the track. */
export function Meter({ value, marker, tone = 'ok', colour, height = 'h-2', label }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative ${height} rounded-full bg-paper-2`}
    >
      <m.div
        className={`absolute inset-y-0 left-0 rounded-full origin-left ${colour ? '' : METER_TONES[tone]}`}
        style={{ width: `${width}%`, background: colour }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE }}
      />
      {marker !== undefined && (
        <span className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `${marker}%` }} aria-hidden="true" />
      )}
    </div>
  );
}

const NOTICE = {
  info: { cls: 'bg-paper-2 text-ink-2', icon: Info },
  ok: { cls: 'bg-jade-wash text-jade-deep', icon: CheckCircle2 },
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

/** Says what is loading. */
export function Loading({ children = 'Loading...' }) {
  return (
    <div className="page py-16 flex items-center justify-center gap-2 text-ink-2 text-sm" role="status">
      <Loader2 className="w-4 h-4 animate-spin text-jade" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Says why a view is empty and gives the one action that fills it. */
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="py-10 px-4 flex flex-col items-center text-center">
      {Icon && <Icon className="w-8 h-8 text-jade mb-3" aria-hidden="true" />}
      <p className="font-display font-semibold text-lg">{title}</p>
      {children && <p className="t-note mt-1 max-w-[44ch]">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
