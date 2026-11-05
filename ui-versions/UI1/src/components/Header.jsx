import React, { useState, useEffect } from 'react';
import { Cpu, Database } from 'lucide-react';

const DOT = { ok: 'bg-[#10B981]', warn: 'bg-amber-400', down: 'bg-rose-500', checking: 'bg-[#64748B]' };

function StatusPill({ icon: Icon, label, state, title }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141824] border border-[#232A3B] text-xs text-[#CBD5E1]"
      title={title}
    >
      <Icon className="w-3.5 h-3.5 text-[#FFC80A]" />
      <span className="font-mono text-[11px]">{label}</span>
      <span className={`w-2 h-2 rounded-full ${DOT[state]}`} />
    </div>
  );
}

export default function Header({ title, subtitle }) {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const check = () =>
      fetch('/api/health')
        .then((res) => res.json())
        .then(setHealth)
        .catch(() => setHealth({ status: 'offline' }));
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, []);

  const apiDown = health?.status === 'offline';
  const db = !health
    ? { label: 'Checking...', state: 'checking' }
    : apiDown
      ? { label: 'Server offline', state: 'down' }
      : health.database === 'mysql'
        ? { label: 'MySQL', state: 'ok' }
        : { label: 'Local store', state: 'warn' };
  const ml = !health
    ? { label: 'Checking...', state: 'checking' }
    : health.ml_service === 'online'
      ? { label: 'ML models online', state: 'ok' }
      : { label: 'ML models offline', state: 'down' };

  return (
    <header className="h-20 border-b border-[#1F2533] px-8 flex items-center justify-between gap-4 bg-[#0E1118]/80 backdrop-blur-md sticky top-0 z-10 select-none">
      <div className="min-w-0">
        <h1 className="text-lg md:text-xl font-extrabold text-white tracking-tight truncate">{title}</h1>
        <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{subtitle}</p>
      </div>

      <div className="hidden md:flex items-center gap-2 shrink-0">
        <StatusPill
          icon={Database}
          label={db.label}
          state={db.state}
          title={db.state === 'warn' ? 'MySQL is not running: Modules 3-5 need it. Start MySQL in XAMPP.' : 'Database'}
        />
        <StatusPill
          icon={Cpu}
          label={ml.label}
          state={ml.state}
          title={
            ml.state === 'down'
              ? 'Python ML service is not running: loan risk uses the rule-based fallback, gold uses a placeholder rate, insurance is unavailable.'
              : 'Python ML service (XGBoost, ARIMA, Logistic Regression)'
          }
        />
      </div>
    </header>
  );
}
