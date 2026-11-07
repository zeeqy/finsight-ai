import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from './AuthLayout';
import { Field, MoneyInput, Notice } from '../components/ui/Controls';
import PrivacyNotice from '../components/PrivacyNotice';
import TermsModal from '../components/TermsOfUse';

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
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.full_name.trim() || !formData.email.trim() || !formData.password) {
      setError('Fill in your name, email and password.');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    const age = formData.age === '' ? null : Number(formData.age);
    if (age !== null && !(Number.isInteger(age) && age >= 18 && age <= 100)) {
      setError('FinSight is for adults: enter an age from 18 to 100.');
      return;
    }

    if (!accepted) {
      setError('Tick the box to confirm you are 18 or older and agree to the Terms of use.');
      return;
    }

    try {
      await register({
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        monthly_income: parseFloat(formData.monthly_income) || 0,
        age: parseInt(formData.age, 10) || null,
        accept_terms: true,
      });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    }
  };

  return (
    <AuthLayout
      headline="Start with one bank statement"
      lead="Upload your bank statement and FinSight sorts your spending. Your income and age set up the loan and goal plans."
    >
      <h2 className="t-section">Create your account</h2>
      <Notice tone="danger" show={Boolean(error)} className="mt-3">
        {error}
      </Notice>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
        <Field label="Full name">
          <input type="text" name="full_name" autoComplete="name" value={formData.full_name} onChange={handleChange} placeholder="Your name" required />
        </Field>
        <Field label="Email">
          <input type="email" name="email" autoComplete="email" value={formData.email} onChange={handleChange} placeholder="email@example.com" required />
        </Field>
        <Field label="Password" hint="At least 8 characters, not a common password">
          <input type="password" name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} required />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <Field label="Monthly income" prefix="RM">
            <MoneyInput name="monthly_income" value={formData.monthly_income} onChange={handleChange} required />
          </Field>
          <Field label="Age">
            <input type="number" name="age" min="18" max="100" step="1" value={formData.age} onChange={handleChange} />
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)]" />
          <span>
            I am 18 or older and agree to the{' '}
            <button type="button" onClick={() => setShowTerms(true)} className="link">
              Terms of use
            </button>
            . I understand FinSight gives estimates, not financial advice.
          </span>
        </label>
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Creating your account...' : 'Create account'}
        </button>
      </form>

      <details className="mt-4 rounded-xl border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold">How FinSight uses your data</summary>
        <PrivacyNotice className="mt-3" />
      </details>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}

      <p className="t-note mt-5 text-center">
        Already registered?{' '}
        <button type="button" onClick={onSwitchToLogin} className="link">
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
}
