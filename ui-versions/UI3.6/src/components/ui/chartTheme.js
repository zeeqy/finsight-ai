/** Recharts styling from the same tokens as the rest of the app. Colours stay as CSS variables for theming. */
export const CHART = {
  accent: 'var(--accent)',
  gold: 'var(--gold-chart)',
  ok: 'var(--ok)',
  blue: 'var(--blue)',
  ink: 'var(--ink)',
  danger: 'var(--danger)',
  muted: 'var(--line-strong)',
  grid: 'var(--line)',
  tick: { fill: 'var(--ink-3)', fontSize: 12 },
  axisLine: { stroke: 'var(--line-strong)' },
  cursor: { fill: 'var(--paper-2)', fillOpacity: 0.6 },
  tooltip: {
    contentStyle: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      boxShadow: 'var(--lift)',
      fontSize: 13,
      padding: '8px 12px',
    },
    labelStyle: { color: 'var(--ink)', fontWeight: 700 },
    itemStyle: { color: 'var(--ink-2)', padding: 0 },
  },
  legend: { fontSize: 13, color: 'var(--ink-2)' },
  // Long enough to notice, short enough not to delay reading
  animation: { isAnimationActive: true, animationDuration: 700, animationEasing: 'ease-out' },
};

export const kFormat = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : v);
