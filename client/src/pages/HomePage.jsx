import React, { useEffect, useMemo, useRef, useState } from 'react';
import { m, useScroll, useTransform } from 'motion/react';
import { ArrowRight, MessagesSquare, Moon, Sparkles, Sun, Sunrise } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGoTo } from '../context/NavContext';
import Oyen from '../components/mascot/Oyen';
import { Money } from '../components/ui/RollingNumber';
import { Meter } from '../components/ui/Controls';
import { MODULES } from '../lib/modules';
import { EASE } from '../lib/motion';
import { OYEN_NAME, oyen } from '../lib/oyen';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BAND_TAG = { Healthy: 'tag-ok', Coping: 'tag-warn', Vulnerable: 'tag-danger' };
const FEAS_RANK = { 'On Track': 0, 'At Risk': 1, 'Not Feasible': 2 };
const rm0 = (n) => `RM ${Math.round(Number(n) || 0).toLocaleString('en-MY')}`;

// Name parts that are titles or very common first parts, so "Muhammad Haziq" is greeted as Haziq
const SKIP_NAMES = new Set(['muhammad', 'muhamad', 'mohammad', 'mohamad', 'mohd', 'muhd', 'nur', 'nurul', 'siti', 'dr', 'ts']);
function firstName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  const pick = parts.find((p) => !SKIP_NAMES.has(p.toLowerCase())) || parts[0] || '';
  return pick ? pick[0].toUpperCase() + pick.slice(1).toLowerCase() : '';
}

function greeting(hour) {
  if (hour < 12) return { text: 'Good morning', icon: Sunrise };
  if (hour < 18) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Moon };
}

/** Everything Home shows, from the same endpoints the modules use. Missing pieces stay null. */
function useOverview() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    const get = (url) =>
      authFetch(url)
        .then((r) => r.json())
        .catch(() => null);
    (async () => {
      const [periods, health, goals, loans, insurance] = await Promise.all([
        get('/api/transactions/periods'),
        get('/api/profile/health'),
        get('/api/goals'),
        get('/api/loan/history'),
        get('/api/insurance/history'),
      ]);
      const list = periods?.data || periods?.periods || [];
      const latest = Array.isArray(list) && list.length ? list[0] : null;
      const summary = latest ? await get(`/api/transactions/summary?year=${latest.year}&month=${latest.month}`) : null;
      if (!live) return;
      const activeGoals = (goals?.data?.goals || []).filter((g) => g.status === 'active');
      setData({
        month: latest,
        kpis: summary?.kpis || summary?.data?.kpis || null,
        health: health?.success ? health.data : null,
        goals: { active: activeGoals, summary: goals?.data?.summary || null },
        loan: loans?.data?.[0] || null,
        insurance: insurance?.data?.[0] || null,
      });
    })();
    return () => {
      live = false;
    };
  }, [authFetch]);

  return data;
}

/** The one thing worth doing next, from what is missing or needs care. */
function nextStep(d) {
  if (!d) return null;
  if (!d.month) return { label: 'Upload your first statement', to: 'dashboard' };
  if (d.health && d.health.emergency_savings === null) return { label: 'Add your emergency savings', to: 'health' };
  if (!d.goals.active.length) return { label: 'Plan your first goal', to: 'goals' };
  const weakest = [...d.goals.active].sort((a, b) => (FEAS_RANK[b.feasibility] ?? 0) - (FEAS_RANK[a.feasibility] ?? 0))[0];
  if (weakest && FEAS_RANK[weakest.feasibility] > 0) return { label: `See why "${weakest.title}" is ${weakest.feasibility.toLowerCase()}`, to: 'goals' };
  return { label: 'Check a big purchase first', to: 'health' };
}

/** What Oyen says in his bubble: built from the figures, never made up. */
function oyenLine(d) {
  if (!d) return 'One moment, reading your figures...';
  if (!d.month || !d.kpis) return `Hi! I'm ${OYEN_NAME}. Upload a bank statement and I'll show you where your money goes.`;
  const monthName = MONTHS[d.month.month - 1];
  const { total_monthly_spend: spent, monthly_income: income } = d.kpis;
  if (income > 0 && spent > income) return `You spent ${rm0(spent - income)} more than you earned in ${monthName}. Let's find out where it went.`;
  const pct = income > 0 ? Math.round((spent / income) * 100) : null;
  const score = d.health?.health?.score;
  return `In ${monthName} you spent ${rm0(spent)}${pct !== null ? `, ${pct}% of your income` : ''}.${score !== null && score !== undefined ? ` Your health index is ${score}, ${d.health.health.band.toLowerCase()}.` : ''}`;
}

/** One short fact per module for its tile. */
function tileFact(id, d) {
  if (!d) return '';
  const g = d.goals.active;
  switch (id) {
    case 'dashboard':
      return d.kpis ? `${rm0(d.kpis.total_monthly_spend)} spent in ${MONTHS[d.month.month - 1]}` : 'No statement yet';
    case 'advisor':
      return 'Ask about your money';
    case 'loan':
      return d.loan ? `Last check: ${d.loan.loan_type} loan, ${d.loan.overall_verdict}` : 'No loan checked yet';
    case 'goals':
      return g.length ? `${g.filter((x) => x.feasibility === 'On Track').length} of ${g.length} goals on track` : 'No goals yet';
    case 'insurance':
      return d.insurance ? `Last check: ${d.insurance.risk_tier} risk` : 'Not checked yet';
    case 'health':
      return d.health?.health?.score !== null && d.health?.health?.score !== undefined ? `${d.health.health.score} / 100, ${d.health.health.band}` : 'Add your figures';
    default:
      return '';
  }
}

function Stat({ label, children, note, className = '' }) {
  return (
    <div className={`card p-4 min-w-0 ${className}`}>
      <p className="t-label">{label}</p>
      <div className="mt-1">{children}</div>
      {note && <div className="t-note mt-1.5">{note}</div>}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const goTo = useGoTo();
  const d = useOverview();
  const hero = useRef(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  // Decorative parallax only: the stage drifts and the sky glow slides as the page scrolls
  const stageY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const glowX = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);

  // Read the clock once per visit, not on every render
  const [now] = useState(() => new Date());
  const hello = greeting(now.getHours());
  const HelloIcon = hello.icon;
  const name = firstName(user?.full_name);
  const step = nextStep(d);
  const line = oyenLine(d);
  const today = useMemo(() => now.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' }), [now]);

  // Oyen reacts to the month once the figures arrive
  useEffect(() => {
    if (!d?.kpis) return undefined;
    const over = d.kpis.monthly_income > 0 && d.kpis.total_monthly_spend > d.kpis.monthly_income;
    const t1 = setTimeout(() => oyen(over ? 'worry' : d.health?.health?.band === 'Healthy' ? 'hop' : 'idle'), 3800);
    const t2 = over ? setTimeout(() => oyen('idle'), 7500) : null;
    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [d]);

  const k = d?.kpis;
  const spentPct = k && k.monthly_income > 0 ? (k.total_monthly_spend / k.monthly_income) * 100 : null;
  const score = d?.health?.health?.score;

  return (
    <div className="pb-28 md:pb-10">
      <section ref={hero} aria-labelledby="home-title" className="relative overflow-hidden">
        {/* Soft sky glow behind the hero, drifting with scroll */}
        <m.div aria-hidden="true" style={{ x: glowX }} className="pointer-events-none absolute -top-24 right-[-10%] w-[70%] h-[34rem] rounded-full stage opacity-50 blur-3xl" />
        {/* Phones: greeting, Oyen, figures. Wide screens: greeting and figures left, Oyen right */}
        <div className="page relative pt-6 md:pt-9 pb-6 grid gap-5 lg:gap-x-8 lg:gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            <m.p className="t-label flex items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <span className="chip tone-gold !w-7 !h-7 !rounded-lg">
                <HelloIcon className="w-4 h-4" aria-hidden="true" />
              </span>
              {today}
            </m.p>
            <m.h1
              id="home-title"
              className="t-display mt-3"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
            >
              {hello.text}
              {name ? `, ${name}` : ''}
            </m.h1>
            <m.p className="mt-3 text-lg text-ink-2 max-w-[48ch]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.15 }}>
              Here is your money at a glance. Everything below opens the module it comes from.
            </m.p>
          </div>

          {/* Oyen's stage: right on wide screens, under the greeting on phones */}
          <m.div style={{ y: stageY }} className="relative lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center">
            <m.div
              className="relative stage rounded-[1.75rem] h-64 sm:h-80 lg:h-[27rem] overflow-hidden shadow-lift"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
            >
              <div aria-hidden="true" className="absolute inset-x-[18%] bottom-[6%] h-[9%] rounded-[50%] bg-[var(--stage-ring)] opacity-60 blur-md" />
              <Oyen className="absolute inset-0" />
            </m.div>
            <m.div
              role="status"
              aria-live="polite"
              className="glass-strong shadow-soft rounded-2xl p-3.5 text-sm mt-3 sm:mt-0 sm:max-w-[16rem] sm:absolute sm:left-4 sm:bottom-4 sm:rounded-bl-md lg:-left-6"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.6 }}
            >
              <p className="font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                {OYEN_NAME}
              </p>
              <p className="mt-0.5 text-ink-2">{line}</p>
            </m.div>
          </m.div>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label={d?.month ? `Spent in ${MONTHS[d.month.month - 1]}` : 'Spent this month'} note={spentPct !== null ? `${Math.round(spentPct)}% of your income` : 'Upload a statement to see it'}>
                {k ? <Money value={k.total_monthly_spend} decimals={0} className="t-figure text-2xl" /> : <span className="t-figure text-2xl text-ink-3">RM -</span>}
                {spentPct !== null && (
                  <div className="mt-2">
                    <Meter value={Math.min(100, spentPct)} tone={spentPct > 100 ? 'danger' : spentPct > 80 ? 'warn' : 'ok'} label="Share of income spent" />
                  </div>
                )}
              </Stat>
              <Stat label="Left after spending" note={k ? 'Income minus this month\'s spending' : 'Needs a statement'}>
                {k ? <Money value={k.net_savings} decimals={0} className={`t-figure text-2xl ${k.net_savings < 0 ? 'text-danger' : ''}`} /> : <span className="t-figure text-2xl text-ink-3">RM -</span>}
              </Stat>
              <Stat
                className="col-span-2 sm:col-span-1"
                label="Health index"
                note={
                  score !== null && score !== undefined ? (
                    <span className={`tag ${BAND_TAG[d.health.health.band] || 'tag-plain'}`}>{d.health.health.band}</span>
                  ) : (
                    'Built from every module'
                  )
                }
              >
                <span className="t-figure text-2xl num">{score !== null && score !== undefined ? `${score} / 100` : '-'}</span>
              </Stat>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {step && (
                <button type="button" onClick={() => goTo(step.to)} className="btn btn-primary">
                  {step.label}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => goTo('advisor')} className="btn btn-quiet">
                <MessagesSquare className="w-4 h-4" aria-hidden="true" />
                Ask {OYEN_NAME}
              </button>
            </div>
          </div>

        </div>
      </section>

      <section aria-labelledby="modules-title" className="page mt-4">
        <h2 id="modules-title" className="t-section">
          Your modules
        </h2>
        <p className="t-note">Pick up where you left off</p>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {MODULES.map((item, i) => {
            const Icon = item.icon;
            return (
              <m.li key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.2 + i * 0.05 }}>
                <button
                  type="button"
                  onClick={() => goTo(item.id)}
                  className={`group card card-lift tone-${item.tone} w-full h-full text-left p-4 flex items-start gap-3`}
                >
                  <span className="chip chip-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="t-section">{item.label}</span>
                      <ArrowRight className="w-4 h-4 text-ink-3 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[var(--tone)]" aria-hidden="true" />
                    </span>
                    <span className="block t-note">{item.hint}</span>
                    <span className="block mt-2 text-sm font-semibold text-[var(--tone)] num">{tileFact(item.id, d) || ' '}</span>
                  </span>
                </button>
              </m.li>
            );
          })}
        </ul>
        <p className="t-note mt-6">Estimates only, not financial advice. Every figure comes from your own statements and checks.</p>
      </section>
    </div>
  );
}
