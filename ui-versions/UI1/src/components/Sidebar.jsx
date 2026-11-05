import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  BotMessageSquare,
  Landmark,
  Target,
  ShieldAlert,
  LogOut,
  Wallet,
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Spend Analyser',
      sublabel: 'Dashboard & Statement Parser',
      icon: LayoutDashboard,
      active: activeTab === 'dashboard',
      badge: 'Module 1',
    },
    {
      id: 'advisor',
      label: 'AI Financial Advisor',
      sublabel: 'Contextual Chat Copilot',
      icon: BotMessageSquare,
      active: activeTab === 'advisor',
      badge: 'Module 2',
    },
    {
      id: 'loan',
      label: 'Loan Default Predictor',
      sublabel: 'Affordability, DSR & Risk',
      icon: Landmark,
      active: activeTab === 'loan',
      badge: 'Module 3',
    },
    {
      id: 'goals',
      label: 'Life Goals Planner',
      sublabel: 'Kahwin, Haji, House, Car',
      icon: Target,
      active: activeTab === 'goals',
      badge: 'Module 4',
    },
    {
      id: 'insurance',
      label: 'Insurance Risk',
      sublabel: 'Lifestyle Risk & SHAP',
      icon: ShieldAlert,
      active: activeTab === 'insurance',
      badge: 'Module 5',
    },
  ];

  return (
    <aside className="w-72 bg-white border-r border-[#E8EAF0] flex flex-col justify-between shrink-0 h-screen sticky top-0 z-20 select-none shadow-sm">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-[#E8EAF0] flex items-center gap-3 bg-white">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFC80A] via-[#FFD43B] to-[#E6A800] flex items-center justify-center shadow-lg shadow-[#FFC80A]/25 text-black font-black text-xl shrink-0">
            <span>F</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-gray-900 font-sans">
                FinSight
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#FFC80A] text-black tracking-wide">
                AI
              </span>
            </div>
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <span>Personal Finance Analytics</span>
            </p>
          </div>
        </div>

        {/* Primary Navigation */}
        <div className="px-3 py-5">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
            Core Modules
          </p>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all group ${
                    item.active
                      ? 'bg-[#FFC80A]/10 text-gray-900 border border-[#FFC80A]/40 shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg transition-colors ${
                        item.active
                          ? 'bg-[#FFC80A] text-black shadow-md shadow-[#FFC80A]/20'
                          : 'bg-gray-100 text-gray-400 group-hover:text-gray-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className={`text-xs font-bold leading-tight ${item.active ? 'text-gray-900' : 'text-gray-600'}`}>
                        {item.label}
                      </div>
                      <div className="text-[10px] text-gray-400 leading-tight mt-0.5 truncate">
                        {item.sublabel}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                      item.active
                        ? 'bg-[#FFC80A]/20 text-[#B8900A] border border-[#FFC80A]/30'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* User Footer Profile & Logout */}
      <div className="p-3.5 border-t border-[#E8EAF0] bg-gray-50">
        <div className="p-3 rounded-xl bg-white border border-[#E8EAF0] flex items-center justify-between mb-2.5 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FFC80A] to-[#E6A800] flex items-center justify-center text-black font-extrabold text-sm shrink-0 shadow-sm">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-gray-900 truncate leading-tight">
                {user?.full_name || 'Guest User'}
              </p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">
                {user?.email || 'Logged in'}
              </p>
              {user?.monthly_income ? (
                <div className="flex items-center gap-1 text-[10px] text-[#B8900A] font-mono font-semibold mt-1">
                  <Wallet className="w-3 h-3" />
                  <span>RM {Number(user.monthly_income).toLocaleString()}/mo</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
