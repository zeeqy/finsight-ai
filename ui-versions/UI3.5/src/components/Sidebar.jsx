import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Landmark, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AccountDataModal from './AccountDataModal';
import ThemeSwitch, { ThemeIcons } from './ThemeSwitch';
import CommitmentsModal, { COMMITMENTS_CHANGED } from './CommitmentsModal';
import Logo, { Mark } from './ui/Logo';
import { NAV } from '../lib/modules';
import { SPRING } from '../lib/motion';

const initialOf = (user) => (user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U');
const incomeOf = (user) => Number(user?.monthly_income || 0).toLocaleString('en-MY');

function Avatar({ user }) {
  return (
    <span className="w-10 h-10 shrink-0 rounded-full bg-[var(--mark-bg)] text-[var(--mark-line)] font-display font-bold flex items-center justify-center">
      {initialOf(user)}
    </span>
  );
}

const announceCommitments = () => window.dispatchEvent(new Event(COMMITMENTS_CHANGED));

/** Opens the commitments dialog; pages that show a surplus listen for the change event. */
function CommitmentsButton({ className }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Landmark className="w-4 h-4" aria-hidden="true" />
        My commitments
      </button>
      {open && <CommitmentsModal onClose={close} onChanged={announceCommitments} />}
    </>
  );
}

/** Opens the privacy notice with download and delete. */
function DataButton({ className, onOpen }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className={className}
      >
        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
        Your data and privacy
      </button>
      {open && <AccountDataModal onClose={close} />}
    </>
  );
}

/** Avatar button with a small menu, for the icon rail and the phone bar where the full card does not fit. */
function AccountMenu({ alignLeft = false }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showCommitments, setShowCommitments] = useState(false);
  const closeCommitments = useCallback(() => setShowCommitments(false), []);
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

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Account menu"
        className="rounded-full transition-transform hover:scale-105 active:scale-95"
      >
        <Avatar user={user} />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            className={`absolute w-72 card glass-strong shadow-lift p-4 z-40 ${alignLeft ? 'left-0 bottom-12 origin-bottom-left' : 'right-0 top-12 origin-top-right'}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={SPRING}
          >
            <p className="font-semibold truncate">{user?.full_name || 'Signed in'}</p>
            <p className="t-note truncate">{user?.email}</p>
            {user?.monthly_income ? <p className="t-note mt-2">Income on profile: RM {incomeOf(user)} a month</p> : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowCommitments(true);
              }}
              className="btn btn-quiet w-full mt-3"
            >
              <Landmark className="w-4 h-4" aria-hidden="true" />
              My commitments
            </button>
            <DataButton className="btn btn-quiet w-full mt-2" />
            <ThemeSwitch className="mt-3" />
            <button type="button" onClick={logout} className="btn btn-danger-quiet w-full mt-3">
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </m.div>
        )}
      </AnimatePresence>
      {showCommitments && <CommitmentsModal onClose={closeCommitments} onChanged={announceCommitments} />}
    </div>
  );
}

function NavItem({ item, active, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      className="group relative w-full flex flex-col lg:flex-row items-center gap-1 lg:gap-3 px-1.5 lg:px-2.5 py-2 lg:py-2.5 rounded-xl text-center lg:text-left hover:bg-surface/40 transition-colors"
    >
      {active && <m.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-surface shadow-soft" transition={SPRING} />}
      <span className={`relative chip tone-${item.tone} transition-[colors,transform] duration-300 group-hover:-rotate-6 group-hover:scale-110 ${active ? '!bg-[var(--tone)] !text-[var(--on-tone)]' : '!bg-surface'}`}>
        <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
      </span>
      <span className="relative min-w-0">
        <span className="hidden lg:block text-sm font-bold leading-tight text-ink">{item.label}</span>
        <span className="hidden lg:block text-[0.8125rem] leading-tight mt-0.5 text-ink-2 truncate">{item.hint}</span>
        <span className="lg:hidden block text-xs font-semibold text-ink">{item.short}</span>
      </span>
    </button>
  );
}

/** Module list on the left: icons with short names on tablets, the full list from laptop width up. */
export default function Sidebar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  return (
    <aside className="hidden md:flex flex-col sticky top-0 h-dvh shrink-0 w-[5.75rem] lg:w-[18rem] bg-bar border-r border-bar-line on-bar transition-colors duration-300 z-20">
      <button
        type="button"
        onClick={() => setActiveTab('home')}
        className="flex justify-center lg:justify-start px-4 pt-5 pb-4 rounded-lg"
        aria-label="FinSight AI, go to Home"
      >
        <span className="lg:hidden">
          <Mark className="w-10 h-10" />
        </span>
        <span className="hidden lg:block">
          <Logo />
        </span>
      </button>

      <nav aria-label="Modules" className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2 lg:px-3 space-y-1">
        {NAV.map((item) => (
          <NavItem key={item.id} item={item} active={item.id === activeTab} onSelect={setActiveTab} />
        ))}
      </nav>

      <div className="p-3">
        <div className="lg:hidden flex justify-center">
          <AccountMenu alignLeft />
        </div>
        <div className="hidden lg:block rounded-xl bg-surface p-3 shadow-soft">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar user={user} />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{user?.full_name || 'Signed in'}</p>
              {user?.monthly_income ? (
                <p className="t-note flex items-center gap-1 num">
                  <Wallet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  RM {incomeOf(user)} a month
                </p>
              ) : (
                <p className="t-note truncate">{user?.email}</p>
              )}
            </div>
          </div>
          <CommitmentsButton className="btn btn-quiet btn-sm w-full mt-2.5" />
          <DataButton className="btn btn-quiet btn-sm w-full mt-1.5" />
          <ThemeIcons className="mt-1.5" />
          <button type="button" onClick={logout} className="btn btn-danger-quiet btn-sm w-full mt-1.5">
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Brand and account on phones, where the sidebar becomes the bottom bar. */
export function PhoneBar() {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-bar/85 on-bar border-b border-bar-line backdrop-blur-md">
      <div className="px-4 h-14 flex items-center justify-between">
        <Logo />
        <AccountMenu />
      </div>
    </header>
  );
}

export function BottomBar({ activeTab, setActiveTab }) {
  return (
    <nav aria-label="Modules" className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong !border-x-0 !border-b-0 border-t pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-7">
        {NAV.map((item) => {
          const active = item.id === activeTab;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative tone-${item.tone} flex flex-col items-center justify-center gap-0.5 min-h-[3.75rem] text-[0.6875rem] font-semibold ${
                active ? 'text-[var(--tone)]' : 'text-ink-3'
              }`}
            >
              {active && <m.span layoutId="bar-pill" className="absolute top-0 inset-x-3 h-[3px] rounded-full bg-[var(--tone)]" transition={SPRING} />}
              <Icon className="w-5 h-5" aria-hidden="true" />
              {item.short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
