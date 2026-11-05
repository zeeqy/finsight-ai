import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavProvider } from './context/NavContext';
import Sidebar, { BottomBar, PhoneBar } from './components/Sidebar';
import ServiceStatus from './components/ServiceStatus';
import { ConfirmProvider } from './components/ui/Modal';
import { Loading } from './components/ui/Controls';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { EASE } from './lib/motion';

// Module pages load on demand, so the login screen does not download the charts library
const pageLoaders = {
  dashboard: () => import('./pages/DashboardPage'),
  advisor: () => import('./pages/AdvisorPage'),
  loan: () => import('./pages/LoanPage'),
  goals: () => import('./pages/GoalsPlannerPage'),
  insurance: () => import('./pages/InsurancePage'),
  health: () => import('./pages/HealthPage'),
};

const PAGES = Object.fromEntries(Object.entries(pageLoaders).map(([id, load]) => [id, lazy(load)]));

const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default);

function MainApp() {
  const { isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [activeTab, setActiveTab] = useState('dashboard'); // key of PAGES
  const Page = PAGES[activeTab];

  useEffect(() => {
    window.scrollTo({ top: 0 });
    // On the root, so dialogs opened in a portal pick up the module's colour too
    document.documentElement.dataset.module = activeTab;
  }, [activeTab]);

  // Once signed in, fetch the other pages in the background so switching feels instant
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = setTimeout(() => Object.values(pageLoaders).forEach((load) => load()), 1200);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <AnimatePresence mode="wait">
        <m.div key={authView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {authView === 'register' ? (
            <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
          ) : (
            <LoginPage onSwitchToRegister={() => setAuthView('register')} />
          )}
        </m.div>
      </AnimatePresence>
    );
  }

  return (
    <NavProvider value={setActiveTab}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 btn btn-accent">
        Skip to content
      </a>
      <div className="min-h-dvh flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 min-w-0 flex flex-col">
          <PhoneBar />
          <main id="main" className="flex-1 flex flex-col">
            <ServiceStatus>
              <m.div key={activeTab} className="flex-1" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
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

export default function App() {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <ConfirmProvider>
            <MainApp />
          </ConfirmProvider>
        </AuthProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
