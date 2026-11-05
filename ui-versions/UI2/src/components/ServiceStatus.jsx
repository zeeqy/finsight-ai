import React, { useEffect, useState } from 'react';
import { Notice } from './ui/Controls';

function useServiceHealth() {
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
  return health;
}

const describe = (health) => {
  if (!health) return { db: 'Checking the database', ml: 'Checking the ML models', problem: null };
  if (health.status === 'offline') {
    return { db: 'Server offline', ml: 'ML models unknown', problem: 'The server is not responding. Start the Express server, then reload this page.' };
  }
  const mysql = health.database === 'mysql';
  const ml = health.ml_service === 'online';
  const problems = [];
  if (!mysql) problems.push('MySQL is not running, so loans, goals and insurance are unavailable. Start MySQL in XAMPP.');
  if (!ml) problems.push('The ML service is not running: loan risk uses the rule-based fallback, gold uses a placeholder rate and insurance is unavailable.');
  return { db: mysql ? 'MySQL connected' : 'Local store', ml: ml ? 'ML models online' : 'ML models offline', problem: problems.join(' ') || null };
};

/** Quiet footer line while everything works, a banner above the page when something does not. */
export default function ServiceStatus({ children }) {
  const status = describe(useServiceHealth());
  return (
    <>
      <div className="page">
        <Notice tone="warn" show={Boolean(status.problem)} className="mt-3">
          {status.problem}
        </Notice>
      </div>
      {children}
      <footer className="page mt-12 mb-24 md:mb-8 pt-4 rule flex flex-col sm:flex-row sm:items-center justify-between gap-1 t-note">
        <span>
          {status.db}, {status.ml}
        </span>
        <span>Estimates only, not financial advice.</span>
      </footer>
    </>
  );
}
