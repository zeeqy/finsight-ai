import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from './AuthLayout';
import { Field, MoneyInput, Notice } from '../components/ui/Controls';
import PrivacyNotice from '../components/PrivacyNotice';

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
      setError('Fill in your name, email and password.');
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
        <Field label="Password" hint="At least 6 characters">
          <input type="password" name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} required />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <Field label="Monthly income" prefix="RM">
            <MoneyInput name="monthly_income" value={formData.monthly_income} onChange={handleChange} required />
          </Field>
          <Field label="Age">
            <input type="number" name="age" value={formData.age} onChange={handleChange} />
          </Field>
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Creating your account...' : 'Create account'}
        </button>
      </form>

      <details className="mt-4 rounded-xl border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold">How FinSight uses your data</summary>
        <PrivacyNotice className="mt-3" />
      </details>

      <p className="t-note mt-5 text-center">
        Already registered?{' '}
        <button type="button" onClick={onSwitchToLogin} className="link">
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
}
