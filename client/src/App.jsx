import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfirmProvider } from './components/ui/Modal';
import { Loading } from './components/ui/Controls';
import LoginPage from './pages/LoginPage';

// Only the sign-in screen is in the first download; registering and the signed-in app load on demand
const loadShell = () => import('./components/AppShell');
const AppShell = lazy(loadShell);
const RegisterPage = lazy(() => import('./pages/RegisterPage'));

const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default);

function MainApp() {
  const { isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'

  // Fetch the app shell once the sign-in screen has settled, so signing in feels instant
  useEffect(() => {
    if (isAuthenticated) return undefined;
    const timer = setTimeout(loadShell, 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      // initial={false}: the first screen paints at once instead of waiting for the animation code
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={authView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {authView === 'register' ? (
            <Suspense fallback={<Loading>Opening the sign-up form...</Loading>}>
              <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
            </Suspense>
          ) : (
            <LoginPage onSwitchToRegister={() => setAuthView('register')} />
          )}
        </m.div>
      </AnimatePresence>
    );
  }

  return (
    <Suspense fallback={<Loading>Opening FinSight AI...</Loading>}>
      <AppShell />
    </Suspense>
  );
}

export default function App() {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <AuthProvider>
            <ConfirmProvider>
              <MainApp />
            </ConfirmProvider>
          </AuthProvider>
        </ThemeProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
