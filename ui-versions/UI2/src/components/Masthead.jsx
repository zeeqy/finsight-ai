import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useMotionValueEvent, useScroll } from 'motion/react';
import { BadgeCheck, HeartPulse, Landmark, LogOut, MessagesSquare, ReceiptText, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './ui/Logo';
import { SPRING } from '../lib/motion';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Spend Analyser', short: 'Spending', icon: ReceiptText },
  { id: 'advisor', label: 'AI Advisor', short: 'Advisor', icon: MessagesSquare },
  { id: 'loan', label: 'Loan Predictor', short: 'Loans', icon: Landmark },
  { id: 'goals', label: 'Life Goals', short: 'Goals', icon: Target },
  { id: 'insurance', label: 'Insurance Risk', short: 'Insurance', icon: HeartPulse },
];

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onDown = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const initial = user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Account menu"
        className="w-10 h-10 rounded-full bg-jade text-on-jade font-display font-bold transition-transform hover:scale-105 active:scale-95"
      >
        {initial}
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            className="absolute right-0 top-12 w-72 sheet-lift p-4 z-40 origin-top-right"
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={SPRING}
          >
            <p className="font-semibold truncate">{user?.full_name || 'Signed in'}</p>
            <p className="t-note truncate">{user?.email}</p>
            {user?.monthly_income ? (
              <p className="t-note mt-2 flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-jade" aria-hidden="true" />
                Income on profile: RM {Number(user.monthly_income).toLocaleString('en-MY')} a month
              </p>
            ) : null}
            <button type="button" onClick={logout} className="btn btn-danger-quiet w-full mt-3">
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Top bar on wide screens: compacts on scroll, with a gold thread showing how far down the page you are. */
export function Masthead({ activeTab, setActiveTab }) {
  const { scrollY, scrollYProgress } = useScroll();
  const [compact, setCompact] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setCompact(y > 24));

  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-md border-b border-line">
      <div className={`page flex items-center justify-between gap-6 transition-[height] duration-300 ${compact ? 'h-14' : 'h-[4.5rem]'}`}>
        <button type="button" onClick={() => setActiveTab('dashboard')} className="shrink-0 rounded-lg" aria-label="FinSight AI, go to Spend Analyser">
          <Logo />
        </button>
        <nav aria-label="Modules" className="hidden md:flex items-center gap-1 min-w-0">
          {NAV_ITEMS.map((item) => {
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative min-h-10 px-3 lg:px-3.5 rounded-control text-sm font-semibold whitespace-nowrap transition-colors ${
                  active ? 'text-on-jade' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {active && <m.span layoutId="nav-ink" className="absolute inset-0 rounded-control bg-jade" transition={SPRING} />}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <AccountMenu />
      </div>
      <m.div className="absolute left-0 right-0 -bottom-px h-0.5 bg-gold origin-left" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    </header>
  );
}

/** Bottom dock on phones, where the top navigation does not fit. */
export function BottomDock({ activeTab, setActiveTab }) {
  return (
    <nav
      aria-label="Modules"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeTab;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.75rem] text-[0.6875rem] font-semibold ${
                active ? 'text-jade' : 'text-ink-3'
              }`}
            >
              {active && <m.span layoutId="dock-ink" className="absolute top-0 inset-x-3 h-0.5 bg-jade rounded-full" transition={SPRING} />}
              <Icon className="w-5 h-5" aria-hidden="true" />
              {item.short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
