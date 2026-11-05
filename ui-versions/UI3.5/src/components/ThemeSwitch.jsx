import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { Segmented } from './ui/Controls';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Device', icon: Monitor },
];

/** Light, dark or follow the device, with words so it is clear what each does. */
export default function ThemeSwitch({ className = '' }) {
  const { pref, setPref } = useTheme();
  return (
    <div className={className}>
      <p className="t-label mb-1.5">Theme</p>
      <Segmented label="Theme" options={OPTIONS} value={pref} onChange={setPref} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
    </div>
  );
}

/** Three small icon buttons in one row, for the sidebar card where space is short. Each has a tooltip and label. */
export function ThemeIcons({ className = '' }) {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={`flex items-center gap-1 p-1 rounded-xl bg-paper-2 ${className}`}>
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
