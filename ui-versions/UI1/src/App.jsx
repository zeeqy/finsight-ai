import React, { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Module pages load on demand, so the login screen does not download the charts library
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'));
const LoanPage = lazy(() => import('./pages/LoanPage'));
const GoalsPlannerPage = lazy(() => import('./pages/GoalsPlannerPage'));
const InsurancePage = lazy(() => import('./pages/InsurancePage'));

const PAGE_HEADERS = {
  dashboard: {
    title: 'Spend Analyser',
    subtitle: 'Upload Maybank or CIMB statements to see where your money goes, set budgets and catch unusual spending',
  },
  advisor: {
    title: 'AI Financial Advisor',
    subtitle: 'Ask about your money: the advisor reads your spending, life goals, loan and insurance checks',
  },
  loan: {
    title: 'Loan Default Predictor',
    subtitle: 'Check a personal, car or house loan before you apply: instalment, DSR and default risk',
  },
  goals: {
    title: 'Life Goals Planner',
    subtitle: 'Plan for Kahwin, children, Haji, a house or a car using your real monthly surplus',
  },
  insurance: {
    title: 'Insurance Risk Predictor',
    subtitle: 'See how age, BMI and smoking shape your insurance risk, with a factor-by-factor explanation',
  },
};

function MainApp() {
  const { isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [activeTab, setActiveTab] = useState('dashboard'); // key of PAGE_HEADERS

  // If not authenticated, show Login or Register page
  if (!isAuthenticated) {
    if (authView === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
  }

  return (
    <div className="flex min-h-screen bg-[#0B0D13] text-[#F3F4F6] font-sans">
      {/* Fixed Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={PAGE_HEADERS[activeTab].title}
          subtitle={PAGE_HEADERS[activeTab].subtitle}
        />

        <main className="flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="p-8 flex items-center justify-center text-[#94A3B8] text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#FFC80A]" /> Loading...
              </div>
            }
          >
            {activeTab === 'dashboard' && <DashboardPage />}
            {activeTab === 'advisor' && <AdvisorPage />}
            {activeTab === 'loan' && <LoanPage />}
            {activeTab === 'goals' && <GoalsPlannerPage />}
            {activeTab === 'insurance' && <InsurancePage />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
