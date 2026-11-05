import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, DollarSign, Calendar, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';

export default function RegisterPage({ onSwitchToLogin }) {
  const { register, loading } = useAuth();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    monthly_income: '4500',
    age: '24',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.full_name.trim() || !formData.email.trim() || !formData.password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      await register({
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        monthly_income: parseFloat(formData.monthly_income) || 0,
        age: parseInt(formData.age, 10) || null,
      });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0B0D13] relative overflow-hidden">
      {/* Maybank gold ambient glow */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#FFC80A]/8 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-[#FFC80A]/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFC80A] via-[#FFD43B] to-[#E6A800] shadow-xl shadow-[#FFC80A]/20 text-black font-black text-2xl mb-3">
            F
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Create FinSight Account</h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Maybank-Powered Financial Analytics & AI Copilot
          </p>
        </div>

        <div className="bg-[#141824]/90 border border-[#232A3B] rounded-2xl p-7 backdrop-blur-xl shadow-2xl">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Muhammad Haziq"
                  className="w-full pl-10 pr-4 py-2 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min. 6 characters"
                  className="w-full pl-10 pr-4 py-2 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] transition"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Monthly Income (RM)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748B] text-xs font-mono">
                    RM
                  </div>
                  <input
                    type="number"
                    name="monthly_income"
                    value={formData.monthly_income}
                    onChange={handleChange}
                    placeholder="4500"
                    className="w-full pl-9 pr-3 py-2 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Age
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748B]">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    placeholder="24"
                    className="w-full pl-9 pr-3 py-2 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] transition"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] text-black font-extrabold text-xs shadow-lg shadow-[#FFC80A]/20 transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <span>{loading ? 'Creating Profile...' : 'Complete Registration'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-xs text-[#64748B]">
              Already registered?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-[#FFC80A] hover:underline font-bold"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
