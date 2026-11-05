import React from 'react';
import { Layers, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { Segmented } from './ui/Controls';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Device', icon: Monitor },
];

/** Light, dark or follow the device, with words so it is clear what each does, and the glass switch. */
export default function ThemeSwitch({ className = '' }) {
  const { pref, setPref, glass, setGlass } = useTheme();
  return (
    <div className={className}>
      <p className="t-label mb-1.5">Theme</p>
      <Segmented label="Theme" options={OPTIONS} value={pref} onChange={setPref} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
      <label className="flex items-center justify-between gap-3 mt-3 text-sm">
        <span>
          <span className="font-semibold">Glass effect</span>
          <span className="block t-note">Turn it off if the app feels slow</span>
        </span>
        <input type="checkbox" role="switch" checked={glass} onChange={(e) => setGlass(e.target.checked)} className="w-5 h-5 accent-[var(--accent)]" />
      </label>
    </div>
  );
}

/**
 * Three small theme buttons in one row for the sidebar card, where space is short, then the glass switch.
 * Each has a tooltip and a label.
 */
export function ThemeIcons({ className = '' }) {
  const { pref, setPref, glass, setGlass } = useTheme();
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div role="radiogroup" aria-label="Theme" className="flex-1 flex items-center gap-1 p-1 rounded-xl bg-paper-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = pref === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${o.label} theme`}
              title={`${o.label} theme`}
              onClick={() => setPref(o.value)}
              className={`flex-1 h-8 inline-flex items-center justify-center rounded-lg transition-colors ${active ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'}`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={glass}
        aria-label="Glass effect"
        title={glass ? 'Glass effect on. Turn it off if the app feels slow.' : 'Glass effect off'}
        onClick={() => setGlass(!glass)}
        className={`h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl transition-colors ${glass ? 'bg-accent text-on-accent' : 'bg-paper-2 text-ink-2 hover:text-ink'}`}
      >
        <Layers className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** One icon button that flips between light and dark, for screens without the account menu. */
export function ThemeToggle({ className = '' }) {
  const { resolved, setPref } = useTheme();
  const dark = resolved === 'dark';
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setPref(dark ? 'light' : 'dark')}
      className={`btn btn-icon ${className}`}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
