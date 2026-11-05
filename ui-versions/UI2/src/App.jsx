import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BottomDock, Masthead } from './components/Masthead';
import ServiceStatus from './components/ServiceStatus';
import { ConfirmProvider } from './components/ui/Modal';
import { Loading } from './components/ui/Controls';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { EASE } from './lib/motion';

// Module pages load on demand, so the login screen does not download the charts library
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'));
const LoanPage = lazy(() => import('./pages/LoanPage'));
const GoalsPlannerPage = lazy(() => import('./pages/GoalsPlannerPage'));
const InsurancePage = lazy(() => import('./pages/InsurancePage'));

const PAGES = {
  dashboard: DashboardPage,
  advisor: AdvisorPage,
  loan: LoanPage,
  goals: GoalsPlannerPage,
  insurance: InsurancePage,
};

const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default);

function MainApp() {
  const { isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [activeTab, setActiveTab] = useState('dashboard'); // key of PAGES
  const Page = PAGES[activeTab];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);

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
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 btn btn-jade">
        Skip to content
      </a>
      <Masthead activeTab={activeTab} setActiveTab={setActiveTab} />
      <main id="main" className="flex-1">
        <ServiceStatus>
          <AnimatePresence mode="wait">
            <m.div
              key={activeTab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <Suspense fallback={<Loading>Opening this module...</Loading>}>
                <Page />
              </Suspense>
            </m.div>
          </AnimatePresence>
        </ServiceStatus>
      </main>
      <BottomDock activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
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
