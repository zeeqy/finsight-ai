import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Light, dark or follow the device. The choice is remembered on this device only (localStorage,
 * wrapped in try/catch because it can be blocked). index.html applies it before first paint so
 * the page never flashes the wrong theme.
 */
const KEY = 'finsight-theme';
const ThemeContext = createContext({ pref: 'system', resolved: 'light', setPref: () => {} });

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function readPref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(resolved) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111A3A' : '#FFC80A');
}

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(readPref);
  const [resolved, setResolved] = useState(() => (pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref));

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setResolved(pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref);
    update();
    if (pref !== 'system' || !media) return undefined;
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [pref]);

  useEffect(() => apply(resolved), [resolved]);

  const setPref = useCallback((next) => {
    setPrefState(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Not remembered, but the theme still changes for this visit
    }
  }, []);

  return <ThemeContext.Provider value={{ pref, resolved, setPref }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
