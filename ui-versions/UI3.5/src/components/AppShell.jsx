import React, { Suspense, lazy, useEffect, useState } from 'react';
import { m, useScroll, useSpring } from 'motion/react';
import { NavProvider } from '../context/NavContext';
import Sidebar, { BottomBar, PhoneBar } from './Sidebar';
import ServiceStatus from './ServiceStatus';
import { Loading } from './ui/Controls';
import { EASE } from '../lib/motion';

// Module pages load on demand, so the login screen does not download the charts library
const pageLoaders = {
  home: () => import('../pages/HomePage'),
  dashboard: () => import('../pages/DashboardPage'),
  advisor: () => import('../pages/AdvisorPage'),
  loan: () => import('../pages/LoanPage'),
  goals: () => import('../pages/GoalsPlannerPage'),
  insurance: () => import('../pages/InsurancePage'),
  health: () => import('../pages/HealthPage'),
};

const PAGES = Object.fromEntries(Object.entries(pageLoaders).map(([id, load]) => [id, lazy(load)]));

/** A thin line in the module's colour that fills as the page scrolls. Decorative: nothing waits for it. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 40, mass: 0.4 });
  return <m.div aria-hidden="true" style={{ scaleX }} className="fixed top-0 inset-x-0 h-[3px] origin-left bg-accent z-50 pointer-events-none" />;
}

/**
 * Everything after sign-in: navigation, the scroll line and the module pages. Its own chunk, so the
 * sign-in screen (the first paint most visitors see) stays small.
 */
export default function AppShell() {
  const [activeTab, setActiveTab] = useState('home'); // key of PAGES
  const Page = PAGES[activeTab];

  useEffect(() => {
    window.scrollTo({ top: 0 });
    // On the root, so dialogs opened in a portal pick up the module's colour too
    document.documentElement.dataset.module = activeTab;
  }, [activeTab]);

  // Fetch the other pages in the background so switching feels instant
  useEffect(() => {
    const timer = setTimeout(() => Object.values(pageLoaders).forEach((load) => load()), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <NavProvider value={setActiveTab}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 btn btn-accent">
        Skip to content
      </a>
      <ScrollProgress />
      <div className="min-h-dvh flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 min-w-0 flex flex-col">
          <PhoneBar />
          <main id="main" className="flex-1 flex flex-col">
            <ServiceStatus>
              <m.div key={activeTab} className="flex-1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                <Suspense fallback={<Loading>Opening this module...</Loading>}>
                  <Page />
                </Suspense>
              </m.div>
            </ServiceStatus>
          </main>
        </div>
      </div>
      <BottomBar activeTab={activeTab} setActiveTab={setActiveTab} />
    </NavProvider>
  );
}
